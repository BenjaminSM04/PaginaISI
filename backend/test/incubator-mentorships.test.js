const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');
const {
  CreateIdeaProposalDto,
  IdeasService,
  assertIdeaRealClientFields,
  normalizeIdeaTechnologies,
} = require('../dist/ideas/ideas.module');
const {
  MentorshipsService,
  uniqueMentorshipIds,
  validateMentorshipConfiguration,
} = require('../dist/mentorships/mentorships.module');
const { StorageService } = require('../dist/storage/storage.module');

const authUser = (id, roles = ['STUDENT']) => ({
  id,
  email: `${id}@example.test`,
  username: id,
  roles,
  sessionId: `session-${id}`,
  emailVerifiedAt: new Date(),
});

const publicUser = (id) => ({
  id,
  username: id,
  profile: { fullName: `Usuario ${id}`, avatarUrl: null, semester: 4 },
  roles: [{ role: { name: 'STUDENT' } }],
});

function idea(overrides = {}) {
  return {
    id: 'idea-1',
    title: 'Una idea segura',
    description: 'Descripción suficientemente extensa para una postulación.',
    problem: 'Problema suficientemente extenso para una postulación.',
    proposedSolution: 'Solución suficientemente extensa para una postulación.',
    technologies: ['Web'],
    isRealClient: true,
    clientName: 'Cliente SRL',
    clientContactName: 'Persona Cliente',
    clientContact: 'privado@example.test',
    clientNeed: 'Una necesidad suficientemente detallada.',
    clientAuthorizationUrl: 'https://example.test/respaldo.pdf',
    attachmentUrl: null,
    status: 'PENDING',
    reviewComment: 'dato privado',
    ownerId: 'owner',
    reviewerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    decidedAt: null,
    owner: publicUser('owner'),
    reviewer: null,
    members: [],
    media: [],
    ...overrides,
  };
}

test('las tecnologías de ideas se normalizan sin duplicados por espacio o mayúsculas', () => {
  assert.deepEqual(
    normalizeIdeaTechnologies([' Web ', 'web', 'WEB', 'React', ' react ']),
    ['Web', 'React'],
  );
});

test('una postulación para cliente real exige todos los datos condicionales', () => {
  assert.throws(
    () => assertIdeaRealClientFields({
      isRealClient: true,
      clientName: 'Cliente',
      clientContactName: null,
      clientContact: '',
      clientNeed: null,
    }),
    /persona de contacto.*medio de contacto.*necesidad planteada/,
  );
  assert.doesNotThrow(() => assertIdeaRealClientFields({
    isRealClient: true,
    clientName: 'Cliente',
    clientContactName: 'Contacto',
    clientContact: 'contacto@example.test',
    clientNeed: 'Automatizar el proceso actual',
  }));
  assert.doesNotThrow(() => assertIdeaRealClientFields({ isRealClient: false }));
});

test('el DTO también bloquea una llamada HTTP incompleta para cliente real', async () => {
  const dto = Object.assign(new CreateIdeaProposalDto(), {
    title: 'Idea válida',
    description: 'Una descripción con suficiente contenido para validar.',
    problem: 'Un problema con suficiente contenido para validar.',
    proposedSolution: 'Una solución con suficiente contenido para validar.',
    isRealClient: true,
  });
  const errors = await validate(dto);
  const properties = new Set(errors.map((error) => error.property));
  assert.equal(properties.has('clientName'), true);
  assert.equal(properties.has('clientContactName'), true);
  assert.equal(properties.has('clientContact'), true);
  assert.equal(properties.has('clientNeed'), true);
});

test('el detalle privado de una idea evita IDOR y la versión pública oculta contacto', async () => {
  const pending = idea();
  const service = new IdeasService(
    { ideaProposal: { findUnique: async () => pending } },
    {},
    {},
    {},
    {},
  );
  await assert.rejects(
    () => service.detail('idea-1', authUser('outsider')),
    /Idea no encontrada/,
  );

  const teacherView = await service.detail('idea-1', authUser('teacher', ['TEACHER']));
  assert.equal(teacherView.clientContact, 'privado@example.test');

  pending.status = 'APPROVED';
  const publicView = await service.detail('idea-1', null);
  assert.equal(publicView.clientContact, null);
  assert.equal(publicView.clientContactName, null);
  assert.equal(publicView.clientAuthorizationUrl, null);
  assert.equal(publicView.clientName, 'Cliente SRL');
});

test('la configuración de mentoría exige docente, horario y datos de modalidad', () => {
  const base = {
    startsAt: '2026-08-10T14:00:00.000Z',
    modality: 'ONLINE',
    meetingUrl: 'https://meet.example.test/session',
    mentorIds: ['teacher-1'],
  };
  assert.doesNotThrow(() => validateMentorshipConfiguration(base));
  assert.throws(
    () => validateMentorshipConfiguration({ ...base, mentorIds: [] }),
    /al menos un docente/,
  );
  assert.throws(
    () => validateMentorshipConfiguration({ ...base, meetingUrl: null }),
    /enlace/,
  );
  assert.throws(
    () => validateMentorshipConfiguration({
      ...base,
      modality: 'HYBRID',
      location: null,
    }),
    /lugar y enlace/,
  );
  assert.throws(
    () => validateMentorshipConfiguration({
      ...base,
      endsAt: '2026-08-10T13:00:00.000Z',
    }),
    /posterior al inicio/,
  );
  assert.throws(
    () => validateMentorshipConfiguration({
      ...base,
      capacity: 2,
      studentCount: 3,
    }),
    /supera la capacidad/,
  );
});

test('docentes y estudiantes repetidos se rechazan antes de escribir', () => {
  assert.throws(
    () => uniqueMentorshipIds(['teacher-1', ' teacher-1 '], 'docentes'),
    /No repitas docentes/,
  );
  assert.deepEqual(
    uniqueMentorshipIds(['student-1', ' student-2 '], 'estudiantes'),
    ['student-1', 'student-2'],
  );
});

test('una persona ajena no puede abrir el detalle de gestión de una mentoría', async () => {
  const record = {
    id: 'mentorship-1',
    slug: 'mentoria-1',
    mentorId: 'teacher-owner',
    communityId: 'community-1',
    mentors: [{ userId: 'teacher-owner' }],
    enrollments: [],
  };
  const service = new MentorshipsService(
    {
      mentorship: { findUnique: async () => record },
      community: { findFirst: async () => null },
    },
    {},
    {},
    {},
  );
  await assert.rejects(
    () => service.managementDetail(authUser('teacher-outsider', ['TEACHER']), 'mentorship-1'),
    /No puedes gestionar esta mentoría/,
  );
});

test('la inscripción está restringida a estudiantes incluso al invocar el servicio', async () => {
  const service = new MentorshipsService({}, {}, {}, {});
  await assert.rejects(
    () => service.enroll(authUser('teacher-1', ['TEACHER']), 'mentoria'),
    /disponible para estudiantes/,
  );
});

test('storage considera mentorías e ideas al comprobar que un archivo esté libre', async () => {
  let where;
  const service = new StorageService({}, {}, {}, {}, {});
  const tx = {
    mediaAsset: {
      findMany: async (query) => {
        where = query.where;
        return [{ id: 'asset-1' }];
      },
    },
  };
  await service.assertOwnedUnlinkedAssets(tx, 'owner', ['asset-1']);
  assert.equal(where.mentorshipId, null);
  assert.equal(where.ideaProposalId, null);
});
