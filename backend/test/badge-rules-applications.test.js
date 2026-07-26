const test = require('node:test');
const assert = require('node:assert/strict');
const { BadgeRuleType } = require('@prisma/client');

const { AuditService } = require('../dist/audit/audit.service');
const {
  AdminApplicationsController,
  ApplicationsService,
  normalizeSafeApplicationUrl,
  publicApplicationWhere,
} = require('../dist/applications/applications.module');
const {
  BADGE_RULE_LABELS,
  BadgeRulesService,
  badgeAwardReason,
} = require('../dist/gamification/badge-rules.service');
const { BadgeRulesWorker } = require('../dist/gamification/badge-rules.worker');

const actor = {
  id: 'admin-1',
  email: 'admin@isi.edu.bo',
  username: 'admin',
  roles: ['ADMIN'],
  sessionId: 'session-admin',
  emailVerifiedAt: new Date(),
};

test('las URLs institucionales admiten HTTPS o rutas internas y bloquean esquemas activos', () => {
  assert.equal(
    normalizeSafeApplicationUrl(' https://biblioteca.example.edu/catalogo?q=isi '),
    'https://biblioteca.example.edu/catalogo?q=isi',
  );
  assert.equal(normalizeSafeApplicationUrl('/proyectos?estado=activo'), '/proyectos?estado=activo');
  assert.equal(normalizeSafeApplicationUrl('javascript:alert(1)'), null);
  assert.equal(normalizeSafeApplicationUrl('data:text/html,test'), null);
  assert.equal(normalizeSafeApplicationUrl('http://inseguro.example.edu'), null);
  assert.equal(normalizeSafeApplicationUrl('//evil.example'), null);
  assert.equal(normalizeSafeApplicationUrl('https://user:secret@example.edu'), null);
});

test('el listado público restringe aplicaciones por estado y roles resueltos del token', () => {
  assert.deepEqual(publicApplicationWhere(null), {
    isActive: true,
    OR: [{ visibleRoles: { equals: [] } }],
  });
  assert.deepEqual(publicApplicationWhere(actor), {
    isActive: true,
    OR: [
      { visibleRoles: { equals: [] } },
      { visibleRoles: { hasSome: ['ADMIN'] } },
    ],
  });
  assert.deepEqual(Reflect.getMetadata('roles', AdminApplicationsController), ['ADMIN']);
});

test('crear una aplicación normaliza datos y deja auditoría en la misma transacción', async () => {
  let stored;
  const audits = [];
  const tx = {
    user: {
      findUnique: async () => ({
        id: actor.id,
        email: actor.email,
        username: actor.username,
        profile: { fullName: 'Administración' },
        roles: [{ role: { name: 'ADMIN' } }],
      }),
    },
    institutionalApplication: {
      create: async ({ data }) => {
        stored = { id: 'app-1', ...data };
        return stored;
      },
    },
    systemAuditLog: {
      create: async ({ data }) => {
        audits.push(data);
        return data;
      },
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const service = new ApplicationsService(prisma, new AuditService(prisma));

  await service.create(actor, {
    name: '  Biblioteca  ',
    description: '  Catálogo institucional  ',
    url: 'https://biblioteca.example.edu',
    category: '  Académico  ',
    visibleRoles: ['STUDENT', 'TEACHER'],
  });

  assert.equal(stored.name, 'Biblioteca');
  assert.equal(stored.description, 'Catálogo institucional');
  assert.equal(stored.category, 'Académico');
  assert.equal(stored.url, 'https://biblioteca.example.edu/');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'APPLICATION_CREATED');

  assert.throws(
    () => service.create(actor, {
      name: 'Peligrosa',
      description: 'No debe persistirse',
      url: 'javascript:alert(1)',
      category: 'Otro',
    }),
    /URL debe ser/,
  );
  assert.equal(audits.length, 1);
});

test('todas las condiciones configurables tienen una explicación persistible', () => {
  assert.deepEqual(
    Object.keys(BADGE_RULE_LABELS).sort(),
    Object.values(BadgeRuleType).sort(),
  );
  assert.equal(
    badgeAwardReason(
      { name: 'Colaborador', ruleType: BadgeRuleType.ANSWERS_COUNT, targetValue: 2 },
      3,
    ),
    'Cumplió 3 de 2 respuestas publicadas',
  );
  assert.match(
    badgeAwardReason({ name: 'Honorífica', ruleType: null, targetValue: null }, 0),
    /manualmente/,
  );
});

test('la evaluación automática es idempotente y audita el motivo una sola vez', async () => {
  const createdAt = new Date('2026-07-01T00:00:00.000Z');
  const assignments = new Map();
  const audits = [];
  let answerCountArgs;
  const tx = {
    user: {
      findFirst: async () => ({ id: 'student-1' }),
    },
    badge: {
      findMany: async () => [{
        id: 'badge-1',
        code: 'DOS_RESPUESTAS',
        name: 'Dos respuestas',
        ruleType: BadgeRuleType.ANSWERS_COUNT,
        targetValue: 2,
        isRetroactive: false,
        createdAt,
      }],
    },
    userBadge: {
      findMany: async () => (
        assignments.has('student-1:badge-1') ? [{ badgeId: 'badge-1' }] : []
      ),
      createMany: async ({ data }) => {
        const row = data[0];
        const key = `${row.userId}:${row.badgeId}`;
        if (assignments.has(key)) return { count: 0 };
        assignments.set(key, row);
        return { count: 1 };
      },
    },
    forumAnswer: {
      count: async (args) => {
        answerCountArgs = args;
        return 2;
      },
    },
    systemAuditLog: {
      create: async ({ data }) => {
        audits.push(data);
        return data;
      },
    },
  };
  const prisma = { ...tx, $transaction: async (callback) => callback(tx) };
  const service = new BadgeRulesService(prisma, new AuditService(prisma));

  const first = await service.evaluateForUser('student-1');
  const repeated = await service.evaluateForUser('student-1');

  assert.equal(first.awarded, 1);
  assert.equal(repeated.awarded, 0);
  assert.equal(assignments.size, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'BADGE_AWARDED_AUTO');
  assert.equal(assignments.get('student-1:badge-1').progressValue, 2);
  assert.match(assignments.get('student-1:badge-1').reasonSnapshot, /2 de 2 respuestas/);
  assert.deepEqual(answerCountArgs.where.createdAt, { gte: createdAt });
});

test('el worker convierte el fin temporal de una mentoría en una evaluación de dominio', async () => {
  const evaluated = [];
  let query;
  const worker = new BadgeRulesWorker(
    {
      badge: { count: async () => 1 },
      mentorshipEnrollment: {
        findMany: async (args) => {
          query = args;
          return [{ userId: 'student-1' }, { userId: 'student-2' }];
        },
      },
    },
    { evaluateForUser: async (userId) => evaluated.push(userId) },
  );

  const result = await worker.runNow();
  assert.deepEqual(evaluated, ['student-1', 'student-2']);
  assert.equal(result.evaluatedUsers, 2);
  assert.equal(query.distinct[0], 'userId');
  assert.ok(query.where.mentorship.endsAt.lte instanceof Date);
});
