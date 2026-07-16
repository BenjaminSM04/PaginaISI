const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');

const { NewsService, UpdateProjectNewsDto } = require('../dist/news/news.module');
const { ProjectsService, UpdateProjectMilestoneDto } = require('../dist/projects/projects.module');
const { ProjectAccessService } = require('../dist/project-collaboration/project-access.service');
const { ProjectAuditDeliveryWorker } = require('../dist/project-collaboration/project-audit-delivery.worker');

const collaborator = {
  id: 'member-a',
  email: 'member-a@est.isi.edu.bo',
  username: 'member-a',
  roles: ['STUDENT'],
  sessionId: 'session-a',
  emailVerifiedAt: new Date('2026-07-13T12:00:00.000Z'),
};

function editableProject() {
  return {
    id: 'project-a',
    ownerId: 'owner-a',
    version: 4,
    status: 'APPROVED',
    communityId: 'community-a',
    title: 'Proyecto A',
    members: [{ userId: collaborator.id }],
  };
}

test('los DTO PATCH conservan expectedVersion obligatorio pese a PartialType', async () => {
  for (const [Dto, fields] of [
    [UpdateProjectMilestoneDto, { title: 'Hito válido' }],
    [UpdateProjectNewsDto, { title: 'Título válido' }],
  ]) {
    const missing = Object.assign(new Dto(), fields);
    const missingErrors = await validate(missing);
    assert.ok(
      missingErrors.some((error) => error.property === 'expectedVersion'),
      `${Dto.name} debe rechazar una versión ausente`,
    );

    const zero = Object.assign(new Dto(), fields, { expectedVersion: 0 });
    const zeroErrors = await validate(zero);
    assert.ok(
      zeroErrors.some((error) => error.property === 'expectedVersion'),
      `${Dto.name} debe rechazar la versión cero`,
    );

    const valid = Object.assign(new Dto(), fields, { expectedVersion: 4 });
    const validErrors = await validate(valid);
    assert.equal(
      validErrors.some((error) => error.property === 'expectedVersion'),
      false,
      `${Dto.name} debe aceptar una versión positiva`,
    );
  }
});

test('noticias de proyecto no filtran su existencia a integrantes de otro proyecto', async () => {
  let queriedNews = false;
  const project = editableProject();
  const prisma = {
    project: { findUnique: async () => project },
    news: {
      findMany: async () => {
        queriedNews = true;
        return [];
      },
    },
  };
  const access = new ProjectAccessService(prisma);
  const service = new NewsService(prisma, {}, access, {});
  const outsider = { ...collaborator, id: 'member-b', email: 'member-b@est.isi.edu.bo' };

  await assert.rejects(
    () => service.listForProject(outsider, project.id),
    /Proyecto no encontrado/,
  );
  assert.equal(queriedNews, false);
});

test('newsId de otro proyecto se rechaza antes de actualizar o auditar', async () => {
  const project = editableProject();
  let updateCalls = 0;
  let auditCalls = 0;
  const tx = {
    project: {
      findUnique: async () => project,
      updateMany: async () => ({ count: 1 }),
    },
    news: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { id: 'news-from-project-b', projectId: project.id });
        return null;
      },
      update: async () => {
        updateCalls += 1;
      },
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const access = new ProjectAccessService({});
  const audit = { record: async () => { auditCalls += 1; } };
  const service = new NewsService(prisma, {}, access, audit);

  await assert.rejects(
    () => service.updateForProject(
      collaborator,
      project.id,
      'news-from-project-b',
      { title: 'Título actualizado', expectedVersion: project.version },
      { ip: null, userAgent: null },
    ),
    /Noticia no encontrada en este proyecto/,
  );
  assert.equal(updateCalls, 0);
  assert.equal(auditCalls, 0);
});

test('crear noticia fija proyecto, comunidad y actor desde el contexto autorizado', async () => {
  const project = editableProject();
  let createData;
  let auditInput;
  const createdAt = new Date('2026-07-13T12:00:00.000Z');
  const tx = {
    project: {
      findUnique: async () => project,
      updateMany: async ({ where }) => {
        assert.deepEqual(where, { id: project.id, version: project.version });
        return { count: 1 };
      },
    },
    news: {
      create: async ({ data }) => {
        createData = data;
        return {
          id: 'news-a',
          ...data,
          eventId: null,
          likesCount: 0,
          viewsCount: 0,
          createdAt,
          updatedAt: createdAt,
          author: { username: collaborator.username, profile: null },
          community: null,
          event: null,
          project: { id: project.id, slug: 'project-a', title: project.title, version: 5 },
        };
      },
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const access = new ProjectAccessService({});
  const audit = { record: async (_tx, input) => { auditInput = input; } };
  const service = new NewsService(prisma, {}, access, audit);

  const result = await service.createForProject(
    collaborator,
    project.id,
    {
      title: 'Avance verificable del proyecto',
      summary: 'El equipo completó una nueva entrega demostrable.',
      content: '<p>Contenido seguro y suficientemente descriptivo.</p>',
      category: 'PROYECTOS',
      tags: [' Demo ', 'demo'],
      expectedVersion: project.version,
    },
    { ip: '127.0.0.1', userAgent: 'node:test' },
  );

  assert.equal(createData.projectId, project.id);
  assert.equal(createData.communityId, project.communityId);
  assert.equal(createData.authorId, collaborator.id);
  assert.equal(createData.status, 'APPROVED');
  assert.deepEqual(createData.tags, ['demo']);
  assert.equal(auditInput.projectId, project.id);
  assert.equal(auditInput.actor, collaborator);
  assert.equal(auditInput.action, 'NEWS_CREATED');
  assert.equal(auditInput.after.projectId, project.id);
  assert.equal(result.projectVersion, project.version + 1);
});

test('rollback de noticia restaura solo la allowlist y deja una auditoría enlazada', async () => {
  const project = {
    ...editableProject(),
    version: 8,
    members: [],
    technologies: [],
    gallery: [],
    milestones: [],
  };
  const before = {
    id: 'news-a',
    projectId: project.id,
    authorId: 'author-a',
    slug: 'slug-inmutable',
    title: 'Título anterior',
    summary: 'Resumen anterior',
    content: '<p>Contenido anterior</p>',
    category: 'PROYECTOS',
    coverUrl: null,
    tags: ['anterior'],
    status: 'APPROVED',
    publishedAt: '2026-07-10T12:00:00.000Z',
    communityId: project.communityId,
    eventId: null,
  };
  const after = {
    ...before,
    title: 'Título posterior',
    summary: 'Resumen posterior',
    content: '<p>Contenido posterior</p>',
    tags: ['posterior'],
  };
  const current = {
    ...after,
    publishedAt: new Date(after.publishedAt),
  };
  let restoredData;
  let rollbackAudit;
  const tx = {
    project: {
      updateMany: async ({ where }) => {
        assert.deepEqual(where, { id: project.id, version: project.version });
        return { count: 1 };
      },
    },
    news: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { id: current.id, projectId: project.id });
        return current;
      },
      update: async ({ where, data }) => {
        assert.deepEqual(where, { id: current.id });
        restoredData = data;
        return { ...current, ...data };
      },
    },
  };
  const prisma = {
    project: { findUnique: async () => project },
    projectAuditLog: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { id: 'audit-news-update', projectId: project.id });
        return {
          id: 'audit-news-update',
          projectId: project.id,
          action: 'NEWS_UPDATED',
          entityType: 'NEWS',
          entityId: current.id,
          before,
          after,
          metadata: {},
          rollbackEntries: [],
        };
      },
    },
    $transaction: async (callback) => callback(tx),
  };
  const access = {
    forProject: () => ({
      isAdmin: true,
      isOwner: false,
      isMember: false,
      canManageMembers: true,
      role: 'ADMIN',
    }),
  };
  const audit = {
    record: async (_tx, input) => {
      rollbackAudit = input;
      return { id: 'audit-rollback', ...input };
    },
  };
  const service = new ProjectsService(prisma, {}, {}, audit, access);
  const admin = { ...collaborator, id: 'admin-a', email: 'admin@isi.edu.bo', roles: ['ADMIN'] };

  const result = await service.rollbackAudit(
    admin,
    project.id,
    'audit-news-update',
    { expectedVersion: project.version, reason: 'Restauración aprobada por el responsable' },
    { ip: '127.0.0.1', userAgent: 'node:test' },
  );

  assert.equal(restoredData.title, before.title);
  assert.equal(restoredData.summary, before.summary);
  assert.equal(restoredData.content, before.content);
  assert.deepEqual(restoredData.tags, before.tags);
  assert.equal(restoredData.projectId, undefined);
  assert.equal(restoredData.authorId, undefined);
  assert.equal(restoredData.slug, undefined);
  assert.equal(rollbackAudit.action, 'ROLLBACK');
  assert.equal(rollbackAudit.rollbackOfId, 'audit-news-update');
  assert.equal(rollbackAudit.actor, admin);
  assert.equal(rollbackAudit.metadata.originalAction, 'NEWS_UPDATED');
  assert.equal(result.version, project.version + 1);
});

function auditDeliveryFixture() {
  return {
    id: 'delivery-1',
    auditLogId: 'audit-1',
    status: 'PROCESSING',
    attempts: 1,
    auditLog: {
      id: 'audit-1',
      projectId: 'project-a',
      actorId: collaborator.id,
      actorEmailSnapshot: collaborator.email,
      action: 'NEWS_UPDATED',
      entityType: 'NEWS',
      createdAt: new Date('2026-07-13T12:00:00.000Z'),
      project: {
        id: 'project-a',
        title: 'Proyecto A',
        owner: { id: 'owner-a', email: 'owner@isi.edu.bo', isActive: true },
      },
    },
  };
}

test('outbox notifica solo a destinatarios del servidor y deduplica por auditoría', async () => {
  const finalUpdates = [];
  const notifications = [];
  const fixture = auditDeliveryFixture();
  const prisma = {
    projectAuditDelivery: {
      findMany: async () => [{ id: fixture.id }],
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => fixture,
      update: async ({ data }) => {
        finalUpdates.push(data);
        return data;
      },
    },
    user: {
      findMany: async () => [
        { id: 'admin-a', email: 'admin-a@isi.edu.bo' },
        // Aunque apareciera en la consulta de administradores, el actor se excluye.
        { id: collaborator.id, email: collaborator.email },
      ],
    },
  };
  const notificationService = {
    send: async (input) => {
      notifications.push(input);
      return { id: `notification-${input.userId}` };
    },
  };
  const config = { get: () => undefined };
  const worker = new ProjectAuditDeliveryWorker(prisma, notificationService, config);

  await worker.drain();

  assert.deepEqual(notifications.map((item) => item.userId).sort(), ['admin-a', 'owner-a']);
  for (const notification of notifications) {
    assert.equal(notification.dedupeKey, 'project-audit-alert:audit-1');
    assert.equal(notification.href, '/proyectos/gestionar/project-a?tab=history&audit=audit-1');
  }
  assert.equal(finalUpdates.at(-1).status, 'SKIPPED');
  assert.match(finalUpdates.at(-1).lastError, /Webhook de seguridad no configurado/);
});

test('webhook usa HMAC, payload mínimo e idempotencia y reprograma un HTTP fallido', async () => {
  const fixture = auditDeliveryFixture();
  const finalUpdates = [];
  let request;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: false, status: 503 };
  };
  const prisma = {
    projectAuditDelivery: {
      findMany: async () => [{ id: fixture.id }],
      updateMany: async () => ({ count: 1 }),
      findUnique: async (args) => args.select ? { attempts: 1 } : fixture,
      update: async ({ data }) => {
        finalUpdates.push(data);
        return data;
      },
    },
    user: { findMany: async () => [{ id: 'admin-a', email: 'admin-a@isi.edu.bo' }] },
  };
  const notificationService = { send: async () => ({ id: 'notification-1' }) };
  const config = {
    get: (key) => key === 'SECURITY_ALERT_WEBHOOK_URL'
      ? 'https://security.example.edu/project-audit'
      : key === 'SECURITY_ALERT_WEBHOOK_SECRET'
        ? '0123456789abcdef0123456789abcdef'
        : undefined,
  };
  const worker = new ProjectAuditDeliveryWorker(prisma, notificationService, config);

  try {
    await worker.drain();
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(request.url, 'https://security.example.edu/project-audit');
  assert.equal(request.options.headers['idempotency-key'], fixture.id);
  assert.match(request.options.headers['x-isi-signature'], /^sha256=[a-f0-9]{64}$/);
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.id, fixture.id);
  assert.deepEqual(payload.to.sort(), ['admin-a@isi.edu.bo', 'owner@isi.edu.bo']);
  assert.equal(payload.audit.actorEmail, collaborator.email);
  assert.equal(Object.hasOwn(payload.audit, 'before'), false);
  assert.equal(Object.hasOwn(payload.audit, 'after'), false);
  assert.equal(Object.hasOwn(payload.audit, 'metadata'), false);
  assert.equal(finalUpdates.at(-1).status, 'PENDING');
  assert.match(finalUpdates.at(-1).lastError, /HTTP 503/);
  assert.ok(finalUpdates.at(-1).nextAttemptAt instanceof Date);
});
