-- Una sesión renovada regularmente no debe vivir para siempre. El backfill
-- conserva al menos la expiración actual y fija un máximo inicial de 30 días.
ALTER TABLE "RefreshSession"
ADD COLUMN "absoluteExpiresAt" TIMESTAMP(3);

UPDATE "RefreshSession"
SET "absoluteExpiresAt" = GREATEST("expiresAt", "createdAt" + INTERVAL '30 days');

ALTER TABLE "RefreshSession"
ALTER COLUMN "absoluteExpiresAt" SET NOT NULL;
