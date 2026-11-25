-- Accounts and characters. Auth flow itself lands in MVP stage 1.
CREATE TABLE accounts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE characters (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 3 AND 16),
  race        text NOT NULL,
  archetype   text NOT NULL,
  profession  text,
  level       smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 20),
  xp          integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  hp          integer NOT NULL,
  resource    integer NOT NULL DEFAULT 0,
  silver      bigint NOT NULL DEFAULT 0 CHECK (silver >= 0),
  location    text NOT NULL DEFAULT 'brackwell',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX characters_account_idx ON characters(account_id);
