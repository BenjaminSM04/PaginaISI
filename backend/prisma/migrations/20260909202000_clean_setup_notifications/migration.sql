-- Update only the known setup notices, without changing user-authored content.
UPDATE "Notification" SET "title" = 'Portal disponible',
  "body" = 'La configuración inicial del portal se completó correctamente.'
WHERE "dedupeKey" = 'demo-system-ready' AND "title" = 'Portal de demostración listo';

UPDATE "Notification"
SET "body" = 'Consulta el historial de cambios del calendario, las noticias y la galería del proyecto.'
WHERE "body" = 'La demo incluye ediciones de calendario, noticias y galería con correo del actor y snapshots de rollback.';
