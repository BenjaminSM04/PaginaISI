-- Unifica el nombre visible de la carrera con la identidad institucional
-- definida para el portal, sin alterar valores personalizados.
ALTER TABLE "Profile"
  ALTER COLUMN "career"
  SET DEFAULT 'Ingeniería de Sistemas';

UPDATE "Profile"
SET "career" = 'Ingeniería de Sistemas'
WHERE "career" = 'Ingeniería de Sistemas Informáticos';
