import { createHash, timingSafeEqual } from 'crypto';

// Los JWT superan los 72 bytes que bcrypt compara. Una huella del token
// completo permite distinguir todas las rotaciones, incluida su firma.
export function hashRefreshToken(token: string): string {
  return `sha256:${createHash('sha256').update(token, 'utf8').digest('hex')}`;
}

export function matchesRefreshToken(token: string, hash: string): boolean {
  if (!/^sha256:[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(hashRefreshToken(token)), Buffer.from(hash));
}
