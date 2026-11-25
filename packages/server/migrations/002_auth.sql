-- MVP stage 1: sessions, case-insensitive uniqueness, data constraints.

-- Emails are stored lowercased by the server; enforce it.
ALTER TABLE accounts ADD CONSTRAINT accounts_email_lower CHECK (email = lower(email));

-- Character names are unique regardless of case ("Aldric" blocks "aldric").
ALTER TABLE characters DROP CONSTRAINT characters_name_key;
CREATE UNIQUE INDEX characters_name_lower_idx ON characters (lower(name));
ALTER TABLE characters ADD CONSTRAINT characters_name_letters CHECK (name ~ '^[A-Za-z]+$');
ALTER TABLE characters ADD CONSTRAINT characters_race_known
  CHECK (race IN ('human', 'dawn_elf', 'dusk_elf', 'orc', 'dwarf'));
ALTER TABLE characters ADD CONSTRAINT characters_archetype_known
  CHECK (archetype IN ('warrior', 'mage'));

-- Login sessions. Only a SHA-256 of the cookie token is stored.
CREATE TABLE sessions (
  token_hash  bytea PRIMARY KEY,
  account_id  bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX sessions_account_idx ON sessions(account_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);
