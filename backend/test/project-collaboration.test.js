const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { ProjectAccessService } = require('../dist/project-collaboration/project-access.service');
const {
  ProjectAuditService,
  projectAuditSnapshotsEqual,
} = require('../dist/project-collaboration/project-audit.service');
const { ProjectsService } = require('../dist/projects/projects.module');

const user = (id, roles = ['STUDENT']) => ({
  id,
  email: `${id}@demo.test`,
  username: id,
  roles,
  sessionId: 'session',
  emailVerifiedAt: new Date(),
});

test('la política distingue administrador, líder, colaborador y tercero', () => {
  const policy = new ProjectAccessService({});
  const project = { ownerId: 'owner', members: [{ userId: 'owner' }, { userId: 'member' }] };
  assert.equal(policy.forProject(user('admin', ['ADMIN']), project).role, 'ADMIN');
  assert.equal(policy.forProject(user('owner'), project).role, 'Líder');
  assert.equal(policy.forProject(user('member'), project).role, 'Colaborador');
  const outsider = policy.forProject(user('reviewer', ['TEACHER']), project);
  assert.equal(outsider.isMember, false);
  assert.equal(outsider.canManageMembers, false);
});

test('un revisor sin membresía no obtiene permisos de edición', async () => {
  const prisma = {
    project: {
      findUnique: async () => ({
        id: 'project', ownerId: 'owner', version: 1, status: 'APPROVED', members: [{ userId: 'member' }],
      }),
    },
  };
  const policy = new ProjectAccessService(prisma);
  await assert.rejects(() => policy.assertEditor(user('reviewer', ['TEACHER']), 'project'), /Proyecto no encontrado/);
  await assert.rejects(() => policy.assertOwnerOrAdmin(user('member'), 'project'), /Solo el líder/);
  assert.equal((await policy.assertEditor(user('member'), 'project')).access.isMember, true);
});

test('la auditoría toma id/correo del usuario autenticado y marca frecuencia anómala', async () => {
  let captured;
  const db = {
    projectAuditLog: {
      count: async () => 20,
      create: async ({ data }) => {
        captured = data;
        return data;
      },
    },
  };
  const audit = new ProjectAuditService({});
  await audit.record(db, {
    projectId: 'project',
    actor: user('real-actor', ['STUDENT']),
    action: 'PROJECT_UPDATED',
    entityType: 'PROJECT',
    metadata: { actorEmailSnapshot: 'spoofed@attacker.test' },
  });
  assert.equal(captured.actorId, 'real-actor');
  assert.equal(captured.actorEmailSnapshot, 'real-actor@demo.test');
  assert.deepEqual(captured.delivery, { create: {} });
  assert.ok(captured.metadata.security.riskSignals.includes('HIGH_FREQUENCY'));
});

test('la comparación de snapshots es estable aunque PostgreSQL reordene claves JSONB', () => {
  assert.equal(projectAuditSnapshotsEqual(
    { title: 'Proyecto', nested: { z: 1, a: 2 } },
    { nested: { a: 2, z: 1 }, title: 'Proyecto' },
  ), true);
});

test('rollback exige ADMIN incluso si el servicio se invoca sin el guard del controlador', async () => {
  const service = new ProjectsService({}, {}, {}, {}, {});
  await assert.rejects(
    () => service.rollbackAudit(user('member'), 'project', 'audit', { reason: 'Motivo suficientemente largo' }, {}),
    /Solo un administrador/,
  );
});

test('la migración protege bitácora y rollback concurrente a nivel de base de datos', () => {
  const sql = readFileSync(
    join(__dirname, '..', 'prisma', 'migrations', '20260711130000_project_collaboration_audit', 'migration.sql'),
    'utf8',
  );
  assert.match(sql, /BEFORE UPDATE OR DELETE ON "ProjectAuditLog"/);
  assert.match(sql, /UNIQUE INDEX "ProjectAuditLog_rollbackOfId_key"/);
  assert.match(sql, /ON DELETE RESTRICT/);
});

test('adjuntar media usa compare-and-set y los DELETE reciben expectedVersion por query', () => {
  const projectsSource = readFileSync(join(__dirname, '..', 'src', 'projects', 'projects.module.ts'), 'utf8');
  assert.match(projectsSource, /mediaAsset\.updateMany\([\s\S]*projectId: null/);
  assert.match(projectsSource, /archivedAt: null[\s\S]*mime: \{ startsWith: 'image\/' \}/);
  const deleteRoutes = projectsSource.match(/@Delete\([^)]*\)[\s\S]{0,500}?@Query\(\) dto: ExpectedProjectVersionDto/g) ?? [];
  assert.equal(deleteRoutes.length, 3);
});
