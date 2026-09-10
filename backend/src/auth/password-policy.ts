import { BadRequestException } from '@nestjs/common';

// A passphrase is allowed; no arbitrary composition rules. Enforce bcrypt's byte limit.
export function assertNewPassword(password: string) {
  if (typeof password !== 'string' || password.trim().length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new BadRequestException('Usa una contraseña de al menos 12 caracteres y hasta 72 bytes UTF-8. Puedes utilizar una frase larga.');
  }
  if (/^(.)\1+$/.test(password) || /^(password|contrase[nñ]a|qwerty|123456|univalle|administrador)[\d\W]*$/i.test(password)) {
    throw new BadRequestException('Elige una contraseña menos predecible.');
  }
}
