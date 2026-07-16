CREATE TYPE "ProjectMilestoneStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ProjectAuditDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'SKIPPED', 'FAILED');

ALTER TABLE "Project" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "News" ADD COLUMN "projectId" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE TABLE "ProjectMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProjectMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "location" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectAuditLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmailSnapshot" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "rollbackOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectAuditDelivery" (
    "id" TEXT NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "status" "ProjectAuditDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAuditDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectMilestone_projectId_startsAt_idx" ON "ProjectMilestone"("projectId", "startsAt");
CREATE INDEX "ProjectAuditLog_projectId_createdAt_idx" ON "ProjectAuditLog"("projectId", "createdAt");
CREATE INDEX "ProjectAuditLog_actorId_createdAt_idx" ON "ProjectAuditLog"("actorId", "createdAt");
CREATE UNIQUE INDEX "ProjectAuditLog_rollbackOfId_key" ON "ProjectAuditLog"("rollbackOfId");
CREATE UNIQUE INDEX "ProjectAuditDelivery_auditLogId_key" ON "ProjectAuditDelivery"("auditLogId");
CREATE INDEX "ProjectAuditDelivery_status_nextAttemptAt_idx" ON "ProjectAuditDelivery"("status", "nextAttemptAt");
CREATE INDEX "News_projectId_idx" ON "News"("projectId");

ALTER TABLE "ProjectMilestone"
ADD CONSTRAINT "ProjectMilestone_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectAuditLog"
ADD CONSTRAINT "ProjectAuditLog_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAuditLog"
ADD CONSTRAINT "ProjectAuditLog_rollbackOfId_fkey"
FOREIGN KEY ("rollbackOfId") REFERENCES "ProjectAuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAuditDelivery"
ADD CONSTRAINT "ProjectAuditDelivery_auditLogId_fkey"
FOREIGN KEY ("auditLogId") REFERENCES "ProjectAuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "News"
ADD CONSTRAINT "News_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- La bitácora es append-only incluso ante una escritura SQL accidental.
CREATE FUNCTION prevent_project_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ProjectAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProjectAuditLog_immutable"
BEFORE UPDATE OR DELETE ON "ProjectAuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_project_audit_mutation();
