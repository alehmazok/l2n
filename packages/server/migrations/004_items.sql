-- MVP stage 3: inventory, equipment, warehouse and charges.

ALTER TABLE characters ADD COLUMN auto_charges boolean NOT NULL DEFAULT true;

-- One row per piece of equipment, or per stack of anything else, owned by a
-- character. Templates live in packages/shared/src/data/items.ts; stats are
-- derived from the template, item level and rarity, never stored.
CREATE TABLE items (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  character_id  bigint NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  template_id   text NOT NULL,
  item_level    smallint CHECK (item_level BETWEEN 1 AND 20),
  rarity        text CHECK (rarity IN ('common', 'uncommon', 'rare')),
  bonus         text CHECK (bonus IN ('crit', 'hp')),
  quantity      integer NOT NULL CHECK (quantity > 0),
  location      text NOT NULL CHECK (location IN ('bag', 'equipped', 'warehouse')),
  -- Set only while equipped, so one item per slot can be enforced.
  slot          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((location = 'equipped') = (slot IS NOT NULL)),
  CHECK (item_level IS NULL OR quantity = 1)
);

CREATE INDEX items_character_idx ON items (character_id);
CREATE UNIQUE INDEX items_one_per_slot_idx ON items (character_id, slot) WHERE location = 'equipped';
-- Stackables (no item level) keep one stack per place.
CREATE UNIQUE INDEX items_one_stack_idx ON items (character_id, location, template_id) WHERE item_level IS NULL;

-- Characters from stage 2 fought with a provisional kit of their own level.
-- Give them that kit as real, worn, common gear so nobody gets weaker.
INSERT INTO items (character_id, template_id, item_level, rarity, quantity, location, slot)
SELECT c.id,
       CASE WHEN c.level >= 10 THEN 'steelsworn' ELSE 'ironbound' END || '_' || c.archetype || '_' || s.slot,
       c.level, 'common', 1, 'equipped', s.slot
FROM characters c
CROSS JOIN (VALUES ('weapon'), ('head'), ('chest'), ('legs'), ('gloves'), ('boots')) AS s(slot);
