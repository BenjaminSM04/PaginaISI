-- Apply the requested institutional palette to existing settings, preserving
-- semantic status colors and all identity/logo fields.
UPDATE "InstitutionalSettings"
SET "theme" = COALESCE("theme", '{}'::jsonb) || jsonb_build_object(
  'light', COALESCE("theme"->'light', '{}'::jsonb) || '{"primary":"#7b1113","secondary":"#f5f5f5","accent":"#6b1d2f","background":"#fafafa","surface":"#ffffff","text":"#242424","muted":"#636363","border":"#cccccc"}'::jsonb,
  'dark', COALESCE("theme"->'dark', '{}'::jsonb) || '{"primary":"#f6b5b6","secondary":"#292929","accent":"#efb3c3","background":"#121212","surface":"#1c1c1c","text":"#fafafa","muted":"#b4b4b4","border":"#575757"}'::jsonb
), "updatedAt" = CURRENT_TIMESTAMP;
