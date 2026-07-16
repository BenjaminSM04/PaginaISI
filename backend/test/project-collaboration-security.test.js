const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const {
  ProjectAuditService,
  projectAuditRequestContext,
  projectAuditSnapshot,
  projectAuditSnapshotsEqual,
} = require('../dist/project-collaboration/project-audit.service');
const { ProjectAccessService } = require('../dist/project-collaboration/project-access.service');
const { ProjectsService } = require('../dist/projects/projects.module');

const actor = {
  id: 'actor-1',
  email: 'colaborador@est.isi.edu.bo',
  username: 'colaborador',
  roles: ['STUDENT'],
  sessionId: 'session-1',
  emailVerifiedAt: new Date('2026-07-11T12:00:00.000Z'),
};

function auditDatabase(recentEdits = 0) {
  const writes = [];
  return {
    writes,
    projectAuditLog: {
      count: async () => recentEdits,
      create: async ({ data }) => {
        writes.push(data);
        return data;
      },
    },
  };
}

test('la auditoría atribuye correo y roles desde la identidad autenticada', async () => {
  const db = auditDatabase();
  const service = new ProjectAuditService({});

  const result = await service.record(db, {
    projectId: 'project-1',
    actor,
    action: 'PROJECT_UPDATED',
    entityType: 'PROJECT',
    entityId: 'project-1',
    before: { title: 'Antes' },
    after: { title: 'Después' },
    // Una metadata con nombre parecido no puede sustituir los campos de
    // atribución de primer nivel que consume el panel administrativo.
    metadata: { actorEmailSnapshot: 'forjado@example.com' },
    request: { ip: '127.0.0.1', userAgent: 'node:test' },
  });

  assert.equal(db.writes.length, 1);
  assert.equal(result.actorId, actor.id);
  assert.equal(result.actorEmailSnapshot, actor.email);
  assert.deepEqual(result.metadata.actorRoles, actor.roles);
  assert.equal(result.metadata.request.ip, '127.0.0.1');
  assert.equal(result.metadata.actorEmailSnapshot, 'forjado@example.com');
});

test('la auditoría marca frecuencia anómala y acciones privilegiadas', async () => {
  const db = auditDatabase(19);
  const service = new ProjectAuditService({});

  const result = await service.record(db, {
    projectId: 'project-1',
    actor: { ...actor, roles: ['ADMIN'] },
    action: 'ROLLBACK',
    entityType: 'PROJECT',
    entityId: 'project-1',
  });

  assert.equal(result.metadata.security.editsInLastFiveMinutes, 20);
  assert.deepEqual(
    result.metadata.security.riskSignals.sort(),
    ['HIGH_FREQUENCY', 'PRIVILEGED_ACTION'],
  );
});

test('el contexto de auditoría acota IP y user-agent antes de persistir', () => {
  const context = projectAuditRequestContext({
    ip: '1'.repeat(120),
    get: (name) => name === 'user-agent' ? 'a'.repeat(500) : undefined,
  });

  assert.equal(context.ip.length, 80);
  assert.equal(context.userAgent.length, 300);
});

test('el snapshot es una copia JSON estable y no conserva referencias mutables', () => {
  const original = {
    title: 'Proyecto',
    startsAt: new Date('2026-08-01T15:00:00.000Z'),
    tags: ['seguridad'],
  };
  const snapshot = projectAuditSnapshot(original);
  original.title = 'Alterado';
  original.tags.push('inyectado');

  assert.deepEqual(snapshot, {
    title: 'Proyecto',
    startsAt: '2026-08-01T15:00:00.000Z',
    tags: ['seguridad'],
  });
});

test('la comparación de rollback es estable ante distinto orden de claves', () => {
  assert.equal(
    projectAuditSnapshotsEqual(
      { title: 'Proyecto', nested: { b: 2, a: 1 } },
      { nested: { a: 1, b: 2 }, title: 'Proyecto' },
    ),
    true,
  );
  assert.equal(projectAuditSnapshotsEqual({ version: 1 }, { version: 2 }), false);
});

test('la migración protege la bitácora y serializa cada rollback una sola vez', () => {
  const migration = readFileSync(
    join(__dirname, '..', 'prisma', 'migrations', '20260711130000_project_collaboration_audit', 'migration.sql'),
    'utf8',
  );

  assert.match(migration, /BEFORE UPDATE OR DELETE ON "ProjectAuditLog"/);
  assert.match(migration, /RAISE EXCEPTION 'ProjectAuditLog is append-only'/);
  assert.match(migration, /CREATE UNIQUE INDEX "ProjectAuditLog_rollbackOfId_key"/);
  assert.match(migration, /"projectId"\) REFERENCES "Project"\("id"\) ON DELETE RESTRICT/);
  assert.match(
    migration,
    /CREATE TYPE "ProjectAuditDeliveryStatus" AS ENUM \('PENDING', 'PROCESSING', 'SENT', 'SKIPPED', 'FAILED'\)/,
  );
  assert.match(migration, /CREATE UNIQUE INDEX "ProjectAuditDelivery_auditLogId_key"/);
  assert.match(migration, /CREATE INDEX "ProjectAuditDelivery_status_nextAttemptAt_idx"/);
  assert.match(
    migration,
    /"ProjectAuditDelivery_auditLogId_fkey"[\s\S]*REFERENCES "ProjectAuditLog"\("id"\) ON DELETE RESTRICT/,
  );
});

test('solo la pertenencia al proyecto objetivo concede edición; ser revisor no alcanza', async () => {
  const target = {
    id: 'project-b',
    ownerId: 'owner-b',
    version: 3,
    status: 'APPROVED',
    members: [{ userId: 'member-b', roleInProject: 'ADMIN' }],
  };
  const policy = new ProjectAccessService({});
  const db = { project: { findUnique: async () => target } };

  const reviewer = { ...actor, id: 'reviewer-b', roles: ['TEACHER'] };
  await assert.rejects(
    () => policy.assertEditor(reviewer, target.id, db),
    /Proyecto no encontrado/,
  );

  // Aunque el actor sea integrante de otro proyecto, la consulta del recurso
  // objetivo no contiene su userId y la política debe denegar el IDOR.
  const memberOfAnotherProject = { ...actor, id: 'member-a' };
  await assert.rejects(
    () => policy.assertEditor(memberOfAnotherProject, target.id, db),
    /Proyecto no encontrado/,
  );

  const allowed = await policy.assertEditor({ ...actor, id: 'member-b' }, target.id, db);
  assert.equal(allowed.access.isMember, true);
  assert.equal(allowed.access.role, 'Colaborador');
});

test('un colaborador no puede gobernar integrantes aunque su etiqueta diga ADMIN', async () => {
  const target = {
    id: 'project-1',
    ownerId: 'owner-1',
    version: 1,
    members: [{ userId: 'member-1', roleInProject: 'ADMIN' }],
  };
  const policy = new ProjectAccessService({});
  const db = { project: { findUnique: async () => target } };

  await assert.rejects(
    () => policy.assertOwnerOrAdmin({ ...actor, id: 'member-1' }, target.id, db),
    /Solo el líder o un administrador/,
  );

  const owner = await policy.assertOwnerOrAdmin({ ...actor, id: 'owner-1' }, target.id, db);
  assert.equal(owner.access.canManageMembers, true);

  const admin = await policy.assertOwnerOrAdmin({ ...actor, id: 'admin-1', roles: ['ADMIN'] }, target.id, db);
  assert.equal(admin.access.canManageMembers, true);
});

test('el servicio de dominio rechaza rollback de no administradores', async () => {
  const service = new ProjectsService({}, {}, {}, {}, {});
  await assert.rejects(
    () => service.rollbackAudit(
      actor,
      'project-1',
      'audit-1',
      { expectedVersion: 1, reason: 'prueba de autorización' },
      { ip: null, userAgent: null },
    ),
    /Solo un administrador/,
  );
});

test('el servicio impide que un colaborador cambie gobernanza o campos administrativos', async () => {
  const project = {
    id: 'project-1',
    ownerId: 'owner-1',
    version: 4,
    status: 'APPROVED',
    members: [{ userId: actor.id }],
    technologies: [],
    gallery: [],
    milestones: [],
  };
  const prisma = { project: { findUnique: async () => project } };
  const accessPolicy = {
    forProject: () => ({
      isAdmin: false,
      isOwner: false,
      isMember: true,
      canManageMembers: false,
      role: 'Colaborador',
    }),
  };
  const service = new ProjectsService(prisma, {}, {}, {}, accessPolicy);

  for (const dto of [
    { expectedVersion: 4, memberUsernames: ['complice'] },
    { expectedVersion: 4, reviewerUsername: 'otro-docente' },
    { expectedVersion: 4, communitySlug: 'otra-comunidad' },
  ]) {
    await assert.rejects(
      () => service.update(actor, project.id, dto, { ip: null, userAgent: null }),
      /Solo el líder o un administrador/,
    );
  }

  for (const dto of [
    { expectedVersion: 4, status: 'APPROVED' },
    { expectedVersion: 4, isFeatured: true },
  ]) {
    await assert.rejects(
      () => service.update(actor, project.id, dto, { ip: null, userAgent: null }),
      /Solo un administrador/,
    );
  }
});

test('la galería rechaza un asset de otro proyecto o de otro uploader', async () => {
  const project = {
    id: 'project-1',
    ownerId: 'owner-1',
    version: 2,
    status: 'APPROVED',
    members: [{ userId: actor.id }],
    technologies: [],
    gallery: [],
    milestones: [],
  };
  const accessPolicy = {
    forProject: () => ({
      isAdmin: false,
      isOwner: false,
      isMember: true,
      canManageMembers: false,
      role: 'Colaborador',
    }),
  };
  const prisma = {
    project: { findUnique: async () => project },
    mediaAsset: { findUnique: async () => ({
      id: 'asset-1',
      projectId: 'project-2',
      eventId: null,
      forumQuestionId: null,
      forumAnswerId: null,
      archivedAt: null,
      mime: 'image/webp',
      uploaderId: actor.id,
    }) },
  };
  const service = new ProjectsService(prisma, {}, {}, {}, accessPolicy);

  await assert.rejects(
    () => service.attachGalleryMedia(
      actor,
      project.id,
      { mediaId: 'asset-1', expectedVersion: 2 },
      { ip: null, userAgent: null },
    ),
    /ya está vinculada/,
  );

  prisma.mediaAsset.findUnique = async () => ({
    id: 'asset-2',
    projectId: null,
    eventId: null,
    forumQuestionId: null,
    forumAnswerId: null,
    archivedAt: null,
    mime: 'image/webp',
    uploaderId: 'otro-usuario',
  });
  await assert.rejects(
    () => service.attachGalleryMedia(
      actor,
      project.id,
      { mediaId: 'asset-2', expectedVersion: 2 },
      { ip: null, userAgent: null },
    ),
    /Solo puedes adjuntar una imagen que hayas subido/,
  );
});

test('rollback repetido o sobre estado divergente se rechaza sin restaurar', async () => {
  const currentProject = {
    id: 'project-1',
    ownerId: 'owner-1',
    version: 7,
    title: 'Versión actual',
    summary: 'Resumen actual',
    description: 'Descripción actual suficientemente detallada',
    coverUrl: null,
    videoUrl: null,
    repoUrl: null,
    demoUrl: null,
    subject: null,
    semester: null,
    phase: null,
    status: 'APPROVED',
    stage: 'IN_DEVELOPMENT',
    isFeatured: false,
    isIncubator: false,
    recruiting: false,
    tags: [],
    startedAt: null,
    publishedAt: null,
    reviewerId: null,
    communityId: null,
    technologies: [],
    members: [],
    gallery: [],
    milestones: [],
  };
  const accessPolicy = {
    forProject: () => ({
      isAdmin: true,
      isOwner: false,
      isMember: false,
      canManageMembers: true,
      role: 'ADMIN',
    }),
  };
  let auditLog = {
    id: 'audit-1',
    projectId: currentProject.id,
    action: 'PROJECT_UPDATED',
    entityType: 'PROJECT',
    entityId: currentProject.id,
    before: { title: 'Antes' },
    after: { title: 'Después' },
    rollbackEntries: [{ id: 'rollback-1' }],
  };
  let restoreWrites = 0;
  const prisma = {
    project: { findUnique: async () => currentProject },
    projectAuditLog: { findFirst: async () => auditLog },
    $transaction: async (callback) => callback({
      project: {
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => currentProject,
        update: async () => { restoreWrites += 1; },
      },
      projectTechnology: { deleteMany: async () => { restoreWrites += 1; } },
    }),
  };
  const service = new ProjectsService(prisma, {}, {}, {}, accessPolicy);
  const admin = { ...actor, id: 'admin-1', roles: ['ADMIN'] };

  await assert.rejects(
    () => service.rollbackAudit(
      admin,
      currentProject.id,
      auditLog.id,
      { expectedVersion: 7, reason: 'rollback duplicado' },
      { ip: null, userAgent: null },
    ),
    /ya fue revertida/,
  );
  assert.equal(restoreWrites, 0);

  auditLog = { ...auditLog, rollbackEntries: [] };
  await assert.rejects(
    () => service.rollbackAudit(
      admin,
      currentProject.id,
      auditLog.id,
      { expectedVersion: 7, reason: 'estado divergente' },
      { ip: null, userAgent: null },
    ),
    /cambió después de esa edición/,
  );
  assert.equal(restoreWrites, 0);
});
