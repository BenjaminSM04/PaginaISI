-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'CONTENT_REVIEW',
  'FORUM_ANSWER',
  'FORUM_ACCEPTED',
  'EVENT_REGISTRATION',
  'MENTORSHIP_ENROLLMENT',
  'SYSTEM'
);

-- CreateTable
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "href" TEXT,
  "dedupeKey" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
  "userId" TEXT NOT NULL,
  "contentReview" BOOLEAN NOT NULL DEFAULT true,
  "forumActivity" BOOLEAN NOT NULL DEFAULT true,
  "eventRegistrations" BOOLEAN NOT NULL DEFAULT true,
  "mentorships" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference"
ADD CONSTRAINT "NotificationPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill no destructivo para instalaciones demo que ya tenían usuarios antes
-- de esta migración. En una base vacía no inserta nada; el seed crea sus propias
-- muestras después de aplicar las migraciones.
INSERT INTO "Notification" ("id", "userId", "type", "title", "body", "href", "dedupeKey", "createdAt")
SELECT
  'phase2-' || md5(u."id" || ':welcome'),
  u."id",
  'SYSTEM'::"NotificationType",
  'La fase 2 ya está disponible',
  'Estrenamos notificaciones, seguridad de cuenta, sesiones y nuevas herramientas de gestión.',
  '/notificaciones',
  'phase2:welcome',
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."username" IN ('admin', 'rmendoza', 'pcondori', 'avargas')
ON CONFLICT ("userId", "dedupeKey") DO NOTHING;
