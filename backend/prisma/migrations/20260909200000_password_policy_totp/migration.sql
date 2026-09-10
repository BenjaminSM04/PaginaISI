ALTER TABLE "User"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Preserve existing accounts and hashes. Predefined accounts must rotate once,
-- including any already-active sessions, because the API checks the current flag.
UPDATE "User" SET "mustChangePassword" = true WHERE "username" IN
  ('admin', 'rmendoza', 'lgutierrez', 'avargas', 'jmamani', 'cflores', 'dquispe', 'mrojas', 'pcondori');

CREATE TABLE "TwoFactorCredential" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "secretEncrypted" TEXT,
  "pendingEncrypted" TEXT,
  "pendingExpiresAt" TIMESTAMP(3),
  "lastUsedCounter" INTEGER,
  "recoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "blockedUntil" TIMESTAMP(3)
);

CREATE TABLE "TwoFactorChallenge" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "securityVersion" INTEGER NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3)
);
CREATE INDEX "TwoFactorChallenge_userId_expiresAt_idx" ON "TwoFactorChallenge"("userId", "expiresAt");
