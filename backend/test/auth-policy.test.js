const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Secret } = require('otpauth');
const { encryptTotp, decryptTotp, createTotp, matchingCounter } = require('../dist/auth/two-factor-crypto');
const { assertNewPassword } = require('../dist/auth/password-policy');
const { PasswordChangeGuard } = require('../dist/common/guards');
const { AuthController } = require('../dist/auth/auth.controller');
const { Reflector } = require('@nestjs/core');

test('TOTP SHA-1 de seis dígitos coincide con los vectores RFC 6238', () => {
  const secret = Secret.fromUTF8('12345678901234567890').base32;
  for (const [seconds, expected] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']]) {
    assert.equal(createTotp(secret).generate({ timestamp: seconds * 1000 }), expected);
    assert.equal(matchingCounter(secret, expected, seconds * 1000), Math.floor(seconds / 30));
    assert.equal(matchingCounter(secret, expected, (seconds + 90) * 1000), null);
  }
  assert.equal(matchingCounter(secret, '12345'), null);
  assert.equal(matchingCounter(secret, '1234567'), null);
  assert.equal(matchingCounter(secret, 'abcdef'), null);
});

test('el secreto cifrado exige la clave, la cuenta y una etiqueta GCM intacta', () => {
  const key = randomBytes(32).toString('hex');
  const secret = new Secret({ size: 20 }).base32;
  const ciphertext = encryptTotp(secret, 'user-a', key);
  assert.equal(decryptTotp(ciphertext, 'user-a', key), secret);
  assert.notEqual(encryptTotp(secret, 'user-a', key), ciphertext);
  assert.ok(!ciphertext.includes(secret));
  assert.throws(() => decryptTotp(ciphertext, 'user-b', key));
  assert.throws(() => decryptTotp(ciphertext, 'user-a', randomBytes(32).toString('hex')));
  const parts = ciphertext.split('.');
  const tag = Buffer.from(parts[2], 'base64url'); tag[0] ^= 1; parts[2] = tag.toString('base64url');
  assert.throws(() => decryptTotp(parts.join('.'), 'user-a', key));
  assert.throws(() => encryptTotp(secret, 'user-a'), /no está configurada/);
});

test('la contraseña nueva admite frases y rechaza valores cortos, predecibles o truncados por bcrypt', () => {
  assert.doesNotThrow(() => assertNewPassword('Una frase privada del usuario'));
  for (const value of ['password123', 'password12345678', 'aaaaaaaaaaaa', 'Univalle123456', '12345678901234', '🙂'.repeat(19), ' '.repeat(15), null]) {
    assert.throws(() => assertNewPassword(value));
  }
});

test('el cambio obligatorio bloquea también a administradores y solo permite las rutas de salida', () => {
  const guard = new PasswordChangeGuard(new Reflector());
  const context = (method, user) => ({
    getHandler: () => AuthController.prototype[method], getClass: () => AuthController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  });
  const user = { roles: ['ADMIN'], mustChangePassword: true };
  for (const method of ['sessions', 'setupTwoFactor', 'enableTwoFactor', 'disableTwoFactor', 'requestEmailVerification']) {
    assert.throws(() => guard.canActivate(context(method, user)), error => error.getStatus() === 403 && error.getResponse().code === 'PASSWORD_CHANGE_REQUIRED');
  }
  for (const method of ['me', 'changePassword', 'resetPassword', 'refresh', 'logout']) assert.equal(guard.canActivate(context(method, user)), true);
  assert.equal(guard.canActivate(context('sessions', { ...user, mustChangePassword: false })), true);
});
