import { BadRequestException } from '@nestjs/common';

export const INSTITUTIONAL_EMAIL_PATTERN = /^[^\s@]+@univalle\.edu$/i;
export const INSTITUTIONAL_EMAIL_MESSAGE = 'Usa tu correo institucional @univalle.edu';

export function normalizeInstitutionalEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!INSTITUTIONAL_EMAIL_PATTERN.test(normalized)) {
    throw new BadRequestException(INSTITUTIONAL_EMAIL_MESSAGE);
  }
  return normalized;
}
