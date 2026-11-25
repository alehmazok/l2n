-- MVP stage 6: the living world (docs/design.md, "Living world").

-- When the character last made a request; counts it as present on its node.
ALTER TABLE characters ADD COLUMN seen_at timestamptz;
CREATE INDEX characters_seen_idx ON characters (seen_at) WHERE seen_at IS NOT NULL;

-- Set by hand to keep an account out of chat until then (see README, "Moderation").
ALTER TABLE accounts ADD COLUMN chat_muted_until timestamptz;

-- Chat lines. `channel` is 'global' or a zone id. Name and race are copied so
-- the line reads the same later. Text is stored as typed (normalised, never HTML).
CREATE TABLE chat_messages (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel       text NOT NULL,
  account_id    bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  character_id  bigint NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name          text NOT NULL,
  race          text NOT NULL,
  text          text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_channel_idx ON chat_messages (channel, id DESC);
CREATE INDEX chat_messages_account_idx ON chat_messages (account_id, created_at DESC);

-- Deeds everyone can read about. `key` groups the same deed (a boss, a
-- profession, a rare item) for the "first ever" flag.
CREATE TABLE chronicle (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('boss', 'profession', 'rare_craft')),
  key           text NOT NULL,
  event         jsonb NOT NULL,
  character_id  bigint REFERENCES characters(id) ON DELETE SET NULL,
  name          text NOT NULL,
  race          text NOT NULL,
  first         boolean NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chronicle_kind_key_idx ON chronicle (kind, key);

-- Where players died recently, and to what.
CREATE TABLE fallen (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  node_id       text NOT NULL,
  character_id  bigint REFERENCES characters(id) ON DELETE SET NULL,
  name          text NOT NULL,
  race          text NOT NULL,
  mob_id        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fallen_created_idx ON fallen (created_at DESC);
