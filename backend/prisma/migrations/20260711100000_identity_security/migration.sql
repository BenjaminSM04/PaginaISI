-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "securityVersion" INTEGER NOT NULL DEFAULT 1;

-- Las cuentas que ya existían antes de incorporar la verificación conservan
-- el acceso y se consideran verificadas. Los nuevos registros empiezan en NULL.
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "emailVerifiedAt" IS NULL;

-- CreateTable
CREATE TABLE "AuthActionToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "AuthTokenType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuthActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "previousTokenHash" TEXT,
  "previousValidUntil" TIMESTAMP(3),
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthActionToken_tokenHash_key" ON "AuthActionToken"("tokenHash");
CREATE UNIQUE INDEX "AuthActionToken_userId_type_key" ON "AuthActionToken"("userId", "type");
CREATE INDEX "AuthActionToken_userId_type_usedAt_idx" ON "AuthActionToken"("userId", "type", "usedAt");
CREATE INDEX "AuthActionToken_expiresAt_idx" ON "AuthActionToken"("expiresAt");
CREATE INDEX "RefreshSession_userId_revokedAt_expiresAt_idx" ON "RefreshSession"("userId", "revokedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "AuthActionToken"
ADD CONSTRAINT "AuthActionToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession"
ADD CONSTRAINT "RefreshSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
