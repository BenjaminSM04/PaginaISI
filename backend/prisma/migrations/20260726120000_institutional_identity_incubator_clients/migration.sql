-- Identidad institucional parametrizable y cartera reutilizable de clientes
-- de Incubadora. Esta migración es aditiva y no modifica datos de proyectos.

CREATE TABLE "InstitutionalSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "institutionName" TEXT NOT NULL DEFAULT 'Universidad Privada del Valle',
  "shortName" TEXT NOT NULL DEFAULT 'Univalle',
  "careerName" TEXT NOT NULL DEFAULT 'Carrera de Ingeniería de Sistemas',
  "institutionalLogoUrl" TEXT DEFAULT 'https://www.univalle.edu/wp-content/uploads/2025/12/LOGO-cua_res-_01.png',
  "careerLogoUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstitutionalSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "InstitutionalSettings" (
  "id",
  "institutionName",
  "shortName",
  "careerName",
  "updatedAt"
) VALUES (
  'default',
  'Universidad Privada del Valle',
  'Univalle',
  'Carrera de Ingeniería de Sistemas',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "IncubatorClient" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "logoUrl" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncubatorClient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IncubatorClient_name_not_blank" CHECK (length(trim("name")) > 0),
  CONSTRAINT "IncubatorClient_logo_not_blank" CHECK (length(trim("logoUrl")) > 0)
);

CREATE UNIQUE INDEX "IncubatorClient_normalizedName_key"
  ON "IncubatorClient"("normalizedName");
CREATE INDEX "IncubatorClient_isActive_name_idx"
  ON "IncubatorClient"("isActive", "name");

CREATE TABLE "_IncubatorProjectClients" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_IncubatorProjectClients_AB_unique"
  ON "_IncubatorProjectClients"("A", "B");
CREATE INDEX "_IncubatorProjectClients_B_index"
  ON "_IncubatorProjectClients"("B");

ALTER TABLE "_IncubatorProjectClients"
  ADD CONSTRAINT "_IncubatorProjectClients_A_fkey"
  FOREIGN KEY ("A") REFERENCES "IncubatorClient"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_IncubatorProjectClients"
  ADD CONSTRAINT "_IncubatorProjectClients_B_fkey"
  FOREIGN KEY ("B") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
