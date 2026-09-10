const test = require('node:test');
const assert = require('node:assert/strict');

const { validateEnvironment } = require('../dist/config/environment');
const { clean, paginate, slugify } = require('../dist/common/utils');
const { hasValidFileSignature, StorageService } = require('../dist/storage/storage.module');
const { optimizeImage, OUTPUT_IMAGE_DIMENSION } = require('../dist/storage/image-optimizer');
const { normalizeForumTags, parseForumTagFilter } = require('../dist/forum/forum.module');
const { hashAuthActionToken } = require('../dist/auth/auth.service');
const sharp = require('sharp');

const validEnvironment = (overrides = {}) => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://isi:password@db:5432/isi_portal?schema=public',
  WEB_ORIGIN: 'https://portal.example.edu',
  JWT_ACCESS_SECRET: '0123456789abcdef'.repeat(4),
  JWT_REFRESH_SECRET: 'fedcba9876543210'.repeat(4),
  TOTP_ENCRYPTION_KEY: 'a1b2c3d4e5f60789'.repeat(4),
  AUTH_EMAIL_WEBHOOK_URL: 'https://mailer.example.edu/auth-links',
  AUTH_EMAIL_WEBHOOK_SECRET: '0123456789abcdef0123456789abcdef',
  STORAGE_DRIVER: 'local',
  ...overrides,
});

test('la configuración rechaza secretos débiles o reutilizados', () => {
  assert.throws(
    () => validateEnvironment(validEnvironment({ JWT_ACCESS_SECRET: 'change-me' })),
    /JWT_ACCESS_SECRET/,
  );
  const shared = '0123456789abcdef'.repeat(4);
  assert.throws(
    () => validateEnvironment(validEnvironment({ JWT_ACCESS_SECRET: shared, JWT_REFRESH_SECRET: shared })),
    /deben ser distintos/,
  );
});

test('la configuración permite HTTP solo para el loopback local', () => {
  const local = validateEnvironment(validEnvironment({ WEB_ORIGIN: 'http://localhost:3000' }));
  assert.deepEqual(local.WEB_ORIGINS, ['http://localhost:3000']);
  assert.throws(
    () => validateEnvironment(validEnvironment({ WEB_ORIGIN: 'http://portal.example.edu' })),
    /deben usar HTTPS/,
  );
});

test('producción exige una clave TOTP independiente de 32 bytes hexadecimales', () => {
  for (const value of [undefined, 'corta', 'z'.repeat(64), validEnvironment().JWT_ACCESS_SECRET]) {
    assert.throws(() => validateEnvironment(validEnvironment({ TOTP_ENCRYPTION_KEY: value })), /TOTP_ENCRYPTION_KEY/);
  }
  assert.equal(validateEnvironment(validEnvironment()).TOTP_ENCRYPTION_KEY, validEnvironment().TOTP_ENCRYPTION_KEY);
});

test('los enlaces de autenticación para demo solo se habilitan en un origen local', () => {
  const local = validateEnvironment(validEnvironment({
    WEB_ORIGIN: 'http://localhost:3000',
    AUTH_DEV_LINKS: 'true',
  }));
  assert.equal(local.AUTH_DEV_LINKS, true);
  assert.throws(
    () => validateEnvironment(validEnvironment({ AUTH_DEV_LINKS: 'true' })),
    /AUTH_DEV_LINKS.*local/,
  );
});

test('el webhook de alertas exige HTTPS externo y un secreto independiente de 32 bytes', () => {
  const configured = validateEnvironment(validEnvironment({
    SECURITY_ALERT_WEBHOOK_URL: 'https://security.example.edu/project-audit',
    SECURITY_ALERT_WEBHOOK_SECRET: 'alert-secret-0123456789abcdef0123456789',
  }));
  assert.equal(configured.SECURITY_ALERT_WEBHOOK_URL, 'https://security.example.edu/project-audit');

  assert.throws(
    () => validateEnvironment(validEnvironment({
      SECURITY_ALERT_WEBHOOK_URL: 'http://security.example.edu/project-audit',
      SECURITY_ALERT_WEBHOOK_SECRET: 'alert-secret-0123456789abcdef0123456789',
    })),
    /SECURITY_ALERT_WEBHOOK_URL.*HTTPS/,
  );
  assert.throws(
    () => validateEnvironment(validEnvironment({
      SECURITY_ALERT_WEBHOOK_URL: 'https://security.example.edu/project-audit',
      SECURITY_ALERT_WEBHOOK_SECRET: 'demasiado-corto',
    })),
    /SECURITY_ALERT_WEBHOOK_SECRET.*32 bytes/,
  );
  assert.throws(
    () => validateEnvironment(validEnvironment({
      SECURITY_ALERT_WEBHOOK_SECRET: 'alert-secret-0123456789abcdef0123456789',
    })),
    /requiere SECURITY_ALERT_WEBHOOK_URL/,
  );
});

test('la configuración limita cuota de almacenamiento y activa limpieza conservadora', () => {
  const config = validateEnvironment(validEnvironment({ STORAGE_BYTES_PER_USER: String(32 * 1024 * 1024) }));
  assert.equal(config.STORAGE_BYTES_PER_USER, 32 * 1024 * 1024);
  assert.equal(config.CLEAN_ORPHAN_UPLOADS_ON_START, true);
  assert.throws(
    () => validateEnvironment(validEnvironment({ STORAGE_BYTES_PER_USER: '1024' })),
    /STORAGE_BYTES_PER_USER/,
  );
});

test('los tokens de recuperación se almacenan como huellas SHA-256', () => {
  const token = 'a'.repeat(43);
  const hash = hashAuthActionToken(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(hashAuthActionToken(token), hash);
  assert.notEqual(hashAuthActionToken(`${token}b`), hash);
});

test('la sanitización elimina atributos y protocolos ejecutables', () => {
  const result = clean('<a href="javascript:alert(1)" onclick="alert(1)">enlace</a>');
  assert.equal(result, '<a>enlace</a>');
  assert.equal(slugify('  Ingeniería de Sistemas  '), 'ingenieria-de-sistemas');
});

test('la paginación limita entradas hostiles', () => {
  assert.deepEqual(paginate(-10, 10_000), { take: 50, skip: 0, page: 1 });
});

test('el upload valida la firma real y no solo el MIME declarado', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pdf = Buffer.from('%PDF-1.7\n', 'ascii');
  assert.equal(hasValidFileSignature(png, 'image/png'), true);
  assert.equal(hasValidFileSignature(pdf, 'application/pdf'), true);
  assert.equal(hasValidFileSignature(Buffer.from('<script>'), 'image/png'), false);
  assert.equal(hasValidFileSignature(png, 'application/pdf'), false);
});

test('una portada usada solo por una versión pendiente no se trata como archivo huérfano', async () => {
  const countZero = { count: async () => 0 };
  const projectVersionFilters = [];
  const prisma = {
    mediaAsset: {
      findUnique: async () => ({
        id: 'asset-pending-cover',
        url: 'https://api.example.test/uploads/pending.webp',
        uploaderId: 'owner',
        projectId: null,
        forumQuestionId: null,
        forumAnswerId: null,
        eventId: null,
        mentorshipId: null,
        ideaProposalId: null,
      }),
    },
    profile: countZero,
    community: countZero,
    institutionalSettings: countZero,
    incubatorClient: countZero,
    news: countZero,
    project: countZero,
    projectVersion: {
      count: async ({ where }) => {
        projectVersionFilters.push(where);
        return 1;
      },
    },
    article: countZero,
    event: countZero,
    mentorship: countZero,
    ideaProposal: countZero,
  };
  const service = new StorageService(prisma, {}, {}, {}, {});

  await assert.rejects(
    () => service.deleteOwnedUnlinked({ id: 'owner', roles: [] }, 'asset-pending-cover'),
    /está en uso/,
  );
  assert.equal(projectVersionFilters.some((where) =>
    where.snapshot.path?.[0] === 'coverUrl'
    && where.snapshot.equals === 'https://api.example.test/uploads/pending.webp'
  ), true);
  assert.equal(projectVersionFilters.some((where) =>
    where.snapshot.path?.[0] === 'clients'
    && where.snapshot.array_contains?.[0]?.logoUrl === 'https://api.example.test/uploads/pending.webp'
  ), true);
});

test('los tags del foro son libres, estables y no pueden superar cinco', () => {
  assert.deepEqual(
    normalizeForumTags(['  NestJS ', '#Prisma', 'visión computacional', 'C++', 'nestjs']),
    ['nestjs', 'prisma', 'visión-computacional', 'c++'],
  );
  assert.deepEqual(parseForumTagFilter('nestjs,prisma'), ['nestjs', 'prisma']);
  assert.throws(
    () => normalizeForumTags(['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis']),
    /hasta 5 tags/,
  );
  assert.throws(() => normalizeForumTags(['<script>']), /Tag inválido/);
});

test('las imágenes se reencodifican a WebP, sin metadatos y con dimensiones acotadas', async () => {
  const source = await sharp({
    create: { width: 2_400, height: 1_200, channels: 3, background: { r: 20, g: 100, b: 180 } },
  }).jpeg({ quality: 95 }).withMetadata({ orientation: 1 }).toBuffer();

  const optimized = await optimizeImage(source, 'image/jpeg');
  const metadata = await sharp(optimized.buffer).metadata();
  assert.equal(optimized.mime, 'image/webp');
  assert.equal(metadata.format, 'webp');
  assert.ok(optimized.width <= OUTPUT_IMAGE_DIMENSION);
  assert.ok(optimized.height <= OUTPUT_IMAGE_DIMENSION);
  assert.equal(metadata.exif, undefined);
});
