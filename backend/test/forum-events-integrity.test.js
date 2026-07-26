const test = require('node:test');
const assert = require('node:assert/strict');
const { RegistrationStatus } = require('@prisma/client');

const { AuditService } = require('../dist/audit/audit.service');
const { EventsService } = require('../dist/events/events.module');
const { ForumService } = require('../dist/forum/forum.module');
const { GamificationService } = require('../dist/gamification/gamification.service');

const authUser = (id, roles = ['STUDENT']) => ({
  id,
  email: `${id}@isi.edu.bo`,
  username: id,
  roles,
  sessionId: `session-${id}`,
  emailVerifiedAt: new Date(),
});

const persistedUser = (user) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  profile: { fullName: user.username },
  roles: user.roles.map((name) => ({ role: { name } })),
});

test('cambiar la mejor respuesta deja una sola selección y reasigna los puntos con ledger y auditoría', async () => {
  const owner = authUser('owner');
  const answers = new Map([
    ['answer-old', { id: 'answer-old', questionId: 'question-1', authorId: 'author-old', isAccepted: true }],
    ['answer-new', { id: 'answer-new', questionId: 'question-1', authorId: 'author-new', isAccepted: false }],
  ]);
  const question = {
    id: 'question-1',
    title: '¿Cómo se prueba una transacción?',
    authorId: owner.id,
    acceptedAnswerId: 'answer-old',
  };
  const ledger = [{
    id: 'points-old',
    userId: 'author-old',
    reason: 'RESPUESTA_ACEPTADA',
    category: 'DEV',
    points: 30,
    sourceType: 'ANSWER',
    sourceId: 'answer-old',
  }];
  const totals = new Map([['author-old', 30], ['author-new', 0]]);
  const audits = [];
  const notifications = [];
  let ledgerSequence = 0;

  const tx = {
    user: { findUnique: async () => persistedUser(owner) },
    pointRule: {
      findUnique: async () => ({
        reason: 'RESPUESTA_ACEPTADA',
        category: 'DEV',
        points: 30,
        dailyLimit: null,
        isActive: true,
      }),
    },
    pointsTransaction: {
      findMany: async ({ where }) => ledger.filter((entry) => (
        entry.reason === where.reason
        && where.OR.some((identity) => identity.userId === entry.userId && identity.sourceId === entry.sourceId)
      )),
      create: async ({ data }) => {
        const entry = { id: `ledger-${++ledgerSequence}`, ...data };
        ledger.push(entry);
        return entry;
      },
    },
    profile: {
      update: async ({ where, data }) => {
        totals.set(where.userId, (totals.get(where.userId) ?? 0) + data.totalPoints.increment);
      },
    },
    forumQuestion: {
      findUnique: async () => ({
        ...question,
        acceptedAnswer: question.acceptedAnswerId
          ? {
              id: question.acceptedAnswerId,
              authorId: answers.get(question.acceptedAnswerId).authorId,
            }
          : null,
      }),
      update: async ({ data }) => {
        question.acceptedAnswerId = data.acceptedAnswerId;
        return question;
      },
    },
    forumAnswer: {
      findFirst: async ({ where }) => {
        const answer = answers.get(where.id);
        return answer?.questionId === where.questionId ? { ...answer } : null;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const answer of answers.values()) {
          const idMatches = !where.id?.not || answer.id !== where.id.not;
          const acceptedMatches = where.isAccepted === undefined || answer.isAccepted === where.isAccepted;
          if (answer.questionId === where.questionId && idMatches && acceptedMatches) {
            Object.assign(answer, data);
            count += 1;
          }
        }
        return { count };
      },
      update: async ({ where, data }) => {
        Object.assign(answers.get(where.id), data);
        return answers.get(where.id);
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
  const points = new GamificationService(prisma);
  const gamification = {
    reassignBestAnswerInTransaction: (...args) => points.reassignBestAnswerInTransaction(...args),
    onBestAnswerSelected: async () => true,
  };
  const service = new ForumService(
    prisma,
    gamification,
    {},
    { send: async (input) => notifications.push(input) },
    new AuditService(prisma),
  );

  const result = await service.acceptAnswer(owner, question.id, 'answer-new');

  assert.equal(result.pointsAwarded, 30);
  assert.equal(result.pointsRevoked, 30);
  assert.equal(question.acceptedAnswerId, 'answer-new');
  assert.deepEqual(
    [...answers.values()].filter((answer) => answer.isAccepted).map((answer) => answer.id),
    ['answer-new'],
  );
  assert.equal(totals.get('author-old'), 0);
  assert.equal(totals.get('author-new'), 30);
  assert.equal(ledger.filter((entry) => entry.points === -30).length, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'FORUM_BEST_ANSWER_CHANGED');
  assert.equal(notifications.length, 2, 'se avisa al autor nuevo y al anterior');

  const repeated = await service.acceptAnswer(owner, question.id, 'answer-new');
  assert.equal(repeated.alreadyAccepted, true);
  assert.equal(ledger.length, 3, 'repetir la misma selección no escribe puntos');
  assert.equal(audits.length, 1, 'una operación idempotente no duplica auditoría');
});

test('la búsqueda paginada del foro incluye autor, materia y tag además de título y contenido', async () => {
  let findArgs;
  const prisma = {
    forumQuestion: {
      count: async () => 0,
      findMany: async (args) => {
        findArgs = args;
        return [];
      },
    },
    $transaction: async (operations) => Promise.all(operations),
  };
  const service = new ForumService(prisma, {}, {}, {}, {});
  const page = await service.list({
    search: 'Ana',
    author: 'Pérez',
    subject: 'Base de datos',
    semester: 8,
    page: 2,
    limit: 7,
  });

  assert.equal(findArgs.take, 7);
  assert.equal(findArgs.skip, 7);
  assert.equal(findArgs.where.semester, 8);
  assert.match(JSON.stringify(findArgs.where.OR), /"title"/);
  assert.match(JSON.stringify(findArgs.where.OR), /"body"/);
  assert.match(JSON.stringify(findArgs.where.OR), /"subject"/);
  assert.match(JSON.stringify(findArgs.where.OR), /"tags"/);
  assert.match(JSON.stringify(findArgs.where.OR), /"username"/);
  assert.match(JSON.stringify(findArgs.where.OR), /"fullName"/);
  assert.match(JSON.stringify(findArgs.where.author), /Pérez/);
  assert.deepEqual(page, { total: 0, items: [], page: 2, limit: 7, pages: 1 });
});

test('inscripción y cancelación son idempotentes, respetan puntos configurados y se auditan atómicamente', async () => {
  const attendee = authUser('attendee');
  const event = {
    id: 'event-1',
    slug: 'evento-pruebas',
    title: 'Evento de pruebas',
    organizerId: 'organizer',
    status: 'APPROVED',
    startsAt: new Date(Date.now() + 3_600_000),
    capacity: 1,
  };
  let registration = null;
  let profilePoints = 0;
  let pointSequence = 0;
  const ledger = [];
  const audits = [];
  const notifications = [];

  const tx = {
    user: { findUnique: async () => persistedUser(attendee) },
    event: {
      findUnique: async () => ({
        ...event,
        registrations: registration ? [{ ...registration }] : [],
        _count: {
          registrations: registration && ['REGISTERED', 'ATTENDED'].includes(registration.status) ? 1 : 0,
        },
      }),
    },
    eventRegistration: {
      create: async () => {
        registration = {
          id: 'registration-1',
          status: RegistrationStatus.REGISTERED,
          createdAt: new Date(),
        };
        return { ...registration };
      },
      update: async ({ data }) => {
        registration = { ...registration, ...data };
        return { ...registration };
      },
    },
    pointRule: {
      findUnique: async () => ({
        reason: 'INSCRIPCION_EVENTO',
        category: 'COMMUNITY',
        points: 7,
        dailyLimit: null,
        isActive: true,
      }),
    },
    pointsTransaction: {
      findFirst: async ({ where }) => ledger.find((entry) => (
        entry.userId === where.userId
        && entry.reason === where.reason
        && entry.sourceType === where.sourceType
        && entry.sourceId === where.sourceId
      )) ?? null,
      count: async () => 0,
      create: async ({ data }) => {
        const entry = { id: `event-points-${++pointSequence}`, ...data };
        ledger.push(entry);
        return entry;
      },
    },
    profile: {
      update: async ({ data }) => {
        profilePoints += data.totalPoints.increment;
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
  const service = new EventsService(
    prisma,
    new GamificationService(prisma),
    {},
    { send: async (input) => notifications.push(input) },
    new AuditService(prisma),
  );

  const first = await service.register(attendee, event.slug);
  assert.deepEqual(first, {
    registered: true,
    status: RegistrationStatus.REGISTERED,
    alreadyRegistered: false,
    pointsAwarded: 7,
  });
  assert.equal(profilePoints, 7);
  assert.equal(audits[0].action, 'EVENT_REGISTRATION_CREATED');

  const duplicate = await service.register(attendee, event.slug);
  assert.equal(duplicate.alreadyRegistered, true);
  assert.equal(duplicate.pointsAwarded, 0);
  assert.equal(ledger.length, 1);
  assert.equal(audits.length, 1);

  const cancelled = await service.unregister(attendee, event.slug);
  assert.deepEqual(cancelled, {
    registered: false,
    status: RegistrationStatus.CANCELLED,
    pointsAwarded: 0,
  });
  assert.equal(audits[1].action, 'EVENT_REGISTRATION_CANCELLED');

  await assert.rejects(
    () => service.unregister(attendee, event.slug),
    /No tienes una inscripción activa/,
  );
  assert.equal(audits.length, 2);

  registration = { ...registration, status: RegistrationStatus.REGISTERED };
  event.startsAt = new Date(Date.now() - 1_000);
  await assert.rejects(
    () => service.unregister(attendee, event.slug),
    /después del inicio/,
  );
  assert.equal(registration.status, RegistrationStatus.REGISTERED);
  assert.equal(audits.length, 2, 'una cancelación rechazada no deja auditoría parcial');
});

test('la asistencia no se acredita antes del evento ni reactiva inscripciones canceladas', async () => {
  const manager = authUser('admin', ['ADMIN']);
  let transactionCalls = 0;
  const futureEvent = {
    id: 'event-future',
    slug: 'evento-futuro',
    organizerId: 'organizer',
    communityId: null,
    startsAt: new Date(Date.now() + 60_000),
  };
  const prisma = {
    event: { findUnique: async () => futureEvent },
    $transaction: async () => {
      transactionCalls += 1;
      assert.fail('no debe abrir una transacción antes del inicio');
    },
  };
  const service = new EventsService(prisma, {}, {}, {}, {});

  await assert.rejects(
    () => service.updateAttendance(manager, futureEvent.slug, 'registration-1', {
      status: RegistrationStatus.ATTENDED,
    }),
    /una vez iniciado/,
  );
  assert.equal(transactionCalls, 0);

  futureEvent.startsAt = new Date(Date.now() - 60_000);
  const cancelledTx = {
    eventRegistration: {
      findUnique: async () => ({
        id: 'registration-1',
        eventId: futureEvent.id,
        userId: 'student-1',
        status: RegistrationStatus.CANCELLED,
      }),
    },
  };
  prisma.$transaction = async (callback) => callback(cancelledTx);
  await assert.rejects(
    () => service.updateAttendance(manager, futureEvent.slug, 'registration-1', {
      status: RegistrationStatus.ATTENDED,
    }),
    /cancelada no puede reactivarse/,
  );
});
