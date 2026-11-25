-- MVP stage 2: map locations and persisted fights.

-- Locations are map node ids now (see packages/shared/src/data/world.ts).
UPDATE characters SET location = 'brackwell_square' WHERE location = 'brackwell';
ALTER TABLE characters ALTER COLUMN location SET DEFAULT 'brackwell_square';
ALTER TABLE characters ADD CONSTRAINT characters_hp_positive CHECK (hp >= 0);
ALTER TABLE characters ADD CONSTRAINT characters_resource_positive CHECK (resource >= 0);

-- One row per fight. `state` is the engine's FightState including the RNG
-- state, which never leaves the server. Every change to a character and its
-- fight happens in one transaction holding the character row lock.
CREATE TABLE fights (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  character_id  bigint NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  mob_id        text NOT NULL,
  node_id       text NOT NULL,
  outcome       text NOT NULL DEFAULT 'ongoing' CHECK (outcome IN ('ongoing', 'won', 'lost', 'fled')),
  state         jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- At most one fight in progress per character.
CREATE UNIQUE INDEX fights_one_ongoing_idx ON fights (character_id) WHERE outcome = 'ongoing';
CREATE INDEX fights_character_idx ON fights (character_id, id DESC);
