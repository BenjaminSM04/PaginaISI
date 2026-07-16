ALTER TABLE "MediaAsset"
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER,
ADD COLUMN "forumQuestionId" TEXT,
ADD COLUMN "forumAnswerId" TEXT,
ADD COLUMN "eventId" TEXT;

CREATE INDEX "ForumQuestion_tags_idx" ON "ForumQuestion" USING GIN ("tags");
CREATE INDEX "MediaAsset_forumQuestionId_idx" ON "MediaAsset"("forumQuestionId");
CREATE INDEX "MediaAsset_forumAnswerId_idx" ON "MediaAsset"("forumAnswerId");
CREATE INDEX "MediaAsset_eventId_idx" ON "MediaAsset"("eventId");

ALTER TABLE "MediaAsset"
ADD CONSTRAINT "MediaAsset_forumQuestionId_fkey"
FOREIGN KEY ("forumQuestionId") REFERENCES "ForumQuestion"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaAsset"
ADD CONSTRAINT "MediaAsset_forumAnswerId_fkey"
FOREIGN KEY ("forumAnswerId") REFERENCES "ForumAnswer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaAsset"
ADD CONSTRAINT "MediaAsset_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
