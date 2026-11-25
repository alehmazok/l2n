import type { ArchetypeId, CharacterSummary, RaceId } from "@l2n/shared";

export interface Account {
  id: number;
  email: string;
  passwordHash: string;
}

export type SessionAccount = Pick<Account, "id" | "email">;

export interface NewCharacter {
  accountId: number;
  name: string;
  race: RaceId;
  archetype: ArchetypeId;
  hp: number;
  resource: number;
  /** Refuse the insert if the account already has this many characters. */
  maxPerAccount: number;
}

/**
 * Persistence used by the API. `PgStore` is the real one; `MemoryStore` backs
 * unit tests and local runs without a database. Both pass the same contract
 * tests in test/store.contract.ts.
 */
export interface Store {
  createAccount(email: string, passwordHash: string): Promise<Account | "email_taken">;
  findAccountByEmail(email: string): Promise<Account | undefined>;

  createSession(accountId: number, tokenHash: Buffer, expiresAt: Date): Promise<void>;
  /** Owner of a session that exists and has not expired. */
  findSession(tokenHash: Buffer, now: Date): Promise<SessionAccount | undefined>;
  deleteSession(tokenHash: Buffer): Promise<void>;

  listCharacters(accountId: number): Promise<CharacterSummary[]>;
  getCharacter(accountId: number, id: number): Promise<CharacterSummary | undefined>;
  createCharacter(c: NewCharacter): Promise<CharacterSummary | "name_taken" | "limit_reached">;
}
