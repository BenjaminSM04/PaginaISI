const test = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { RegisterDto } = require('../dist/auth/auth.dto');
const { normalizeInstitutionalEmail } = require('../dist/auth/institutional-email');
const { hashRefreshToken, matchesRefreshToken } = require('../dist/auth/refresh-token-hash');
const { authEmailContent, AuthMailService } = require('../dist/auth/auth-mail.service');
const { ConfigService } = require('@nestjs/config');
const { validateEnvironment } = require('../dist/config/environment');

test('el registro acepta solo el dominio institucional exacto y normaliza mayúsculas y espacios externos', () => {
  const dto = email => plainToInstance(RegisterDto, { email, username: 'estudiante', fullName: 'Estudiante Univalle', password: 'Una frase larga privada' });
  assert.equal(normalizeInstitutionalEmail(' Persona@UNIVALLE.EDU '), 'persona@univalle.edu');
  assert.equal(validateSync(dto(' Persona@UNIVALLE.EDU ')).length, 0);
  for (const email of ['persona@gmail.com', 'persona@evilunivalle.edu', 'persona@univalle.edu.evil.com', 'persona@est.univalle.edu', 'persona@@univalle.edu', 'a b@univalle.edu']) {
    assert.throws(() => normalizeInstitutionalEmail(email));
    assert.ok(validateSync(dto(email)).some(error => error.property === 'email'));
  }
});

test('las huellas de sesión comparan también lo que aparece después de los primeros 72 bytes', () => {
  const prefix = 'a'.repeat(150);
  const first = `${prefix}.firma-original`;
  const second = `${prefix}.firma-rotada`;
  assert.notEqual(hashRefreshToken(first), hashRefreshToken(second));
  assert.equal(matchesRefreshToken(first, hashRefreshToken(first)), true);
  assert.equal(matchesRefreshToken(second, hashRefreshToken(first)), false);
  assert.equal(matchesRefreshToken(first, '$2b$12$legacy'), false);
});

test('las plantillas incluyen enlaces de un solo uso, vencimiento y una versión de texto', () => {
  for (const [type, ttl] of [['PASSWORD_RESET', '30 minutos'], ['EMAIL_VERIFICATION', '24 horas']]) {
    const content = authEmailContent(type, 'https://portal.univalle.edu/verificar-correo#token=seguro');
    assert.ok(content.text.includes(ttl)); assert.ok(content.html.includes(ttl));
    assert.ok(content.text.includes('#token=seguro')); assert.match(content.html, /#7B1113/);
  }
  assert.ok(!authEmailContent('PASSWORD_RESET', 'https://example.test/"<script>').html.includes('<script>'));
});

test('SMTP de producción exige credenciales, remitente válido y TLS coherente con el puerto', () => {
  const config = {
    NODE_ENV: 'production', DATABASE_URL: 'postgresql://test:test@db:5432/test', WEB_ORIGIN: 'https://portal.univalle.edu',
    JWT_ACCESS_SECRET: '0123456789abcdef'.repeat(4), JWT_REFRESH_SECRET: 'fedcba9876543210'.repeat(4),
    TOTP_ENCRYPTION_KEY: 'a1b2c3d4e5f60789'.repeat(4), SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_SECURE: 'true',
    SMTP_USER: 'mailer@example.test', SMTP_PASSWORD: 'isolated-test-only', AUTH_DEV_LINKS: 'false',
  };
  const result = validateEnvironment(config);
  assert.equal(result.SMTP_PORT, 465); assert.equal(result.SMTP_FROM, config.SMTP_USER);
  assert.doesNotThrow(() => validateEnvironment({ ...config, SMTP_PORT: '587', SMTP_SECURE: 'false' }));
  for (const override of [{ SMTP_PASSWORD: '' }, { SMTP_HOST: '' }, { SMTP_SECURE: 'false' }, { SMTP_PORT: '587' }, { SMTP_FROM: 'invalid' }, { SMTP_FROM_NAME: 'From\r\nBcc: other@example.test' }]) {
    assert.throws(() => validateEnvironment({ ...config, ...override }), /SMTP/);
  }
});

test('la entrega SMTP conserva enlaces y destinatario, rechaza fallos y no envía en modo de desarrollo', async () => {
  const config = new ConfigService({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: 465, SMTP_SECURE: true, SMTP_USER: 'mailer@example.test', SMTP_PASSWORD: 'isolated-test-only', SMTP_FROM: 'mailer@example.test', SMTP_FROM_NAME: 'Univalle', AUTH_DEV_LINKS: false });
  const mail = new AuthMailService(config);
  let message;
  mail.transport = { sendMail: async data => { message = data; return { accepted: ['student@univalle.edu'], rejected: [] }; }, close() {} };
  await mail.deliver('student@univalle.edu', 'PASSWORD_RESET', 'https://portal.univalle.edu/restablecer-contrasena#token=isolated', new Date());
  assert.deepEqual(message.to, { name: '', address: 'student@univalle.edu' });
  assert.ok(message.text.includes('#token=isolated'));
  mail.transport.sendMail = async () => { throw new Error('Provider failure with private details'); };
  mail.logger = { error() {} };
  await assert.rejects(() => mail.deliver('student@univalle.edu', 'PASSWORD_RESET', 'https://example.test', new Date()), error => error.getStatus() === 503 && !error.message.includes('private details'));
  config.set('AUTH_DEV_LINKS', true);
  await assert.doesNotReject(() => mail.deliver('student@univalle.edu', 'PASSWORD_RESET', 'https://example.test', new Date()));
  mail.onModuleDestroy();
});
