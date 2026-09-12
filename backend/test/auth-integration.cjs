// Uses a disposable PostgreSQL container. Never reads the application's database URL.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const bcrypt = require('bcryptjs');
const { createTotp } = require('../dist/auth/two-factor-crypto');
const { AuthService } = require('../dist/auth/auth.service');
const { TwoFactorService } = require('../dist/auth/two-factor.service');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { ConfigService } = require('@nestjs/config');
const root = path.join(__dirname, '..');
const container = `univalle-auth-test-${randomBytes(6).toString('hex')}`;
const password = 'Una frase privada para pruebas';
let app, prisma, auth, factors, origin, started = false;
let mailServer;
const deliveries = [];
const mailSecret = randomBytes(32).toString('hex');
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 120000 }).trim();
const hash = value => createHash('sha256').update(value).digest('hex');

before(async () => {
  mailServer = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${mailSecret}`) { res.writeHead(401).end(); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    deliveries.push(JSON.parse(body));
    res.writeHead(204).end();
  });
  await new Promise(resolve => mailServer.listen(0, '127.0.0.1', resolve));
  docker('run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD=isolated-test-only', '-e', 'POSTGRES_DB=isi_security_test', '-p', '127.0.0.1::5432', 'postgres:16-alpine');
  started = true;
  const port = docker('port', container, '5432/tcp').split(':').at(-1);
  for (let i = 0; i < 100; i++) {
    // The image first starts a temporary Unix-socket server during initdb.
    // Only TCP readiness indicates that initialization and its restart finished.
    try { docker('exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'isi_security_test'); break; }
    catch { if (i === 99) throw new Error('PostgreSQL no inició'); await new Promise(r => setTimeout(r, 200)); }
  }
  Object.assign(process.env, {
    DATABASE_URL: `postgresql://postgres:isolated-test-only@127.0.0.1:${port}/isi_security_test`,
    NODE_ENV: 'test', WEB_ORIGIN: 'http://localhost:3000', PUBLIC_WEB_URL: 'http://localhost:3000', PUBLIC_API_URL: 'http://localhost:4000',
    JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
    TOTP_ENCRYPTION_KEY: randomBytes(32).toString('hex'), AUTH_DEV_LINKS: 'false', STORAGE_DRIVER: 'local',
    AUTH_EMAIL_WEBHOOK_URL: `http://127.0.0.1:${mailServer.address().port}/auth`, AUTH_EMAIL_WEBHOOK_SECRET: mailSecret, SECURITY_ALERT_WEBHOOK_URL: '', SECURITY_ALERT_WEBHOOK_SECRET: '',
    SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '', SMTP_FROM: '',
    CLEAN_ORPHAN_UPLOADS_ON_START: 'false', SEED_ON_FIRST_RUN: 'false',
  });
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: root, env: process.env, windowsHide: true, timeout: 120000, stdio: 'pipe', encoding: 'utf8' });
  const { NestFactory } = require('@nestjs/core');
  const { ValidationPipe } = require('@nestjs/common');
  const { AppModule } = require('../dist/app.module');
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.use(require('cookie-parser')());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, validationError: { target: false, value: false } }));
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  prisma = app.get(PrismaService); auth = app.get(AuthService);
  factors = new TwoFactorService(prisma, app.get(ConfigService));
}, { timeout: 180000 });

after(async () => {
  try { if (app) await app.close(); }
  finally {
    if (mailServer) await new Promise(resolve => mailServer.close(resolve));
    if (started) docker('stop', container);
  }
});

async function user(overrides = {}) {
  const name = `usuario-${randomBytes(6).toString('hex')}`;
  return prisma.user.create({ data: { username: name, email: `${name}@example.test`, passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date(), profile: { create: { fullName: 'Cuenta de prueba aislada' } }, ...overrides } });
}
async function enable(account) {
  const setup = await factors.beginSetup(account.id, password);
  const activated = await factors.confirmSetup(account.id, password, createTotp(setup.secret).generate());
  return { setup, activated, user: await prisma.user.findUnique({ where: { id: account.id } }) };
}
async function request(route, body, token, cookie) {
  return fetch(`${origin}/api${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function delivered(email, type) {
  for (let i = 0; i < 100; i++) {
    const mail = deliveries.find(value => value.to === email && value.type === type);
    if (mail) return mail;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(`No llegó el correo aislado de ${type}`);
}

test('la API rechaza dominios externos y bloquea a la cuenta institucional hasta verificar su correo', async () => {
  const dto = { username: 'registro-institucional', email: ' Persona@UNIVALLE.EDU ', fullName: 'Estudiante Univalle', password };
  for (const email of ['persona@gmail.com', 'persona@univalle.edu.evil.test']) {
    const rejected = await request('/auth/register', { ...dto, email });
    assert.equal(rejected.status, 400);
    assert.equal(await prisma.user.count({ where: { username: dto.username } }), 0);
  }
  const response = await request('/auth/register', dto);
  assert.equal(response.status, 201);
  const session = await response.json();
  assert.equal(session.user.email, 'persona@univalle.edu');
  assert.equal(session.user.emailVerifiedAt, null);
  assert.equal(session.emailVerificationPreviewUrl, undefined);
  assert.equal((await request('/admin/dashboard', undefined, session.accessToken)).status, 403);
  assert.equal((await request('/users/directory/search', undefined, session.accessToken)).status, 403);
  assert.equal((await request(`/users/${dto.username}`)).status, 404);
  const mail = await delivered('persona@univalle.edu', 'EMAIL_VERIFICATION');
  assert.equal(new URL(mail.actionUrl).pathname, '/verificar-correo');
  const token = new URLSearchParams(new URL(mail.actionUrl).hash.slice(1)).get('token');
  const stored = await prisma.authActionToken.findUnique({ where: { tokenHash: hash(token) } });
  assert.ok(stored); assert.ok(!JSON.stringify(stored).includes(token));
  const verified = await request('/auth/email/verify', { token });
  assert.equal(verified.status, 201);
  assert.equal((await request('/auth/email/verify', { token })).status, 400);
  assert.equal((await request(`/users/${dto.username}`)).status, 200);
  assert.equal((await request('/users/directory/search', undefined, session.accessToken)).status, 200);
  // El correo verificado no concede privilegios de administrador.
  assert.equal((await request('/admin/dashboard', undefined, session.accessToken)).status, 403);
});

test('la recuperación entrega el enlace configurado, oculta la existencia de la cuenta e invalida sesiones y tokens', async () => {
  const account = await user();
  const session = await auth.login({ identifier: account.username, password });
  const known = await request('/auth/password/forgot', { email: account.email });
  const unknown = await request('/auth/password/forgot', { email: 'inexistente@univalle.edu' });
  assert.equal(known.status, 201); assert.equal(unknown.status, 201);
  assert.deepEqual(await known.json(), await unknown.json());
  const mail = await delivered(account.email, 'PASSWORD_RESET');
  assert.equal(new URL(mail.actionUrl).origin, 'http://localhost:3000');
  assert.equal(new URL(mail.actionUrl).pathname, '/restablecer-contrasena');
  const token = new URLSearchParams(new URL(mail.actionUrl).hash.slice(1)).get('token');
  const newPassword = 'Otra frase privada distinta para acceso';
  const reset = await request('/auth/password/reset', { token, newPassword });
  assert.equal(reset.status, 201);
  assert.equal((await request('/auth/password/reset', { token, newPassword })).status, 400);
  assert.equal((await request('/auth/me', undefined, session.accessToken)).status, 401);
  await assert.rejects(() => auth.refresh(session.refreshToken), /inválida/);
  await assert.rejects(() => auth.login({ identifier: account.username, password }), /inválidas/);
  assert.ok((await auth.login({ identifier: account.username, password: newPassword })).accessToken);
});

test('la rotación distingue JWT completos y rechaza un refresh reutilizado fuera de la ventana de concurrencia', async () => {
  const account = await user();
  const initial = await auth.login({ identifier: account.username, password });
  const rotated = await auth.refresh(initial.refreshToken);
  assert.notEqual(initial.refreshToken, rotated.refreshToken);
  assert.equal(initial.refreshToken.slice(0, 72), rotated.refreshToken.slice(0, 72));
  const concurrent = await auth.refresh(initial.refreshToken);
  assert.ok(concurrent.accessToken); assert.equal(concurrent.refreshToken, undefined);
  await prisma.refreshSession.updateMany({ where: { userId: account.id }, data: { previousValidUntil: new Date(0) } });
  await assert.rejects(() => auth.refresh(initial.refreshToken), /inválida/);
  await assert.rejects(() => auth.refresh(rotated.refreshToken), /inválida/);
});

test('ranking rechaza filtros inválidos y aplica elegibilidad antes de limitar la clasificación mensual', async () => {
  for (const query of ['limit=-1', 'limit=1.5', 'category=invalid&period=month', 'period=invalid']) {
    assert.equal((await request(`/ranking?${query}`)).status, 400);
  }
  const role = await prisma.role.upsert({ where: { name: 'STUDENT' }, create: { name: 'STUDENT' }, update: {} });
  const eligible = await user({ roles: { create: [{ roleId: role.id }] } });
  const excluded = await user({ isActive: false, roles: { create: [{ roleId: role.id }] } });
  const teacher = await user();
  for (const [account, points] of [[eligible, 500], [excluded, 1000], [teacher, 2000]]) {
    await prisma.pointsTransaction.create({ data: { userId: account.id, category: 'COMMUNITY', reason: 'REGISTRO_COMPLETO', points } });
  }
  const result = await request('/ranking?period=month&limit=1');
  assert.equal(result.status, 200);
  const ranking = await result.json();
  assert.equal(ranking.length, 1); assert.equal(ranking[0].userId, eligible.id); assert.equal(ranking[0].points, 500);
});

test('un reporte se resuelve una sola vez y los puntos corresponden a la decisión confirmada', async () => {
  const { ReportsService } = require('../dist/reports/reports.module');
  const reports = app.get(ReportsService);
  const reporter = await user(), target = await user(), admin = await user();
  await assert.rejects(() => reports.create({ id: reporter.id }, { targetType: 'USER', targetId: 'inexistente', reason: 'Reporte aislado de seguridad' }), /no existe/);
  await prisma.pointRule.upsert({ where: { reason: 'REPORTE_VALIDO' }, create: { reason: 'REPORTE_VALIDO', category: 'COMMUNITY', points: 5, label: 'Reporte válido' }, update: { points: 5, isActive: true } });
  const report = await reports.create({ id: reporter.id }, { targetType: 'USER', targetId: target.id, reason: 'Reporte aislado de seguridad' });
  const results = await Promise.allSettled([
    reports.resolve({ id: admin.id, roles: ['ADMIN'] }, report.id, { status: 'VALID' }),
    reports.resolve({ id: admin.id, roles: ['ADMIN'] }, report.id, { status: 'DISMISSED' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const confirmed = await prisma.report.findUnique({ where: { id: report.id } });
  assert.equal(await prisma.pointsTransaction.count({ where: { sourceType: 'REPORT', sourceId: report.id } }), confirmed.status === 'VALID' ? 1 : 0);
});

test('cambios concurrentes de roles conservan al menos un administrador activo', async () => {
  const { AdminService } = require('../dist/admin/admin.module');
  const admin = app.get(AdminService);
  const role = await prisma.role.upsert({ where: { name: 'ADMIN' }, create: { name: 'ADMIN' }, update: {} });
  const first = await user({ roles: { create: [{ roleId: role.id }] } });
  const second = await user({ roles: { create: [{ roleId: role.id }] } });
  const results = await Promise.allSettled([
    admin.updateUser(first.id, second.id, { roles: ['STUDENT'] }),
    admin.updateUser(second.id, first.id, { roles: ['STUDENT'] }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await prisma.user.count({ where: { isActive: true, roles: { some: { role: { name: 'ADMIN' } } } } }), 1);
});

test('el inicializador de despliegue conserva configuraciones y revoca accesos al restablecer una contraseña', async () => {
  const account = await user();
  const session = await auth.login({ identifier: account.username, password });
  const adminEnvironment = { ...process.env, ADMIN_SEED_EMAIL: account.email, ADMIN_SEED_USERNAME: account.username, ADMIN_SEED_PASSWORD: password, ADMIN_SEED_RESET_PASSWORD: 'false' };
  const seed = env => execFileSync(process.execPath, [require.resolve('ts-node/dist/bin.js'), '--transpile-only', 'prisma/seed-deploy.ts'], { cwd: root, env, windowsHide: true, timeout: 30000, stdio: 'pipe' });
  await prisma.pointRule.upsert({ where: { reason: 'REPORTE_VALIDO' }, create: { reason: 'REPORTE_VALIDO', category: 'COMMUNITY', points: 17, label: 'Regla institucional' }, update: { points: 17 } });
  seed(adminEnvironment);
  assert.equal((await prisma.pointRule.findUnique({ where: { reason: 'REPORTE_VALIDO' } })).points, 17);
  assert.equal((await request('/auth/me', undefined, session.accessToken)).status, 200);
  seed({ ...adminEnvironment, ADMIN_SEED_RESET_PASSWORD: 'true', ADMIN_SEED_PASSWORD: 'Nueva frase privada de administración' });
  assert.equal((await request('/auth/me', undefined, session.accessToken)).status, 401);
  await assert.rejects(() => auth.refresh(session.refreshToken), /inválida/);
  const updated = await prisma.user.findUnique({ where: { id: account.id } });
  assert.equal(updated.mustChangePassword, true);
  assert.ok(await bcrypt.compare('Nueva frase privada de administración', updated.passwordHash));
});

test('la migración conserva la contraseña predeterminada y la API obliga a cambiarla antes de acceder', async () => {
  const originalHash = await bcrypt.hash('password123', 4);
  const account = await user({ username: 'admin', passwordHash: originalHash });
  const migration = readFileSync(path.join(root, 'prisma/migrations/20260909200000_password_policy_totp/migration.sql'), 'utf8');
  await prisma.$executeRawUnsafe(migration.match(/UPDATE "User"[\s\S]*?;/)[0]);
  const migrated = await prisma.user.findUnique({ where: { id: account.id } });
  assert.equal(migrated.passwordHash, originalHash); assert.equal(migrated.mustChangePassword, true);
  const response = await request('/auth/login', { identifier: 'admin', password: 'password123' });
  assert.equal(response.status, 201);
  const session = await response.json();
  assert.equal(session.user.mustChangePassword, true);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await request('/auth/me', undefined, session.accessToken)).status, 200);
  const blocked = await request('/auth/sessions', undefined, session.accessToken);
  assert.equal(blocked.status, 403); assert.equal((await blocked.json()).code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await request('/auth/two-factor/setup', { password: 'password123' }, session.accessToken)).status, 403);
  const refreshed = await request('/auth/refresh', {}, undefined, response.headers.getSetCookie()[0].split(';')[0]);
  assert.equal((await refreshed.json()).user.mustChangePassword, true);
  const weak = await request('/auth/password/change', { currentPassword: 'password123', newPassword: '123456789012' }, session.accessToken);
  assert.equal(weak.status, 400);
  assert.equal((await prisma.user.findUnique({ where: { id: account.id } })).mustChangePassword, true);
  const changed = await request('/auth/password/change', { currentPassword: 'password123', newPassword: password }, session.accessToken);
  assert.equal(changed.status, 201);
  const next = await changed.json();
  assert.equal((await request('/auth/sessions', undefined, next.accessToken)).status, 200);
  assert.equal((await request('/auth/me', undefined, session.accessToken)).status, 401);
  assert.equal((await prisma.user.findUnique({ where: { id: account.id } })).mustChangePassword, false);
});

test('la configuración guarda solo texto cifrado y expira sin habilitar 2FA', async () => {
  const account = await user();
  await assert.rejects(() => factors.beginSetup(account.id, 'incorrecta'), /contraseña actual/);
  const setup = await factors.beginSetup(account.id, password);
  assert.match(setup.qrCode, /^data:image\/png;base64,/);
  const stored = await prisma.twoFactorCredential.findUnique({ where: { userId: account.id } });
  assert.ok(!JSON.stringify(stored).includes(setup.secret)); assert.equal(stored.secretEncrypted, null);
  assert.equal((await prisma.user.findUnique({ where: { id: account.id } })).twoFactorEnabled, false);
  await prisma.twoFactorCredential.update({ where: { userId: account.id }, data: { pendingExpiresAt: new Date(0) } });
  await assert.rejects(() => factors.confirmSetup(account.id, password, createTotp(setup.secret).generate()), /expirada/);
  assert.equal((await prisma.user.findUnique({ where: { id: account.id } })).twoFactorEnabled, false);
});

test('habilitar 2FA revoca sesiones; login no entrega tokens ni cookie antes del segundo factor', async () => {
  const account = await user();
  const previous = await auth.login({ identifier: account.username, password });
  const { activated } = await enable(account);
  assert.equal((await request('/auth/me', undefined, previous.accessToken)).status, 401);
  await assert.rejects(() => auth.refresh(previous.refreshToken), /inválida/);
  const response = await request('/auth/login', { identifier: account.username, password });
  const challenge = await response.json();
  assert.equal(response.status, 201); assert.equal(challenge.requiresTwoFactor, true);
  assert.equal(challenge.accessToken, undefined); assert.equal(challenge.user, undefined);
  assert.deepEqual(response.headers.getSetCookie(), []);
  const stored = await prisma.twoFactorChallenge.findUnique({ where: { tokenHash: hash(challenge.challengeToken) } });
  assert.ok(stored); assert.ok(!JSON.stringify(stored).includes(challenge.challengeToken));
  const verified = await request('/auth/two-factor/verify', { challengeToken: challenge.challengeToken, code: activated.recoveryCodes[0] });
  assert.equal(verified.status, 201); assert.equal(verified.headers.get('cache-control'), 'no-store');
  assert.match(verified.headers.getSetCookie()[0], /HttpOnly/);
  const session = await verified.json(); assert.ok(session.accessToken); assert.equal(session.user.twoFactorEnabled, true);
  assert.equal(session.refreshToken, undefined); assert.equal(session.user.twoFactorCredential, undefined);
  const replay = await request('/auth/two-factor/verify', { challengeToken: challenge.challengeToken, code: activated.recoveryCodes[1] });
  assert.equal(replay.status, 401); assert.deepEqual(replay.headers.getSetCookie(), []);
});

test('TOTP y códigos de recuperación solo se consumen una vez incluso con verificaciones simultáneas', async () => {
  const account = await user(); const ready = await enable(account);
  // Use the next accepted timestep; the enrollment code has already been consumed.
  const code = createTotp(ready.setup.secret).generate({ timestamp: Date.now() + 30000 });
  const challenges = await Promise.all([factors.challenge(ready.user), factors.challenge(ready.user)]);
  const results = await Promise.allSettled(challenges.map(c => factors.verifyLogin(c.challengeToken, code)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const recovery = ready.activated.recoveryCodes[0];
  const other = await Promise.all([factors.challenge(ready.user), factors.challenge(ready.user)]);
  const recovered = await Promise.allSettled(other.map(c => factors.verifyLogin(c.challengeToken, recovery)));
  assert.equal(recovered.filter(r => r.status === 'fulfilled').length, 1);
  const stored = await prisma.twoFactorCredential.findUnique({ where: { userId: account.id } });
  assert.equal(stored.recoveryHashes.length, 9); assert.ok(!JSON.stringify(stored).includes(recovery));
});

test('los intentos se limitan por cuenta aunque se emitan desafíos nuevos y se restablecen tras el bloqueo', async () => {
  const account = await user(); const ready = await enable(account);
  for (let i = 0; i < 5; i++) {
    const challenge = await factors.challenge(ready.user);
    await assert.rejects(() => factors.verifyLogin(challenge.challengeToken, '00000000000000000000'), /incorrecto/);
  }
  const challenge = await factors.challenge(ready.user);
  await assert.rejects(() => factors.verifyLogin(challenge.challengeToken, ready.activated.recoveryCodes[0]), e => e.getStatus() === 429);
  await prisma.twoFactorCredential.update({ where: { userId: account.id }, data: { blockedUntil: new Date(0) } });
  assert.equal((await factors.verifyLogin(challenge.challengeToken, ready.activated.recoveryCodes[0])).userId, account.id);
});

test('desafíos vencidos y de una versión anterior de la cuenta no autentican', async () => {
  const account = await user(); const ready = await enable(account);
  const expired = await factors.challenge(ready.user);
  await prisma.twoFactorChallenge.update({ where: { tokenHash: hash(expired.challengeToken) }, data: { expiresAt: new Date(0) } });
  await assert.rejects(() => factors.verifyLogin(expired.challengeToken, ready.activated.recoveryCodes[0]), /expiró/);
  const stale = await factors.challenge(ready.user);
  await prisma.user.update({ where: { id: account.id }, data: { securityVersion: { increment: 1 } } });
  await assert.rejects(() => factors.verifyLogin(stale.challengeToken, ready.activated.recoveryCodes[0]), /cuenta cambió/);
  assert.equal((await prisma.twoFactorCredential.findUnique({ where: { userId: account.id } })).recoveryHashes.length, 10);
});

test('desactivar exige contraseña y factor, elimina secretos y revoca sesiones anteriores', async () => {
  const account = await user(); const ready = await enable(account);
  const challenge = await factors.challenge(ready.user);
  const session = await auth.verifyTwoFactor(challenge.challengeToken, ready.activated.recoveryCodes[0]);
  await assert.rejects(() => factors.disable(account.id, 'incorrecta', ready.activated.recoveryCodes[1]), /contraseña actual/);
  await assert.rejects(() => factors.disable(account.id, password, '00000000000000000000'), /incorrecto/);
  const disabled = await auth.updateTwoFactor(account.id, password, ready.activated.recoveryCodes[1], false);
  assert.equal(disabled.user.twoFactorEnabled, false);
  assert.equal((await request('/auth/me', undefined, session.accessToken)).status, 401);
  assert.equal((await request('/auth/me', undefined, disabled.accessToken)).status, 200);
  const factor = await prisma.twoFactorCredential.findUnique({ where: { userId: account.id } });
  assert.equal(factor.secretEncrypted, null); assert.equal(factor.pendingEncrypted, null); assert.deepEqual(factor.recoveryHashes, []);
});

test('recuperar la contraseña libera el primer acceso pero conserva 2FA', async () => {
  const account = await user(); const ready = await enable(account);
  await prisma.user.update({ where: { id: account.id }, data: { mustChangePassword: true } });
  const token = randomBytes(32).toString('base64url');
  await prisma.authActionToken.create({ data: { userId: account.id, type: 'PASSWORD_RESET', tokenHash: hash(token), expiresAt: new Date(Date.now() + 60000) } });
  await auth.resetPassword({ token, newPassword: 'Otra frase privada para recuperar' });
  const updated = await prisma.user.findUnique({ where: { id: account.id } });
  assert.equal(updated.mustChangePassword, false); assert.equal(updated.twoFactorEnabled, true);
  const challenge = await auth.login({ identifier: account.username, password: 'Otra frase privada para recuperar' });
  assert.equal(challenge.requiresTwoFactor, true);
  assert.equal((await factors.verifyLogin(challenge.challengeToken, ready.activated.recoveryCodes[0])).userId, account.id);
});

test('la migración de identidad aplica guindo y conserva logos y colores de estados', async () => {
  await prisma.institutionalSettings.update({ where: { id: 'default' }, data: { institutionalLogoUrl: '/uploads/marca.webp', theme: { light: { primary: '#123456', success: '#15803d' } } } });
  const migration = readFileSync(path.join(root, 'prisma/migrations/20260909201000_univalle_burgundy/migration.sql'), 'utf8');
  await prisma.$executeRawUnsafe(migration);
  const settings = await prisma.institutionalSettings.findUnique({ where: { id: 'default' } });
  assert.equal(settings.theme.light.primary, '#7b1113'); assert.equal(settings.theme.light.success, '#15803d');
  assert.equal(settings.theme.dark.background, '#121212'); assert.equal(settings.institutionalLogoUrl, '/uploads/marca.webp');
});
