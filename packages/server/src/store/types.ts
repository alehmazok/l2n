import type { ArchetypeId, CharacterSummary, FightState, Item, ItemLocation, NewItem, RaceId } from "@l2n/shared";

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
  /** Starting items. */
  items: NewItem[];
}

export interface StoredFight {
  id: number;
  characterId: number;
  mobId: string;
  nodeId: string;
  /** Full engine state, including the RNG state. Never send it to a client as is. */
  state: FightState;
}

export type CharacterPatch = Partial<Pick<CharacterSummary, "level" | "xp" | "hp" | "resource" | "location" | "silver" | "autoCharges" | "recipes">>;

export type ItemPatch = Partial<Pick<Item, "quantity" | "location">>;

/**
 * A character locked for one game action. Everything done through it commits
 * together, and no other action on the same character runs in between.
 */
export interface CharacterTx {
  readonly character: CharacterSummary;
  /** The fight in progress, if any. */
  readonly fight: StoredFight | undefined;
  updateCharacter(patch: CharacterPatch): Promise<CharacterSummary>;
  /** Start a fight. Only valid when there is no fight in progress. */
  createFight(f: Omit<StoredFight, "id" | "characterId">): Promise<StoredFight>;
  /** Store the fight's new state; its outcome column follows `state.outcome`. */
  saveFight(state: FightState): Promise<StoredFight>;
  /** Everything the character owns, in every place, oldest first. Kept current by the methods below. */
  readonly items: Item[];
  /** Insert a row as is. Merging stacks is the caller's job (see routes/inventory.ts). */
  addItem(item: NewItem): Promise<Item>;
  updateItem(id: number, patch: ItemPatch): Promise<Item>;
  deleteItem(id: number): Promise<void>;
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

  /** The fight in progress for a character the caller already owns. */
  getOngoingFight(characterId: number): Promise<StoredFight | undefined>;
  /** Items of a character the caller already owns, oldest first. */
  listItems(characterId: number): Promise<Item[]>;
  /**
   * Run `fn` with the account's character locked. Resolves to undefined when
   * the character does not exist or belongs to another account. If `fn`
   * throws, nothing it did is kept.
   */
  withCharacter<T>(accountId: number, id: number, fn: (tx: CharacterTx) => Promise<T>): Promise<T | undefined>;
}
