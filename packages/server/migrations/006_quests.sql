-- MVP stage 5: quests and professions. The quest log maps quest ids from
-- packages/shared/src/data/quests.ts to { status, progress }.
ALTER TABLE characters ADD COLUMN quests jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE characters ADD CONSTRAINT characters_profession_check
  CHECK (profession IS NULL OR profession IN ('vanguard', 'reaver', 'stormcaller', 'hexbinder'));
