-- La revisión de seguridad liga cada sesión a la versión de credenciales con
-- la que fue emitida. Así un cambio/restablecimiento invalida tokens antiguos
-- incluso ante carreras concurrentes.
ALTER TABLE "RefreshSession"
ADD COLUMN "securityVersion" INTEGER;

UPDATE "RefreshSession" AS session
SET "securityVersion" = users."securityVersion"
FROM "User" AS users
WHERE users."id" = session."userId";

ALTER TABLE "RefreshSession"
ALTER COLUMN "securityVersion" SET NOT NULL;
