-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('STUDENT', 'TEACHER', 'COMMUNITY_LEADER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'OBSERVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('PROPOSED', 'IN_DEVELOPMENT', 'FINISHED', 'FEATURED');

-- CreateEnum
CREATE TYPE "NewsCategory" AS ENUM ('CONVENIOS', 'LOGROS', 'EVENTOS', 'COMUNIDAD', 'INVESTIGACION', 'PROYECTOS');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('CTF', 'TALLER', 'HACKATHON', 'MENTORIA', 'CHARLA', 'COMPETENCIA');

-- CreateEnum
CREATE TYPE "PointCategory" AS ENUM ('DEV', 'RESEARCH', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "PointReason" AS ENUM ('REGISTRO_COMPLETO', 'UNIRSE_COMUNIDAD', 'INSCRIPCION_EVENTO', 'PREGUNTA_PUBLICADA', 'RESPUESTA_PUBLICADA', 'RESPUESTA_ACEPTADA', 'PROYECTO_APROBADO', 'ARTICULO_APROBADO', 'LIKE_RECIBIDO', 'REPORTE_VALIDO', 'PENALIZACION_SPAM', 'AJUSTE_ADMIN');

-- CreateEnum
CREATE TYPE "VoteTargetType" AS ENUM ('QUESTION', 'ANSWER');

-- CreateEnum
CREATE TYPE "LikeTargetType" AS ENUM ('PROJECT', 'ARTICLE', 'COMMENT');

-- CreateEnum
CREATE TYPE "CommentTargetType" AS ENUM ('PROJECT', 'ARTICLE');

-- CreateEnum
CREATE TYPE "ApprovalTargetType" AS ENUM ('PROJECT', 'ARTICLE');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'OBSERVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'VALID', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('QUESTION', 'ANSWER', 'PROJECT', 'ARTICLE', 'COMMENT', 'USER');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('MEMBER', 'STUDENT_LEAD', 'TEACHER_LEAD');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'ATTENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MediaProvider" AS ENUM ('LOCAL', 'S3');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('BASICO', 'INTERMEDIO', 'AVANZADO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" "RoleName" NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "career" TEXT NOT NULL DEFAULT 'Ingeniería de Sistemas Informáticos',
    "semester" INTEGER,
    "githubUrl" TEXT,
    "linkedinUrl" TEXT,
    "websiteUrl" TEXT,
    "devPoints" INTEGER NOT NULL DEFAULT 0,
    "researchPoints" INTEGER NOT NULL DEFAULT 0,
    "communityPoints" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSkill" (
    "userId" TEXT NOT NULL,
    "skillId" INTEGER NOT NULL,
    "level" INTEGER DEFAULT 1,

    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("userId","skillId")
);

-- CreateTable
CREATE TABLE "Community" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "longDescription" TEXT,
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "accentColor" TEXT,
    "whatsappUrl" TEXT,
    "teamsUrl" TEXT,
    "discordUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teacherLeadId" TEXT,
    "studentLeadId" TEXT,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityMember" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "News" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" "NewsCategory" NOT NULL,
    "coverUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverUrl" TEXT,
    "videoUrl" TEXT,
    "repoUrl" TEXT,
    "demoUrl" TEXT,
    "subject" TEXT,
    "semester" INTEGER,
    "phase" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "stage" "ProjectStage" NOT NULL DEFAULT 'PROPOSED',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isIncubator" BOOLEAN NOT NULL DEFAULT false,
    "recruiting" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "communityId" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleInProject" TEXT,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTechnology" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProjectTechnology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "abstract" TEXT NOT NULL,
    "content" TEXT,
    "area" TEXT NOT NULL,
    "impact" TEXT,
    "pdfUrl" TEXT,
    "externalUrl" TEXT,
    "doi" TEXT,
    "coverUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "reviewerId" TEXT,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleAuthor" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT,
    "externalName" TEXT,

    CONSTRAINT "ArticleAuthor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "coverUrl" TEXT,
    "location" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "meetingUrl" TEXT,
    "rulesUrl" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "capacity" INTEGER,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "status" "PublicationStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizerId" TEXT NOT NULL,
    "communityId" TEXT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mentorship" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'BASICO',
    "syllabus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3),
    "teamsUrl" TEXT,
    "youtubeUrl" TEXT,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mentorId" TEXT,
    "mentorName" TEXT,
    "communityId" TEXT,

    CONSTRAINT "Mentorship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentorshipEnrollment" (
    "id" TEXT NOT NULL,
    "mentorshipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentorshipEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumQuestion" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "semester" INTEGER,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "votesScore" INTEGER NOT NULL DEFAULT 0,
    "answersCount" INTEGER NOT NULL DEFAULT 0,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "acceptedAnswerId" TEXT,

    CONSTRAINT "ForumQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumAnswer" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "votesScore" INTEGER NOT NULL DEFAULT 0,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "ForumAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "VoteTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Like" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "LikeTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "targetType" "CommentTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "reporterId" TEXT NOT NULL,
    "resolvedById" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'award',
    "color" TEXT,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointRule" (
    "id" TEXT NOT NULL,
    "reason" "PointReason" NOT NULL,
    "category" "PointCategory" NOT NULL,
    "points" INTEGER NOT NULL,
    "dailyLimit" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT NOT NULL,

    CONSTRAINT "PointRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "PointCategory" NOT NULL,
    "reason" "PointReason" NOT NULL,
    "points" INTEGER NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "targetType" "ApprovalTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "comment" TEXT,
    "decision" "ApprovalDecision",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "requesterId" TEXT NOT NULL,
    "reviewerId" TEXT,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "key" TEXT,
    "provider" "MediaProvider" NOT NULL DEFAULT 'LOCAL',
    "mime" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaderId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "Profile_totalPoints_idx" ON "Profile"("totalPoints");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMember_communityId_userId_key" ON "CommunityMember"("communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "News_slug_key" ON "News"("slug");

-- CreateIndex
CREATE INDEX "News_status_publishedAt_idx" ON "News"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_status_isFeatured_idx" ON "Project"("status", "isFeatured");

-- CreateIndex
CREATE INDEX "Project_communityId_idx" ON "Project"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTechnology_projectId_name_key" ON "ProjectTechnology"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_status_publishedAt_idx" ON "Article"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleAuthor_articleId_userId_key" ON "ArticleAuthor"("articleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_userId_key" ON "EventRegistration"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Mentorship_slug_key" ON "Mentorship"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MentorshipEnrollment_mentorshipId_userId_key" ON "MentorshipEnrollment"("mentorshipId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumQuestion_acceptedAnswerId_key" ON "ForumQuestion"("acceptedAnswerId");

-- CreateIndex
CREATE INDEX "ForumQuestion_createdAt_idx" ON "ForumQuestion"("createdAt");

-- CreateIndex
CREATE INDEX "ForumQuestion_votesScore_idx" ON "ForumQuestion"("votesScore");

-- CreateIndex
CREATE INDEX "Vote_targetType_targetId_idx" ON "Vote"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_userId_targetType_targetId_key" ON "Vote"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Like_targetType_targetId_idx" ON "Like"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_userId_targetType_targetId_key" ON "Like"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Comment_targetType_targetId_idx" ON "Comment"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key" ON "Report"("reporterId", "targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_code_key" ON "Badge"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "PointRule_reason_key" ON "PointRule"("reason");

-- CreateIndex
CREATE INDEX "PointsTransaction_userId_createdAt_idx" ON "PointsTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PointsTransaction_createdAt_idx" ON "PointsTransaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointsTransaction_userId_reason_sourceType_sourceId_key" ON "PointsTransaction"("userId", "reason", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_targetType_targetId_idx" ON "ApprovalRequest"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_decision_idx" ON "ApprovalRequest"("decision");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_teacherLeadId_fkey" FOREIGN KEY ("teacherLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_studentLeadId_fkey" FOREIGN KEY ("studentLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "News" ADD CONSTRAINT "News_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTechnology" ADD CONSTRAINT "ProjectTechnology_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleAuthor" ADD CONSTRAINT "ArticleAuthor_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleAuthor" ADD CONSTRAINT "ArticleAuthor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentorship" ADD CONSTRAINT "Mentorship_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentorship" ADD CONSTRAINT "Mentorship_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorshipEnrollment" ADD CONSTRAINT "MentorshipEnrollment_mentorshipId_fkey" FOREIGN KEY ("mentorshipId") REFERENCES "Mentorship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorshipEnrollment" ADD CONSTRAINT "MentorshipEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumQuestion" ADD CONSTRAINT "ForumQuestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumQuestion" ADD CONSTRAINT "ForumQuestion_acceptedAnswerId_fkey" FOREIGN KEY ("acceptedAnswerId") REFERENCES "ForumAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumAnswer" ADD CONSTRAINT "ForumAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ForumQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumAnswer" ADD CONSTRAINT "ForumAnswer_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsTransaction" ADD CONSTRAINT "PointsTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
