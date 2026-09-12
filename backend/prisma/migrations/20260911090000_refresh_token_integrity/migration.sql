-- Los hashes bcrypt anteriores no distinguían el token completo.
-- Cerrar esas sesiones exige un nuevo login sin cambiar cuentas ni contraseñas.
UPDATE "RefreshSession" SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL AND "tokenHash" NOT LIKE 'sha256:%';
UPDATE "User" SET "refreshTokenHash" = NULL WHERE "refreshTokenHash" IS NOT NULL;
