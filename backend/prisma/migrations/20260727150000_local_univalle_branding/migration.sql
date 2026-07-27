-- Conserva una copia local del emblema oficial para que la identidad principal
-- no dependa de Internet durante la presentación o en una red institucional.
ALTER TABLE "InstitutionalSettings"
  ALTER COLUMN "institutionalLogoUrl"
  SET DEFAULT '/branding/univalle-logo.png';

UPDATE "InstitutionalSettings"
SET "institutionalLogoUrl" = '/branding/univalle-logo.png',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "institutionalLogoUrl" IS NULL
   OR "institutionalLogoUrl" = 'https://www.univalle.edu/wp-content/uploads/2025/12/LOGO-cua_res-_01.png';
