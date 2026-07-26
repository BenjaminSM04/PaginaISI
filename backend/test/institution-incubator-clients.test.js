const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validate } = require('class-validator');
const {
  AdminIncubatorClientsController,
  IncubatorClientsController,
  IncubatorClientsService,
  normalizeIncubatorClientIds,
  normalizeIncubatorClientName,
} = require('../dist/incubator-clients/incubator-clients.module');
const {
  InstitutionService,
  normalizeSafeLogoUrl,
} = require('../dist/institution/institution.module');
const {
  CreateProjectDto,
  MANAGE_INCLUDE,
  PUBLIC_INCLUDE,
  ProjectsService,
  canonicalProjectSnapshotClientRelation,
  editableProjectSnapshot,
  projectVersionSnapshot,
  projectWithVersion,
} = require('../dist/projects/projects.module');
const { StorageService } = require('../dist/storage/storage.module');

const migration = readFileSync(
  join(__dirname, '../prisma/migrations/20260726120000_institutional_identity_incubator_clients/migration.sql'),
  'utf8',
);

const actor = {
  id: 'user-1',
  email: 'user-1@example.test',
  username: 'user-1',
  roles: ['STUDENT'],
  sessionId: 'session-1',
  emailVerifiedAt: new Date(),
};

function client(id, overrides = {}) {
  return {
    id,
    name: `Empresa ${id}`,
    logoUrl: `https://assets.example.test/${id}.png`,
    isActive: true,
    ...overrides,
  };
}

function project(overrides = {}) {
  return {
    id: 'project-1',
    slug: 'project-1',
    title: 'Proyecto de Incubadora',
    summary: 'Resumen suficientemente completo',
    description: 'Descripción suficientemente extensa para representar el proyecto.',
    coverUrl: null,
    videoUrl: null,
    repoUrl: null,
    demoUrl: null,
    subject: null,
    semester: 6,
    phase: null,
    status: 'APPROVED',
    stage: 'IN_DEVELOPMENT',
    isFeatured: false,
    isIncubator: true,
    recruiting: false,
    tags: [],
    startedAt: null,
    publishedAt: new Date('2026-07-20T00:00:00.000Z'),
    ownerId: 'owner-1',
    reviewerId: null,
    communityId: null,
    pendingVersion: null,
    technologies: [],
    members: [],
    clients: [client('client-a')],
    ...overrides,
  };
}

test('normaliza nombres empresariales y evita duplicados razonables', () => {
  assert.deepEqual(
    normalizeIncubatorClientName('  Compañía   Ágil SRL  '),
    { name: 'Compañía Ágil SRL', normalizedName: 'compania agil srl' },
  );
  assert.throws(
    () => normalizeIncubatorClientIds(['client-a', ' client-a ']),
    /No repitas clientes/,
  );
});

test('la migración aislada crea identidad, clientes y la relación muchos-a-muchos', () => {
  assert.match(migration, /CREATE TABLE "InstitutionalSettings"/);
  assert.match(migration, /Universidad Privada del Valle/);
  assert.match(migration, /CREATE TABLE "IncubatorClient"/);
  assert.match(migration, /CREATE UNIQUE INDEX "IncubatorClient_normalizedName_key"/);
  assert.match(migration, /CREATE TABLE "_IncubatorProjectClients"/);
  assert.match(migration, /REFERENCES "IncubatorClient"/);
  assert.match(migration, /REFERENCES "Project"/);
});

test('acepta logos web seguros y rechaza esquemas activos o rutas ambiguas', () => {
  assert.equal(
    normalizeSafeLogoUrl('/identidad/univalle.png'),
    '/identidad/univalle.png',
  );
  assert.equal(
    normalizeSafeLogoUrl('https://www.univalle.edu/logo.png'),
    'https://www.univalle.edu/logo.png',
  );
  assert.equal(normalizeSafeLogoUrl('javascript:alert(1)'), null);
  assert.equal(normalizeSafeLogoUrl('//evil.example/logo.png'), null);
});

test('clientIds repetidos se rechazan también en la frontera HTTP', async () => {
  const dto = Object.assign(new CreateProjectDto(), {
    title: 'Proyecto válido',
    summary: 'Resumen válido del proyecto',
    description: 'Descripción válida con más de treinta caracteres para el proyecto.',
    isIncubator: true,
    clientIds: ['client-a', 'client-a'],
  });
  const errors = await validate(dto);
  assert.equal(errors.some((error) => error.property === 'clientIds'), true);
});

test('la búsqueda filtra inactivos, pero proyectos públicos conservan sus clientes históricos', () => {
  assert.equal(Object.hasOwn(PUBLIC_INCLUDE.clients, 'where'), false);
  assert.equal(Object.hasOwn(MANAGE_INCLUDE.clients, 'where'), false);
});

test('un cliente inactivo ya vinculado se conserva, pero no puede agregarse como nuevo', async () => {
  const inactive = client('client-inactive', { isActive: false });
  const prisma = {
    incubatorClient: {
      findMany: async () => [inactive],
    },
  };
  const service = new IncubatorClientsService(prisma, {}, {});
  const existing = await service.resolveForProjectUpdate(
    ['client-inactive'],
    ['client-inactive'],
  );
  assert.equal(existing[0].id, 'client-inactive');
  await assert.rejects(
    () => service.resolveForProjectUpdate(['client-inactive'], []),
    /cliente desactivado/,
  );
});

test('el alta detecta un duplicado antes de almacenar otro logo', async () => {
  let uploads = 0;
  const service = new IncubatorClientsService(
    {
      incubatorClient: {
        findUnique: async () => ({
          id: 'client-a',
          name: 'Empresa A',
          logoUrl: 'https://assets.example.test/a.png',
          isActive: true,
        }),
      },
    },
    {},
    { upload: async () => { uploads += 1; } },
  );
  await assert.rejects(
    () => service.create(
      actor,
      { name: '  EMPRESA A ', logoUrl: 'https://assets.example.test/new.png' },
    ),
    /registro existente/,
  );
  assert.equal(uploads, 0);
});

test('alta y edición rechazan nombres que quedan demasiado cortos tras normalizar', async () => {
  const service = new IncubatorClientsService(
    {
      incubatorClient: {
        findUnique: async () => ({
          id: 'client-a',
          name: 'Empresa A',
          normalizedName: 'empresa a',
          logoUrl: 'https://assets.example.test/a.png',
          isActive: true,
        }),
      },
    },
    {},
    {},
  );
  await assert.rejects(
    () => service.create(actor, { name: ' a ', logoUrl: 'https://assets.example.test/a.png' }),
    /entre 2 y 160/,
  );
  await assert.rejects(
    () => service.update(actor, 'client-a', { name: ' a ' }),
    /entre 2 y 160/,
  );
});

test('un logo empresarial nuevo debe pertenecer a un MediaAsset del actor', async () => {
  let created = false;
  const service = new IncubatorClientsService(
    {
      incubatorClient: { findUnique: async () => null },
      $transaction: async (callback) => callback({
        incubatorClient: {
          create: async () => {
            created = true;
            return client('client-new');
          },
        },
      }),
    },
    {},
    {
      assertOwnedUnlinkedImageUrl: async () => {
        throw new Error('logo no almacenado');
      },
    },
  );
  await assert.rejects(
    () => service.create(actor, {
      name: 'Empresa externa',
      logoUrl: 'https://tracker.example.test/logo.png',
    }),
    /logo no almacenado/,
  );
  assert.equal(created, false);
});

test('editar otros datos permite reenviar exactamente el logo vigente', async () => {
  let validations = 0;
  const before = {
    ...client('client-a'),
    normalizedName: 'empresa client-a',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const tx = {
    incubatorClient: {
      update: async ({ data }) => ({ ...before, ...data }),
    },
  };
  const service = new IncubatorClientsService(
    {
      incubatorClient: { findUnique: async () => before },
      $transaction: async (callback) => callback(tx),
    },
    { record: async () => undefined },
    {
      assertOwnedUnlinkedImageUrl: async () => { validations += 1; },
    },
  );
  const updated = await service.update(actor, before.id, {
    name: 'Empresa renombrada',
    logoUrl: before.logoUrl,
  });
  assert.equal(updated.name, 'Empresa renombrada');
  assert.equal(validations, 0);
});

test('el alta pública exige autenticación y la administración exige rol ADMIN', () => {
  assert.equal(Reflect.getMetadata('isPublic', IncubatorClientsController.prototype.list), true);
  assert.equal(Reflect.getMetadata('isPublic', IncubatorClientsController.prototype.create), undefined);
  assert.deepEqual(Reflect.getMetadata('roles', AdminIncubatorClientsController), ['ADMIN']);
});

test('la identidad devuelve el contrato acordado y el fallback oficial', async () => {
  let query;
  const expected = {
    institutionName: 'Universidad Privada del Valle',
    shortName: 'Univalle',
    careerName: 'Carrera de Ingeniería de Sistemas',
    institutionalLogoUrl: 'https://www.univalle.edu/wp-content/uploads/2025/12/LOGO-cua_res-_01.png',
    careerLogoUrl: null,
    updatedAt: new Date(),
  };
  const service = new InstitutionService(
    {
      institutionalSettings: {
        upsert: async (value) => {
          query = value;
          return expected;
        },
      },
    },
    {},
    {},
  );
  assert.equal(await service.get(), expected);
  assert.equal(query.where.id, 'default');
  assert.deepEqual(Object.keys(query.select).sort(), Object.keys(expected).sort());
});

test('nombres institucionales se validan después de trim y colapso de espacios', async () => {
  const service = new InstitutionService(
    { $transaction: async () => { throw new Error('no debe escribir'); } },
    {},
    {},
  );
  for (const dto of [
    { institutionName: ' a ' },
    { shortName: ' a ' },
    { careerName: ' a ' },
  ]) {
    await assert.rejects(() => service.update(actor, dto), /entre 2 y/);
  }
});

test('si falla guardar un logo institucional, elimina solo el upload nuevo', async () => {
  const removed = [];
  const service = new InstitutionService(
    { $transaction: async () => { throw new Error('database unavailable'); } },
    {},
    {
      upload: async () => ({
        id: 'asset-new',
        url: 'https://assets.example.test/new-logo.png',
      }),
      removeRecordAndObject: async (id) => { removed.push(id); },
    },
  );
  await assert.rejects(
    () => service.uploadLogo(actor, 'institutional', { mimetype: 'image/png' }),
    /database unavailable/,
  );
  assert.deepEqual(removed, ['asset-new']);
});

test('snapshot y preview editorial incluyen clientes y clientIds', () => {
  const published = project();
  const snapshot = projectVersionSnapshot(published);
  assert.deepEqual(snapshot.clientIds, ['client-a']);
  assert.equal(snapshot.clients[0].logoUrl, 'https://assets.example.test/client-a.png');

  const pendingClient = client('client-b');
  const preview = projectWithVersion(published, {
    id: 'version-2',
    number: 2,
    status: 'PENDING',
    snapshot: {
      ...snapshot,
      clients: [pendingClient],
      clientIds: ['client-b'],
    },
    submittedAt: new Date(),
    decidedAt: null,
    reviewComment: null,
    requester: { id: 'owner-1' },
    reviewer: null,
  });
  assert.deepEqual(preview.clientIds, ['client-b']);
  assert.deepEqual(preview.clients.map((item) => item.id), ['client-b']);
});

test('snapshots heredados y metadata mutable comparan la relación solo por IDs', () => {
  const withoutClients = editableProjectSnapshot(project({ clients: [] }));
  const legacy = { ...withoutClients };
  delete legacy.clients;
  delete legacy.clientIds;
  assert.deepEqual(
    canonicalProjectSnapshotClientRelation(legacy),
    canonicalProjectSnapshotClientRelation(withoutClients),
  );

  const recorded = editableProjectSnapshot(project({
    clients: [client('client-a', {
      name: 'Nombre anterior',
      logoUrl: 'https://assets.example.test/old.png',
      isActive: true,
    })],
  }));
  const current = editableProjectSnapshot(project({
    clients: [client('client-a', {
      name: 'Nombre actualizado',
      logoUrl: 'https://assets.example.test/new.png',
      isActive: false,
    })],
  }));
  assert.deepEqual(
    canonicalProjectSnapshotClientRelation(recorded),
    canonicalProjectSnapshotClientRelation(current),
  );
});

test('candidato, publicación y rollback aplican la relación muchos-a-muchos', async () => {
  const published = project();
  const selected = [client('client-b')];
  const service = new ProjectsService({}, {}, {}, {}, {}, {});
  const candidate = service.buildVersionCandidate(
    published,
    { clientIds: ['client-b'] },
    undefined,
    undefined,
    undefined,
    selected,
    undefined,
    false,
    undefined,
  );
  assert.deepEqual(candidate.clientIds, ['client-b']);
  assert.deepEqual(candidate.clients.map((item) => item.id), ['client-b']);

  let publishedData;
  let restoredData;
  const tx = {
    projectTechnology: { deleteMany: async () => undefined },
    projectMember: { deleteMany: async () => undefined },
    catalogValue: { upsert: async () => undefined },
    project: {
      update: async ({ data }) => {
        if (data.status === 'APPROVED') publishedData = data;
        else restoredData = data;
        return { ...published, ...data, clients: selected };
      },
    },
  };
  await service.publishVersionSnapshot(tx, published, candidate, null);
  assert.deepEqual(publishedData.clients.set, [{ id: 'client-b' }]);

  await service.restoreProjectSnapshot(tx, published.id, {
    ...candidate,
    status: 'OBSERVED',
    publishedAt: null,
  });
  assert.deepEqual(restoredData.clients.set, [{ id: 'client-b' }]);

  const legacySnapshot = {
    ...candidate,
    status: 'OBSERVED',
    publishedAt: null,
  };
  delete legacySnapshot.clients;
  delete legacySnapshot.clientIds;
  await service.restoreProjectSnapshot(tx, published.id, legacySnapshot);
  assert.deepEqual(restoredData.clients.set, []);
});

test('storage protege logos actuales y logos guardados en snapshots editoriales', async () => {
  const versionQueries = [];
  const zero = { count: async () => 0 };
  const prisma = {
    profile: zero,
    community: zero,
    institutionalSettings: { count: async () => 1 },
    incubatorClient: zero,
    news: zero,
    project: zero,
    projectVersion: {
      count: async (query) => {
        versionQueries.push(query);
        return 0;
      },
    },
    article: zero,
    event: zero,
    mentorship: zero,
    ideaProposal: zero,
  };
  const service = new StorageService(prisma, {}, {}, {}, {});
  assert.equal(await service.isUrlReferenced('https://assets.example.test/logo.png'), true);
  assert.equal(
    versionQueries.some((query) => query.where.snapshot.array_contains?.[0]?.logoUrl),
    true,
  );
});

test('storage exige propiedad, imagen vigente y ausencia de FKs para logos empresariales', async () => {
  let where;
  const prisma = {
    mediaAsset: {
      findFirst: async (query) => {
        where = query.where;
        return {
          id: 'asset-logo',
          url: query.where.url,
          mime: 'image/webp',
          key: 'asset-logo.webp',
          provider: 'LOCAL',
        };
      },
    },
  };
  const service = new StorageService(prisma, {}, {}, {}, {});
  await service.assertOwnedUnlinkedImageUrl(
    actor.id,
    'https://api.example.test/uploads/asset-logo.webp',
  );
  assert.equal(where.uploaderId, actor.id);
  assert.equal(where.archivedAt, null);
  assert.deepEqual(where.mime, { startsWith: 'image/' });
  assert.equal(where.projectId, null);
  assert.equal(where.forumQuestionId, null);
  assert.equal(where.forumAnswerId, null);
  assert.equal(where.eventId, null);
  assert.equal(where.mentorshipId, null);
  assert.equal(where.ideaProposalId, null);
});
