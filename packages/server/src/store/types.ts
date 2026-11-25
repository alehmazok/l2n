import type { ArchetypeId, CharacterSummary, ChatChannel, ChatMessage, ChronicleEntry, ChronicleEvent, FallenMarker, FightState, Item, ItemLocation, NewItem, RaceId } from "@l2n/shared";

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

export type CharacterPatch = Partial<Pick<CharacterSummary, "level" | "xp" | "hp" | "resource" | "location" | "silver" | "autoCharges" | "recipes" | "quests" | "profession">>;

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
  /** Write a chronicle entry for this character; `first` is worked out from earlier entries. */
  addChronicle(event: ChronicleEvent, at: Date): Promise<ChronicleEntry>;
  /** Leave a fallen marker for this character on a node. */
  addFallen(nodeId: string, mobId: string, at: Date): Promise<FallenMarker>;
}

export interface NewChatMessage {
  channel: ChatChannel;
  accountId: number;
  characterId: number;
  name: string;
  race: RaceId;
  text: string;
  at: Date;
}

/** What the chat rate limit and mutes need to know about an account. */
export interface ChatStanding {
  mutedUntil: Date | null;
  /** Lines sent since the given time. */
  recent: number;
  /** When the latest line was sent, if any. */
  last: Date | null;
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

  /** Mark the account's character as present now; resolves to the character, or undefined if not theirs. */
  touchCharacter(accountId: number, id: number, at: Date): Promise<CharacterSummary | undefined>;
  /** Characters seen since `since`, counted per node they stand on. */
  onlineCounts(since: Date): Promise<Record<string, number>>;

  addChatMessage(m: NewChatMessage): Promise<ChatMessage>;
  /** Lines on these channels, oldest first: those after `afterId`, or else the latest ones; at most `limit`. */
  listChat(channels: ChatChannel[], afterId: number | undefined, limit: number): Promise<ChatMessage[]>;
  chatStanding(accountId: number, since: Date): Promise<ChatStanding>;
  /**
   * Keep the account that owns this character out of chat until `until`
   * (null lifts it) and delete its chat lines. False if no such character.
   */
  muteByCharacterName(name: string, until: Date | null): Promise<boolean>;

  /** Chronicle entries, oldest first: those after `afterId`, or else the latest ones; at most `limit`. */
  listChronicle(afterId: number | undefined, limit: number): Promise<ChronicleEntry[]>;
  /** Fallen markers left since `since`, newest first, at most `limit`. */
  listFallen(since: Date, limit: number): Promise<FallenMarker[]>;
}
