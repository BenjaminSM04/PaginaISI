const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');

const { AuditService } = require('../dist/audit/audit.service');
const { AuthController } = require('../dist/auth/auth.controller');
const { AuthService } = require('../dist/auth/auth.service');
const { RegisterDto } = require('../dist/auth/auth.dto');
const { CatalogsService, normalizeCatalogValue } = require('../dist/catalogs/catalogs.module');
const { CreateQuestionDto } = require('../dist/forum/forum.module');
const { ProjectAuditService } = require('../dist/project-collaboration/project-audit.service');
const { UsersService } = require('../dist/users/users.service');
const { UpdateProfileDto } = require('../dist/users/users.dto');

const actor = {
  id: 'actor-1',
  email: 'anterior@isi.edu.bo',
  username: 'anterior',
  roles: ['STUDENT'],
  sessionId: 'session-1',
  emailVerifiedAt: new Date(),
};

const persistedActor = {
  id: actor.id,
  email: 'actual@isi.edu.bo',
  username: 'actual',
  profile: { fullName: 'Nombre Actual' },
  roles: [{ role: { name: 'ADMIN' } }, { role: { name: 'TEACHER' } }],
};

test('la auditoría de proyecto resuelve actor y snapshots con una sola consulta dentro de la transacción', async () => {
  let actorReads = 0;
  let captured;
  const db = {
    user: {
      findUnique: async () => {
        actorReads += 1;
        return persistedActor;
      },
    },
    projectAuditLog: {
      count: async () => 0,
      create: async ({ data }) => {
        captured = data;
        return data;
      },
    },
  };

  await new ProjectAuditService({}).record(db, {
    projectId: 'project-1',
    actor,
    action: 'PROJECT_UPDATED',
    entityType: 'PROJECT',
  });

  assert.equal(actorReads, 1);
  assert.equal(captured.actorId, actor.id);
  assert.equal(captured.actorUserId, actor.id);
  assert.equal(captured.actorNameSnapshot, 'Nombre Actual');
  assert.equal(captured.actorUsernameSnapshot, 'actual');
  assert.equal(captured.actorEmailSnapshot, 'actual@isi.edu.bo');
  assert.deepEqual(captured.actorRolesSnapshot, ['ADMIN', 'TEACHER']);
  assert.deepEqual(captured.metadata.actorRoles, ['ADMIN', 'TEACHER']);
});

test('la auditoría conserva un fallback histórico y evita una FK inválida si el actor ya no existe', async () => {
  let captured;
  const db = {
    user: { findUnique: async () => null },
    projectAuditLog: {
      count: async () => 0,
      create: async ({ data }) => {
        captured = data;
        return data;
      },
    },
  };

  await new ProjectAuditService({}).record(db, {
    projectId: 'project-1',
    actor,
    action: 'PROJECT_ARCHIVED',
    entityType: 'PROJECT',
  });

  assert.equal(captured.actorUserId, null);
  assert.equal(captured.actorNameSnapshot, actor.username);
  assert.equal(captured.actorEmailSnapshot, actor.email);
});

test('AuditService registra snapshots de sistema y lista ambas fuentes sin N+1', async () => {
  let actorReads = 0;
  let systemWrite;
  const now = new Date('2026-07-20T15:00:00.000Z');
  const earlier = new Date('2026-07-20T14:00:00.000Z');
  const prisma = {
    user: {
      findUnique: async () => {
        actorReads += 1;
        return persistedActor;
      },
    },
    systemAuditLog: {
      create: async ({ data }) => {
        systemWrite = data;
        return data;
      },
      count: async () => 1,
      findMany: async () => [{
        id: 'system-1',
        actorIdSnapshot: actor.id,
        actorNameSnapshot: 'Nombre Actual',
        actorUsernameSnapshot: 'actual',
        actorEmailSnapshot: 'actual@isi.edu.bo',
        actorRolesSnapshot: ['ADMIN'],
        action: 'COMMUNITY_UPDATED',
        entityType: 'COMMUNITY',
        entityId: 'community-1',
        before: null,
        after: null,
        metadata: null,
        createdAt: earlier,
        actor: persistedActor,
      }],
    },
    projectAuditLog: {
      count: async () => 1,
      findMany: async () => [{
        id: 'project-audit-1',
        projectId: 'project-1',
        actorId: actor.id,
        actorNameSnapshot: 'Nombre Actual',
        actorUsernameSnapshot: 'actual',
        actorEmailSnapshot: 'actual@isi.edu.bo',
        actorRolesSnapshot: ['ADMIN'],
        action: 'PROJECT_UPDATED',
        entityType: 'PROJECT',
        entityId: 'project-1',
        before: null,
        after: null,
        metadata: null,
        createdAt: now,
        actor: persistedActor,
        project: { id: 'project-1', title: 'Proyecto', slug: 'proyecto' },
        delivery: null,
      }],
    },
    $transaction: async (callback) => callback(prisma),
  };
  const audit = new AuditService(prisma);
  await audit.record(prisma, {
    actor,
    action: 'COMMUNITY_UPDATED',
    entityType: 'COMMUNITY',
    entityId: 'community-1',
    before: { name: 'Antes' },
    after: { name: 'Después' },
  });
  assert.equal(systemWrite.actorNameSnapshot, 'Nombre Actual');
  assert.deepEqual(systemWrite.actorRolesSnapshot, ['ADMIN', 'TEACHER']);

  actorReads = 0;
  const page = await audit.list({ page: 1, limit: 20 });
  assert.equal(actorReads, 0, 'listar no debe resolver actores fila por fila');
  assert.equal(page.total, 2);
  assert.deepEqual(page.items.map((entry) => entry.source), ['PROJECT', 'SYSTEM']);
  assert.deepEqual(page.items[0].actor.roles, ['ADMIN', 'TEACHER']);
});

test('inspectSession reconoce refresh vigente sin rotarlo ni escribir la sesión', async () => {
  const refreshToken = 'refresh-token-opaco';
  const { hashRefreshToken } = require('../dist/auth/refresh-token-hash');
  const tokenHash = hashRefreshToken(refreshToken);
  const sessionId = 'd9428888-122b-4aa5-a2c7-0f5ec2e9d010';
  let writes = 0;
  const prisma = {
    refreshSession: {
      findUnique: async () => ({
        userId: 'user-1',
        securityVersion: 3,
        tokenHash,
        previousTokenHash: null,
        previousValidUntil: null,
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 120_000),
        revokedAt: null,
        user: { id: 'user-1', isActive: true, securityVersion: 3 },
      }),
      update: async () => { writes += 1; },
      updateMany: async () => { writes += 1; },
      create: async () => { writes += 1; },
    },
    user: { findUnique: async () => { throw new Error('No debe consultar fallback legacy'); } },
  };
  const jwt = {
    verifyAsync: async () => ({
      sub: 'user-1',
      type: 'refresh',
      jti: sessionId,
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
  };
  const config = { getOrThrow: (key) => key.includes('SECRET') ? 'secret' : key.includes('ISSUER') ? 'issuer' : 'audience' };
  const auth = new AuthService(prisma, jwt, {}, config);

  assert.deepEqual(
    await auth.inspectSession(null, refreshToken),
    { active: true, userId: 'user-1', source: 'refresh' },
  );
  assert.equal(writes, 0);
});

test('login y registro no ejecutan credenciales si ya existe bearer o refresh válido', async () => {
  for (const operation of ['login', 'register']) {
    let credentialCalls = 0;
    const auth = {
      inspectSession: async () => ({ active: true, userId: 'user-1', source: 'access' }),
      login: async () => { credentialCalls += 1; },
      register: async () => { credentialCalls += 1; },
    };
    const config = { getOrThrow: () => { throw new Error('No debe acceder a opciones de cookie'); } };
    const controller = new AuthController(auth, config);
    const request = { cookies: {}, get: () => undefined, ip: '127.0.0.1' };
    const response = {};

    await assert.rejects(
      () => controller[operation]({}, actor, request, response),
      (error) => error?.getStatus?.() === 409,
    );
    assert.equal(credentialCalls, 0);
  }
});

test('el directorio privado pagina, filtra por rol y no selecciona campos sensibles', async () => {
  let findArgs;
  const prisma = {
    user: {
      count: async () => 1,
      findMany: async (args) => {
        findArgs = args;
        return [{
          id: 'user-1',
          username: 'jperez',
          profile: { fullName: 'Juan Pérez', avatarUrl: null },
          roles: [{ role: { name: 'STUDENT' } }],
        }];
      },
    },
  };
  const result = await new UsersService(prisma).searchDirectory({
    q: ' Juan ',
    role: 'STUDENT',
    page: 2,
    limit: 10,
  });

  assert.equal(findArgs.take, 10);
  assert.equal(findArgs.skip, 10);
  assert.equal(findArgs.where.roles.some.role.name, 'STUDENT');
  assert.equal(Object.hasOwn(findArgs.select, 'email'), false);
  assert.equal(Object.hasOwn(findArgs.select, 'passwordHash'), false);
  assert.deepEqual(result.items[0], {
    id: 'user-1',
    username: 'jperez',
    profile: { fullName: 'Juan Pérez', avatarUrl: null },
    roles: ['STUDENT'],
  });
});

test('el catálogo colapsa espacios y mayúsculas antes del upsert compuesto', async () => {
  assert.deepEqual(normalizeCatalogValue('  Web   APP  '), {
    name: 'Web APP',
    normalizedName: 'web app',
  });
  let upsertArgs;
  const prisma = {
    catalogValue: {
      upsert: async (args) => {
        upsertArgs = args;
        return args.create;
      },
    },
  };
  await new CatalogsService(prisma).upsert('TECHNOLOGY', '  Web   APP  ');
  assert.deepEqual(upsertArgs.where, {
    kind_normalizedName: { kind: 'TECHNOLOGY', normalizedName: 'web app' },
  });
  assert.equal(upsertArgs.create.name, 'Web APP');
});

test('auth, perfil y foro rechazan semestres posteriores a octavo', async () => {
  const register = Object.assign(new RegisterDto(), {
    email: 'jperez@isi.edu.bo',
    username: 'jperez',
    fullName: 'Juan Pérez',
    password: 'password123',
    semester: 9,
  });
  const profile = Object.assign(new UpdateProfileDto(), { semester: 9 });
  const question = Object.assign(new CreateQuestionDto(), {
    title: 'Una pregunta suficientemente larga',
    body: 'Este es el contenido suficientemente largo de la pregunta.',
    semester: 9,
  });

  for (const dto of [register, profile, question]) {
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === 'semester'));
  }
});
