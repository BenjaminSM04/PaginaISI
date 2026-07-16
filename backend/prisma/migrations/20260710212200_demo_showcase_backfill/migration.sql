-- Conserva útiles las bases demo creadas con versiones anteriores del seed.
-- Todas las operaciones están acotadas a slugs/URLs de ejemplo conocidos y no
-- reemplazan contenido que ya haya sido personalizado.

UPDATE "Article"
SET "pdfUrl" = 'https://arxiv.org/pdf/1606.05718'
WHERE "slug" = 'deteccion-retinopatia-diabetica-cnn'
  AND ("pdfUrl" IS NULL OR "pdfUrl" = 'https://example.com/demo-retinopatia.pdf');

UPDATE "Event"
SET "coverUrl" = 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1600&q=75',
    "endsAt" = CASE WHEN "endsAt" IS NULL OR "endsAt" <= "startsAt" THEN "startsAt" + INTERVAL '6 hours' ELSE "endsAt" END
WHERE "slug" = 'ctf-isi-2026' AND "coverUrl" IS NULL;

UPDATE "Event"
SET "coverUrl" = 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&w=1600&q=75'
WHERE "slug" = 'taller-docker-kubernetes' AND "coverUrl" IS NULL;

UPDATE "Event"
SET "coverUrl" = 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1600&q=75'
WHERE "slug" = 'hackathon-salud-2026' AND "coverUrl" IS NULL;

UPDATE "News" AS news
SET "eventId" = event."id", "communityId" = event."communityId"
FROM "Event" AS event
WHERE news."slug" = 'equipo-isi-gana-ctf-nacional'
  AND event."slug" = 'ctf-isi-2026'
  AND news."eventId" IS NULL;

UPDATE "News" AS news
SET "eventId" = event."id", "communityId" = event."communityId"
FROM "Event" AS event
WHERE news."slug" = 'semana-de-la-ingenieria-2026'
  AND event."slug" = 'hackathon-salud-2026'
  AND news."eventId" IS NULL;

INSERT INTO "MediaAsset" ("id", "url", "mime", "uploaderId", "eventId", "createdAt")
SELECT 'demo-gallery-ctf-security',
       'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=72',
       'image/jpeg', users."id", events."id", NOW()
FROM "User" AS users, "Event" AS events
WHERE users."username" = 'avargas' AND events."slug" = 'ctf-isi-2026'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "MediaAsset" ("id", "url", "mime", "uploaderId", "eventId", "createdAt")
SELECT 'demo-gallery-ctf-team',
       'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=72',
       'image/jpeg', users."id", events."id", NOW()
FROM "User" AS users, "Event" AS events
WHERE users."username" = 'avargas' AND events."slug" = 'ctf-isi-2026'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "MediaAsset" ("id", "url", "mime", "uploaderId", "eventId", "createdAt")
SELECT 'demo-gallery-hack-team',
       'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=72',
       'image/jpeg', users."id", events."id", NOW()
FROM "User" AS users, "Event" AS events
WHERE users."username" = 'admin' AND events."slug" = 'hackathon-salud-2026'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "MediaAsset" ("id", "url", "mime", "uploaderId", "eventId", "createdAt")
SELECT 'demo-gallery-hack-stage',
       'https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1200&q=72',
       'image/jpeg', users."id", events."id", NOW()
FROM "User" AS users, "Event" AS events
WHERE users."username" = 'admin' AND events."slug" = 'hackathon-salud-2026'
ON CONFLICT ("id") DO NOTHING;

-- Likes demostrables para que la pestaña "más valoradas" no sea un duplicado
-- visual de "recientes" en bases demo ya existentes.
INSERT INTO "Like" ("id", "userId", "targetType", "targetId", "createdAt")
SELECT MD5('news-like:' || users."id" || ':' || news."id"), users."id", 'NEWS'::"LikeTargetType", news."id", NOW()
FROM "User" AS users
CROSS JOIN "News" AS news
WHERE (users."username", news."slug") IN (
  ('avargas', 'equipo-isi-gana-ctf-nacional'),
  ('cflores', 'equipo-isi-gana-ctf-nacional'),
  ('dquispe', 'equipo-isi-gana-ctf-nacional'),
  ('jmamani', 'paper-aceptado-congreso'),
  ('mrojas', 'paper-aceptado-congreso')
)
ON CONFLICT ("userId", "targetType", "targetId") DO NOTHING;

UPDATE "News" AS news
SET "likesCount" = counts.total
FROM (
  SELECT "targetId", COUNT(*)::INTEGER AS total
  FROM "Like"
  WHERE "targetType" = 'NEWS'::"LikeTargetType"
  GROUP BY "targetId"
) AS counts
WHERE news."id" = counts."targetId";

WITH inserted AS (
  INSERT INTO "PointsTransaction" (
    "id", "userId", "category", "reason", "points", "sourceType", "sourceId", "createdAt"
  )
  SELECT MD5('news-points:' || likes."userId" || ':' || likes."targetId"),
         news."authorId", 'COMMUNITY'::"PointCategory", 'LIKE_RECIBIDO'::"PointReason", 1,
         'NEWS', news."id" || ':by:' || likes."userId", NOW()
  FROM "Like" AS likes
  JOIN "News" AS news ON news."id" = likes."targetId"
  WHERE likes."targetType" = 'NEWS'::"LikeTargetType"
  ON CONFLICT ("userId", "reason", "sourceType", "sourceId") DO NOTHING
  RETURNING "userId", "points"
), totals AS (
  SELECT "userId", SUM("points")::INTEGER AS points
  FROM inserted
  GROUP BY "userId"
)
UPDATE "Profile" AS profile
SET "communityPoints" = profile."communityPoints" + totals.points,
    "totalPoints" = profile."totalPoints" + totals.points
FROM totals
WHERE profile."userId" = totals."userId";
