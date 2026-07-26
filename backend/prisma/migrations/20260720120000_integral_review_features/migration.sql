-- Revisión integral 2026-07-20.
-- La migración es aditiva y conserva las columnas legacy durante la transición.

CREATE TYPE "ProjectVersionStatus" AS ENUM ('PENDING', 'OBSERVED', 'REJECTED', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "MentorshipModality" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');
CREATE TYPE "BadgeRuleType" AS ENUM (
  'ANSWERS_COUNT',
  'ACCEPTED_ANSWERS_COUNT',
  'TOTAL_POINTS',
  'APPROVED_PROJECTS_COUNT',
  'ATTENDED_EVENTS_COUNT',
  'COMPLETED_MENTORSHIPS_COUNT',
  'COMMUNITY_MEMBERSHIPS_COUNT'
);
CREATE TYPE "CatalogKind" AS ENUM ('TECHNOLOGY', 'TAG', 'CATEGORY', 'SUBJECT');

-- La oferta académica vigente termina en octavo semestre. Los datos históricos
-- fuera de rango se dejan sin semestre antes de añadir restricciones.
UPDATE "Profile" SET "semester" = NULL WHERE "semester" IS NOT NULL AND ("semester" < 1 OR "semester" > 8);
UPDATE "Project" SET "semester" = NULL WHERE "semester" IS NOT NULL AND ("semester" < 1 OR "semester" > 8);
UPDATE "ForumQuestion" SET "semester" = NULL WHERE "semester" IS NOT NULL AND ("semester" < 1 OR "semester" > 8);
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_semester_range" CHECK ("semester" IS NULL OR "semester" BETWEEN 1 AND 8);
ALTER TABLE "Project" ADD CONSTRAINT "Project_semester_range" CHECK ("semester" IS NULL OR "semester" BETWEEN 1 AND 8);
ALTER TABLE "ForumQuestion" ADD CONSTRAINT "ForumQuestion_semester_range" CHECK ("semester" IS NULL OR "semester" BETWEEN 1 AND 8);

-- Catálogo normalizado y tecnologías sin duplicados por mayúsculas o espacios.
ALTER TABLE "ProjectTechnology" ADD COLUMN "normalizedName" TEXT;
UPDATE "ProjectTechnology"
SET "name" = trim(regexp_replace("name", '\s+', ' ', 'g')),
    "normalizedName" = lower(trim(regexp_replace("name", '\s+', ' ', 'g')));
DELETE FROM "ProjectTechnology" duplicate
USING "ProjectTechnology" canonical
WHERE duplicate."projectId" = canonical."projectId"
  AND duplicate."normalizedName" = canonical."normalizedName"
  AND duplicate."id" > canonical."id";
ALTER TABLE "ProjectTechnology" ALTER COLUMN "normalizedName" SET NOT NULL;
DROP INDEX IF EXISTS "ProjectTechnology_projectId_name_key";
CREATE UNIQUE INDEX "ProjectTechnology_projectId_normalizedName_key"
  ON "ProjectTechnology"("projectId", "normalizedName");
CREATE INDEX "ProjectTechnology_normalizedName_idx" ON "ProjectTechnology"("normalizedName");

UPDATE "Project" project
SET "tags" = normalized.tags
FROM (
  SELECT p."id",
         COALESCE(array_agg(DISTINCT lower(trim(regexp_replace(tag, '\s+', ' ', 'g'))))
           FILTER (WHERE trim(tag) <> ''), ARRAY[]::TEXT[]) AS tags
  FROM "Project" p
  LEFT JOIN LATERAL unnest(p."tags") tag ON TRUE
  GROUP BY p."id"
) normalized
WHERE project."id" = normalized."id";

UPDATE "ForumQuestion" question
SET "tags" = normalized.tags
FROM (
  SELECT q."id",
         COALESCE(array_agg(DISTINCT lower(trim(regexp_replace(tag, '\s+', ' ', 'g'))))
           FILTER (WHERE trim(tag) <> ''), ARRAY[]::TEXT[]) AS tags
  FROM "ForumQuestion" q
  LEFT JOIN LATERAL unnest(q."tags") tag ON TRUE
  GROUP BY q."id"
) normalized
WHERE question."id" = normalized."id";

CREATE TABLE "CatalogValue" (
  "id" TEXT NOT NULL,
  "kind" "CatalogKind" NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogValue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CatalogValue_kind_normalizedName_key" ON "CatalogValue"("kind", "normalizedName");
CREATE INDEX "CatalogValue_kind_name_idx" ON "CatalogValue"("kind", "name");

INSERT INTO "CatalogValue" ("id", "kind", "name", "normalizedName")
SELECT 'catalog_' || md5('TECHNOLOGY:' || "normalizedName"),
       'TECHNOLOGY'::"CatalogKind", min("name"), "normalizedName"
FROM "ProjectTechnology"
WHERE "normalizedName" <> ''
GROUP BY "normalizedName"
ON CONFLICT ("kind", "normalizedName") DO NOTHING;

INSERT INTO "CatalogValue" ("id", "kind", "name", "normalizedName")
SELECT 'catalog_' || md5('TAG:' || value), 'TAG'::"CatalogKind", value, value
FROM (
  SELECT DISTINCT lower(trim(regexp_replace(tag, '\s+', ' ', 'g'))) AS value
  FROM "Project" project CROSS JOIN LATERAL unnest(project."tags") tag
) tags
WHERE value <> ''
ON CONFLICT ("kind", "normalizedName") DO NOTHING;

INSERT INTO "CatalogValue" ("id", "kind", "name", "normalizedName")
SELECT 'catalog_' || md5('SUBJECT:' || normalized),
       'SUBJECT'::"CatalogKind", min(subject), normalized
FROM (
  SELECT trim(regexp_replace("subject", '\s+', ' ', 'g')) AS subject,
         lower(trim(regexp_replace("subject", '\s+', ' ', 'g'))) AS normalized
  FROM "Project" WHERE "subject" IS NOT NULL
  UNION ALL
  SELECT trim(regexp_replace("subject", '\s+', ' ', 'g')),
         lower(trim(regexp_replace("subject", '\s+', ' ', 'g')))
  FROM "ForumQuestion" WHERE "subject" IS NOT NULL
) subjects
WHERE normalized <> ''
GROUP BY normalized
ON CONFLICT ("kind", "normalizedName") DO NOTHING;

-- Identidad de actor viva + snapshots inmutables. actorId se conserva como el
-- identificador histórico aunque el usuario se elimine; actorUserId es la FK.
ALTER TABLE "ProjectAuditLog" DISABLE TRIGGER "ProjectAuditLog_immutable";
ALTER TABLE "ProjectAuditLog"
  ADD COLUMN "actorUserId" TEXT,
  ADD COLUMN "actorNameSnapshot" TEXT,
  ADD COLUMN "actorUsernameSnapshot" TEXT,
  ADD COLUMN "actorRolesSnapshot" JSONB;

UPDATE "ProjectAuditLog" audit
SET "actorUserId" = users."id",
    "actorNameSnapshot" = COALESCE(profile."fullName", users."username", audit."actorEmailSnapshot"),
    "actorUsernameSnapshot" = users."username",
    "actorRolesSnapshot" = COALESCE((
      SELECT jsonb_agg(role."name" ORDER BY role."name")
      FROM "UserRole" user_role
      JOIN "Role" role ON role."id" = user_role."roleId"
      WHERE user_role."userId" = users."id"
    ), '[]'::jsonb)
FROM "User" users
LEFT JOIN "Profile" profile ON profile."userId" = users."id"
WHERE users."id" = audit."actorId";

UPDATE "ProjectAuditLog"
SET "actorNameSnapshot" = COALESCE("actorNameSnapshot", "actorEmailSnapshot", 'Usuario eliminado'),
    "actorRolesSnapshot" = COALESCE("actorRolesSnapshot", '[]'::jsonb);

ALTER TABLE "ProjectAuditLog"
  ALTER COLUMN "actorNameSnapshot" SET NOT NULL,
  ALTER COLUMN "actorRolesSnapshot" SET NOT NULL;
ALTER TABLE "ProjectAuditLog"
  ADD CONSTRAINT "ProjectAuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ProjectAuditLog_actorUserId_createdAt_idx" ON "ProjectAuditLog"("actorUserId", "createdAt");
CREATE OR REPLACE FUNCTION prevent_project_audit_mutation() RETURNS trigger AS $$
BEGIN
  -- La única mutación permitida es la nulificación de la FK ejecutada al
  -- eliminar físicamente al actor. actorId y todos los snapshots permanecen.
  IF TG_OP = 'UPDATE'
     AND OLD."actorUserId" IS NOT NULL
     AND NEW."actorUserId" IS NULL
     AND (to_jsonb(NEW) - 'actorUserId') = (to_jsonb(OLD) - 'actorUserId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ProjectAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;
ALTER TABLE "ProjectAuditLog" ENABLE TRIGGER "ProjectAuditLog_immutable";

CREATE TABLE "SystemAuditLog" (
  "id" TEXT NOT NULL,
  "actorIdSnapshot" TEXT,
  "actorUserId" TEXT,
  "actorNameSnapshot" TEXT NOT NULL,
  "actorUsernameSnapshot" TEXT,
  "actorEmailSnapshot" TEXT,
  "actorRolesSnapshot" JSONB NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemAuditLog_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SystemAuditLog"
  ADD CONSTRAINT "SystemAuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SystemAuditLog_createdAt_idx" ON "SystemAuditLog"("createdAt");
CREATE INDEX "SystemAuditLog_entityType_entityId_createdAt_idx"
  ON "SystemAuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "SystemAuditLog_actorUserId_createdAt_idx"
  ON "SystemAuditLog"("actorUserId", "createdAt");

CREATE FUNCTION prevent_system_audit_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."actorUserId" IS NOT NULL
     AND NEW."actorUserId" IS NULL
     AND (to_jsonb(NEW) - 'actorUserId') = (to_jsonb(OLD) - 'actorUserId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'SystemAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SystemAuditLog_immutable"
BEFORE UPDATE OR DELETE ON "SystemAuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_system_audit_mutation();

-- Versiones editoriales: la fila Project sigue siendo la publicación vigente.
CREATE TABLE "ProjectVersion" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "status" "ProjectVersionStatus" NOT NULL DEFAULT 'PENDING',
  "snapshot" JSONB NOT NULL,
  "requesterId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "reviewComment" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectVersion_projectId_number_key" ON "ProjectVersion"("projectId", "number");
CREATE INDEX "ProjectVersion_status_submittedAt_idx" ON "ProjectVersion"("status", "submittedAt");
CREATE INDEX "ProjectVersion_projectId_createdAt_idx" ON "ProjectVersion"("projectId", "createdAt");
ALTER TABLE "ProjectVersion"
  ADD CONSTRAINT "ProjectVersion_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectVersion"
  ADD CONSTRAINT "ProjectVersion_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectVersion"
  ADD CONSTRAINT "ProjectVersion_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ProjectVersion" (
  "id", "projectId", "number", "status", "snapshot", "requesterId", "reviewerId",
  "reviewComment", "submittedAt", "decidedAt", "publishedAt", "createdAt", "updatedAt"
)
SELECT
  'project_version_' || md5(project."id"),
  project."id",
  GREATEST(project."version", 1),
  CASE project."status"
    WHEN 'APPROVED' THEN 'PUBLISHED'::"ProjectVersionStatus"
    WHEN 'PENDING' THEN 'PENDING'::"ProjectVersionStatus"
    WHEN 'OBSERVED' THEN 'OBSERVED'::"ProjectVersionStatus"
    WHEN 'REJECTED' THEN 'REJECTED'::"ProjectVersionStatus"
    ELSE 'SUPERSEDED'::"ProjectVersionStatus"
  END,
  jsonb_build_object(
    'title', project."title",
    'summary', project."summary",
    'description', project."description",
    'coverUrl', project."coverUrl",
    'videoUrl', project."videoUrl",
    'repoUrl', project."repoUrl",
    'demoUrl', project."demoUrl",
    'subject', project."subject",
    'semester', project."semester",
    'phase', project."phase",
    'stage', project."stage",
    'isFeatured', project."isFeatured",
    'isIncubator', project."isIncubator",
    'recruiting', project."recruiting",
    'tags', to_jsonb(project."tags"),
    'startedAt', project."startedAt",
    'reviewerId', project."reviewerId",
    'communityId', project."communityId",
    'technologies', COALESCE((
      SELECT jsonb_agg(technology."name" ORDER BY technology."normalizedName")
      FROM "ProjectTechnology" technology
      WHERE technology."projectId" = project."id"
    ), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'userId', member."userId",
        'username', users."username",
        'roleInProject', member."roleInProject"
      ) ORDER BY users."username")
      FROM "ProjectMember" member
      JOIN "User" users ON users."id" = member."userId"
      WHERE member."projectId" = project."id"
    ), '[]'::jsonb)
  ),
  project."ownerId",
  project."reviewerId",
  latest_approval."comment",
  project."createdAt",
  latest_approval."decidedAt",
  project."publishedAt",
  project."createdAt",
  project."updatedAt"
FROM "Project" project
LEFT JOIN LATERAL (
  SELECT approval."comment", approval."decidedAt"
  FROM "ApprovalRequest" approval
  WHERE approval."targetType" = 'PROJECT'::"ApprovalTargetType"
    AND approval."targetId" = project."id"
  ORDER BY approval."createdAt" DESC
  LIMIT 1
) latest_approval ON TRUE;

ALTER TABLE "Project" ADD COLUMN "pendingVersionId" TEXT;
CREATE UNIQUE INDEX "Project_pendingVersionId_key" ON "Project"("pendingVersionId");
UPDATE "Project"
SET "pendingVersionId" = 'project_version_' || md5("id")
WHERE "status" IN ('PENDING', 'OBSERVED', 'REJECTED');
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_pendingVersionId_fkey"
  FOREIGN KEY ("pendingVersionId") REFERENCES "ProjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApprovalRequest" ADD COLUMN "projectVersionId" TEXT;
UPDATE "ApprovalRequest" approval
SET "projectVersionId" = project."pendingVersionId"
FROM "Project" project
WHERE approval."targetType" = 'PROJECT'::"ApprovalTargetType"
  AND approval."targetId" = project."id"
  AND project."pendingVersionId" IS NOT NULL
  AND approval."decision" IS NULL;
ALTER TABLE "ApprovalRequest"
  ADD CONSTRAINT "ApprovalRequest_projectVersionId_fkey"
  FOREIGN KEY ("projectVersionId") REFERENCES "ProjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ApprovalRequest_projectVersionId_idx" ON "ApprovalRequest"("projectVersionId");

-- Enlaces dinámicos de comunidad y backfill de los tres campos históricos.
CREATE TABLE "CommunityLink" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "label" TEXT,
  "url" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityLink_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CommunityLink"
  ADD CONSTRAINT "CommunityLink_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CommunityLink_communityId_isActive_sortOrder_idx"
  ON "CommunityLink"("communityId", "isActive", "sortOrder");
CREATE INDEX "CommunityMember_communityId_role_idx" ON "CommunityMember"("communityId", "role");

INSERT INTO "CommunityLink" ("id", "communityId", "platform", "label", "url", "sortOrder", "updatedAt")
SELECT 'community_link_' || md5("id" || ':whatsapp'), "id", 'WhatsApp', 'WhatsApp', "whatsappUrl", 0, CURRENT_TIMESTAMP
FROM "Community" WHERE "whatsappUrl" IS NOT NULL
UNION ALL
SELECT 'community_link_' || md5("id" || ':teams'), "id", 'Microsoft Teams', 'Teams', "teamsUrl", 1, CURRENT_TIMESTAMP
FROM "Community" WHERE "teamsUrl" IS NOT NULL
UNION ALL
SELECT 'community_link_' || md5("id" || ':discord'), "id", 'Discord', 'Discord', "discordUrl", 2, CURRENT_TIMESTAMP
FROM "Community" WHERE "discordUrl" IS NOT NULL;

INSERT INTO "CommunityMember" ("id", "communityId", "userId", "role", "joinedAt")
SELECT 'community_teacher_' || md5(community."id" || ':' || community."teacherLeadId"),
       community."id", community."teacherLeadId", 'TEACHER_LEAD'::"MembershipRole", community."createdAt"
FROM "Community" community
WHERE community."teacherLeadId" IS NOT NULL
ON CONFLICT ("communityId", "userId") DO UPDATE SET "role" = 'TEACHER_LEAD'::"MembershipRole";

-- Mentorías con múltiples mentores, modalidad y media.
ALTER TABLE "Mentorship"
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "coverUrl" TEXT,
  ADD COLUMN "modality" "MentorshipModality" NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN "location" TEXT,
  ADD COLUMN "meetingUrl" TEXT;

CREATE TABLE "MentorshipMentor" (
  "mentorshipId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "isLead" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MentorshipMentor_pkey" PRIMARY KEY ("mentorshipId", "userId")
);
ALTER TABLE "MentorshipMentor"
  ADD CONSTRAINT "MentorshipMentor_mentorshipId_fkey"
  FOREIGN KEY ("mentorshipId") REFERENCES "Mentorship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MentorshipMentor"
  ADD CONSTRAINT "MentorshipMentor_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "MentorshipMentor_userId_idx" ON "MentorshipMentor"("userId");
INSERT INTO "MentorshipMentor" ("mentorshipId", "userId", "isLead")
SELECT "id", "mentorId", true FROM "Mentorship" WHERE "mentorId" IS NOT NULL
ON CONFLICT ("mentorshipId", "userId") DO NOTHING;

ALTER TABLE "MediaAsset"
  ADD COLUMN "mentorshipId" TEXT,
  ADD COLUMN "ideaProposalId" TEXT;
CREATE INDEX "MediaAsset_mentorshipId_idx" ON "MediaAsset"("mentorshipId");
CREATE INDEX "MediaAsset_ideaProposalId_idx" ON "MediaAsset"("ideaProposalId");
ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_mentorshipId_fkey"
  FOREIGN KEY ("mentorshipId") REFERENCES "Mentorship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Insignias configurables e idempotentes con evidencia del motivo.
ALTER TABLE "Badge"
  ADD COLUMN "ruleType" "BadgeRuleType",
  ADD COLUMN "targetValue" INTEGER,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isRetroactive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Badge"
  ADD CONSTRAINT "Badge_rule_target" CHECK (
    ("ruleType" IS NULL AND "targetValue" IS NULL)
    OR ("ruleType" IS NOT NULL AND "targetValue" IS NOT NULL AND "targetValue" > 0)
  );
ALTER TABLE "UserBadge"
  ADD COLUMN "reasonSnapshot" TEXT,
  ADD COLUMN "progressValue" INTEGER;

-- Postulaciones de ideas.
CREATE TABLE "IdeaProposal" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "problem" TEXT NOT NULL,
  "proposedSolution" TEXT NOT NULL,
  "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isRealClient" BOOLEAN NOT NULL DEFAULT false,
  "clientName" TEXT,
  "clientContactName" TEXT,
  "clientContact" TEXT,
  "clientNeed" TEXT,
  "clientAuthorizationUrl" TEXT,
  "attachmentUrl" TEXT,
  "status" "PublicationStatus" NOT NULL DEFAULT 'PENDING',
  "reviewComment" TEXT,
  "ownerId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "IdeaProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdeaProposal_real_client_fields" CHECK (
    NOT "isRealClient"
    OR (
      "clientName" IS NOT NULL
      AND "clientContactName" IS NOT NULL
      AND "clientContact" IS NOT NULL
      AND "clientNeed" IS NOT NULL
    )
  )
);
CREATE INDEX "IdeaProposal_status_createdAt_idx" ON "IdeaProposal"("status", "createdAt");
CREATE INDEX "IdeaProposal_ownerId_createdAt_idx" ON "IdeaProposal"("ownerId", "createdAt");
ALTER TABLE "IdeaProposal"
  ADD CONSTRAINT "IdeaProposal_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdeaProposal"
  ADD CONSTRAINT "IdeaProposal_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "IdeaMember" (
  "ideaId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "IdeaMember_pkey" PRIMARY KEY ("ideaId", "userId")
);
ALTER TABLE "IdeaMember"
  ADD CONSTRAINT "IdeaMember_ideaId_fkey"
  FOREIGN KEY ("ideaId") REFERENCES "IdeaProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaMember"
  ADD CONSTRAINT "IdeaMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_ideaProposalId_fkey"
  FOREIGN KEY ("ideaProposalId") REFERENCES "IdeaProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Aplicaciones institucionales administrables.
CREATE TABLE "InstitutionalApplication" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "icon" TEXT NOT NULL DEFAULT 'external-link',
  "url" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "visibleRoles" "RoleName"[] DEFAULT ARRAY[]::"RoleName"[],
  "openInNewTab" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstitutionalApplication_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InstitutionalApplication_isActive_sortOrder_idx"
  ON "InstitutionalApplication"("isActive", "sortOrder");
