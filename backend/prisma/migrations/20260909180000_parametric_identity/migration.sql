ALTER TABLE "InstitutionalSettings"
  ADD COLUMN "institutionalLogoDarkUrl" TEXT,
  ADD COLUMN "careerLogoDarkUrl" TEXT,
  ADD COLUMN "faviconUrl" TEXT,
  ADD COLUMN "logoMaxHeight" INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN "logoMaxWidth" INTEGER NOT NULL DEFAULT 160,
  ADD COLUMN "logoObjectFit" TEXT NOT NULL DEFAULT 'contain',
  ADD COLUMN "theme" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "InstitutionalSettings"
  ADD CONSTRAINT "institution_logo_height" CHECK ("logoMaxHeight" BETWEEN 24 AND 96),
  ADD CONSTRAINT "institution_logo_width" CHECK ("logoMaxWidth" BETWEEN 48 AND 240),
  ADD CONSTRAINT "institution_logo_fit" CHECK ("logoObjectFit" IN ('contain', 'scale-down'));
