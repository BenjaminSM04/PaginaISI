import { BadRequestException } from '@nestjs/common';

export const INSTITUTIONAL_EMAIL_PATTERN = /^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*univalle\.edu$/i;
export const INSTITUTIONAL_EMAIL_MESSAGE = 'Usa tu correo de univalle.edu o de un subdominio institucional, como est.univalle.edu';

export function normalizeInstitutionalEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!INSTITUTIONAL_EMAIL_PATTERN.test(normalized)) {
    throw new BadRequestException(INSTITUTIONAL_EMAIL_MESSAGE);
  }
  return normalized;
}
