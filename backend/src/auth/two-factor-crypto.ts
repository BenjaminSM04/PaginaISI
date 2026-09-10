import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { Secret, TOTP } from 'otpauth';

function encryptionKey(value?: string) {
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) throw new ServiceUnavailableException('La autenticación de dos factores no está configurada. Contacta al administrador.');
  return Buffer.from(value, 'hex');
}

export function encryptTotp(secret: string, userId: string, key?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptTotp(value: string, userId: string, key?: string) {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Invalid encrypted credential');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(iv, 'base64url'));
  cipher.setAAD(Buffer.from(userId));
  cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(ciphertext, 'base64url')), cipher.final()]).toString('utf8');
}

export function createTotp(secret: string, label = '', issuer = 'Univalle') {
  return new TOTP({ issuer, label, algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secret) });
}

export function matchingCounter(secret: string, code: string, timestamp = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = createTotp(secret).validate({ token: code, timestamp, window: 1 });
  return delta === null ? null : Math.floor(timestamp / 30_000) + delta;
}
