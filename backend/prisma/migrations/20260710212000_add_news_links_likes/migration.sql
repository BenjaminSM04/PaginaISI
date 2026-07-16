ALTER TYPE "LikeTargetType" ADD VALUE IF NOT EXISTS 'NEWS';

ALTER TABLE "News"
ADD COLUMN "likesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "communityId" TEXT,
ADD COLUMN "eventId" TEXT;

CREATE INDEX "News_status_likesCount_idx" ON "News"("status", "likesCount");
CREATE INDEX "News_communityId_idx" ON "News"("communityId");
CREATE INDEX "News_eventId_idx" ON "News"("eventId");

ALTER TABLE "News"
ADD CONSTRAINT "News_communityId_fkey"
FOREIGN KEY ("communityId") REFERENCES "Community"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "News"
ADD CONSTRAINT "News_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
