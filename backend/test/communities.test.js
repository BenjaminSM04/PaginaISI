const test = require('node:test');
const assert = require('node:assert/strict');
const { MembershipRole } = require('@prisma/client');
const {
  CommunitiesService,
  assertCommunityRoleRemovalAllowed,
  normalizeCommunityLinks,
  resolveCommunityTeacherIds,
} = require('../dist/communities/communities.module');

const user = (id, roles = ['STUDENT']) => ({
  id,
  email: `${id}@demo.test`,
  username: id,
  roles,
  sessionId: 'session',
  emailVerifiedAt: new Date(),
});

test('una comunidad exige al menos un docente responsable incluso al invocar el servicio directamente', async () => {
  const service = new CommunitiesService(
    { $transaction: async () => assert.fail('no debe abrir una transacción inválida') },
    {},
    {},
  );
  await assert.rejects(
    () => service.create(user('admin', ['ADMIN']), {
      name: 'Comunidad segura',
      description: 'Descripción suficientemente larga',
    }),
    /al menos un docente responsable/,
  );
  assert.throws(
    () => resolveCommunityTeacherIds([], null),
    /al menos un docente responsable/,
  );
  assert.deepEqual(resolveCommunityTeacherIds(undefined, 'teacher-1'), ['teacher-1']);
});

test('la selección de docentes y los enlaces dinámicos rechazan duplicados', () => {
  assert.throws(
    () => resolveCommunityTeacherIds(['teacher-1', 'teacher-1'], undefined),
    /mismo docente/,
  );
  assert.throws(
    () => normalizeCommunityLinks([
      { platform: 'Web', url: 'https://example.test/community', order: 0 },
      { platform: 'Documentación', url: 'https://example.test/community', order: 1 },
    ]),
    /mismo enlace/,
  );
});

test('no se puede degradar al único docente ni quitar al último responsable', () => {
  assert.throws(
    () => assertCommunityRoleRemovalAllowed(
      MembershipRole.TEACHER_LEAD,
      MembershipRole.MEMBER,
      1,
      2,
    ),
    /único docente/,
  );
  assert.throws(
    () => assertCommunityRoleRemovalAllowed(
      MembershipRole.STUDENT_LEAD,
      null,
      0,
      1,
    ),
    /último responsable/,
  );
  assert.doesNotThrow(() => assertCommunityRoleRemovalAllowed(
    MembershipRole.TEACHER_LEAD,
    MembershipRole.MEMBER,
    2,
    2,
  ));
});

test('el servicio no elimina al único docente responsable', async () => {
  let deleteCalls = 0;
  const tx = {
    $queryRaw: async () => [{ id: 'community-1' }],
    community: {
      findUnique: async () => ({ id: 'community-1' }),
    },
    communityMember: {
      findUnique: async () => ({
        id: 'teacher-membership',
        communityId: 'community-1',
        userId: 'teacher-1',
        role: MembershipRole.TEACHER_LEAD,
      }),
      count: async () => 1,
      delete: async () => {
        deleteCalls += 1;
      },
    },
  };
  const service = new CommunitiesService(
    { $transaction: async (callback) => callback(tx) },
    {},
    {},
  );
  await assert.rejects(
    () => service.removeMember(user('admin', ['ADMIN']), 'community-1', 'teacher-1'),
    /único docente/,
  );
  assert.equal(deleteCalls, 0);
});

test('agregar un miembro existente devuelve conflicto y no crea un duplicado', async () => {
  let createCalls = 0;
  const tx = {
    $queryRaw: async () => [{ id: 'community-1' }],
    community: {
      findUnique: async () => ({ id: 'community-1' }),
    },
    user: {
      findUnique: async () => ({
        id: 'member-1',
        isActive: true,
        roles: [{ role: { name: 'STUDENT' } }],
      }),
    },
    communityMember: {
      findUnique: async () => ({
        id: 'existing',
        communityId: 'community-1',
        userId: 'member-1',
        role: MembershipRole.MEMBER,
      }),
      create: async () => {
        createCalls += 1;
      },
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const service = new CommunitiesService(prisma, {}, {});
  await assert.rejects(
    () => service.addMember(user('admin', ['ADMIN']), 'community-1', { userId: 'member-1' }),
    /ya pertenece/,
  );
  assert.equal(createCalls, 0);
});

test('unirse devuelve únicamente los puntos realmente acreditados por la regla dinámica', async () => {
  const member = user('member-1');
  const tx = {
    $queryRaw: async () => [{ id: 'community-1' }],
    community: {
      findUnique: async () => ({ id: 'community-1' }),
      findFirst: async () => ({
        id: 'community-1',
        slug: 'comunidad-pruebas',
        name: 'Comunidad de pruebas',
      }),
    },
    user: {
      findFirst: async () => ({ id: member.id }),
    },
    communityMember: {
      findUnique: async () => null,
      create: async () => ({
        id: 'membership-1',
        communityId: 'community-1',
        userId: member.id,
        role: MembershipRole.MEMBER,
      }),
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const gamification = {
    onCommunityJoined: async () => ({ awarded: true, points: 17, configuredPoints: 17 }),
  };
  const service = new CommunitiesService(prisma, gamification, { record: async () => undefined });

  const result = await service.join(member, 'comunidad-pruebas');

  assert.deepEqual(result, {
    joined: true,
    alreadyMember: false,
    pointsAwarded: 17,
  });
});

test('tener rol global Docente no permite gestionar una comunidad ajena', async () => {
  let detailQueries = 0;
  const prisma = {
    community: {
      findFirst: async () => null,
      findUnique: async () => {
        detailQueries += 1;
        return { id: 'community-1' };
      },
    },
  };
  const service = new CommunitiesService(prisma, {}, {});
  await assert.rejects(
    () => service.managementDetail(user('teacher-outsider', ['TEACHER']), 'community-1'),
    /donde eres responsable/,
  );
  assert.equal(detailQueries, 0);
});
