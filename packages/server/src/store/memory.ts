import {
  START_NODE,
  chronicleKey,
  slotOf,
  type CharacterSummary,
  type ChatChannel,
  type ChatMessage,
  type ChronicleEntry,
  type FallenMarker,
  type FightState,
  type Item,
} from "@l2n/shared";
import type { Account, CharacterTx, NewCharacter, NewChatMessage, Store, StoredFight } from "./types.js";

type CharRow = CharacterSummary & { accountId: number; seenAt?: Date };
type ChatRow = ChatMessage & { accountId: number };
type FightRow = StoredFight & { outcome: FightState["outcome"] };
type ItemRow = Item & { characterId: number };

const clone = <T>(v: T): T => structuredClone(v);

export class MemoryStore implements Store {
  private accounts: Account[] = [];
  private sessions = new Map<string, { accountId: number; expiresAt: Date }>();
  private characters: CharRow[] = [];
  private fights: FightRow[] = [];
  private items: ItemRow[] = [];
  private chat: ChatRow[] = [];
  private chronicle: ChronicleEntry[] = [];
  private fallen: FallenMarker[] = [];
  private mutes = new Map<number, Date>();
  private nextId = 1;
  /** Per-character queue standing in for Postgres row locks. */
  private locks = new Map<number, Promise<unknown>>();

  async createAccount(email: string, passwordHash: string) {
    if (this.accounts.some((a) => a.email === email)) return "email_taken" as const;
    const account = { id: this.nextId++, email, passwordHash };
    this.accounts.push(account);
    return { ...account };
  }

  async findAccountByEmail(email: string) {
    const a = this.accounts.find((x) => x.email === email);
    return a && { ...a };
  }

  async createSession(accountId: number, tokenHash: Buffer, expiresAt: Date) {
    this.sessions.set(tokenHash.toString("hex"), { accountId, expiresAt });
  }

  async findSession(tokenHash: Buffer, now: Date) {
    const s = this.sessions.get(tokenHash.toString("hex"));
    if (!s || s.expiresAt <= now) return undefined;
    const a = this.accounts.find((x) => x.id === s.accountId);
    return a && { id: a.id, email: a.email };
  }

  async deleteSession(tokenHash: Buffer) {
    this.sessions.delete(tokenHash.toString("hex"));
  }

  async listCharacters(accountId: number) {
    return this.characters.filter((c) => c.accountId === accountId).map(strip);
  }

  async getCharacter(accountId: number, id: number) {
    const c = this.characters.find((x) => x.accountId === accountId && x.id === id);
    return c && strip(c);
  }

  async createCharacter(n: NewCharacter) {
    if (this.characters.some((c) => c.name.toLowerCase() === n.name.toLowerCase())) return "name_taken" as const;
    if (this.characters.filter((c) => c.accountId === n.accountId).length >= n.maxPerAccount) return "limit_reached" as const;
    const c = {
      accountId: n.accountId,
      id: this.nextId++,
      name: n.name,
      race: n.race,
      archetype: n.archetype,
      profession: null,
      level: 1,
      xp: 0,
      hp: n.hp,
      resource: n.resource,
      silver: 0,
      location: START_NODE,
      autoCharges: true,
      recipes: [] as string[],
      quests: {},
      createdAt: new Date().toISOString(),
    };
    this.characters.push(c);
    for (const i of n.items) this.items.push({ ...clone(i), id: this.nextId++, characterId: c.id });
    return strip(c);
  }

  async getOngoingFight(characterId: number) {
    const f = this.fights.find((x) => x.characterId === characterId && x.outcome === "ongoing");
    return f && stripFight(f);
  }

  async listItems(characterId: number) {
    return this.items.filter((i) => i.characterId === characterId).map(stripItem);
  }

  async withCharacter<T>(accountId: number, id: number, fn: (tx: CharacterTx) => Promise<T>): Promise<T | undefined> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(() => this.runTx(accountId, id, fn));
    this.locks.set(id, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(id) === run) this.locks.delete(id);
    }
  }

  private async runTx<T>(accountId: number, id: number, fn: (tx: CharacterTx) => Promise<T>): Promise<T | undefined> {
    const row = this.characters.find((x) => x.accountId === accountId && x.id === id);
    if (!row) return undefined;
    // Work on copies and write them back only if fn succeeds.
    const draft = clone(row);
    const existing = this.fights.find((x) => x.characterId === id && x.outcome === "ongoing");
    const existingDraft = existing && clone(existing);
    let fight: FightRow | undefined = existingDraft;
    const created: FightRow[] = [];
    let items = this.items.filter((i) => i.characterId === id).map(clone);
    const chronicle: ChronicleEntry[] = [];
    const fallen: FallenMarker[] = [];
    const findItem = (itemId: number) => {
      const i = items.find((x) => x.id === itemId);
      if (!i) throw new Error(`No item ${itemId}`);
      return i;
    };
    const tx: CharacterTx = {
      character: strip(draft),
      fight: fight && stripFight(fight),
      updateCharacter: async (patch) => {
        Object.assign(draft, clone(patch));
        return strip(draft);
      },
      createFight: async (f) => {
        if (fight?.outcome === "ongoing") throw new Error("Character already has a fight in progress");
        fight = { ...clone(f), id: this.nextId++, characterId: id, outcome: f.state.outcome };
        created.push(fight);
        return stripFight(fight);
      },
      saveFight: async (state) => {
        if (!fight || fight.outcome !== "ongoing") throw new Error("No fight in progress");
        fight.state = clone(state);
        fight.outcome = state.outcome;
        return stripFight(fight);
      },
      get items() {
        return items.map(stripItem);
      },
      addItem: async (i) => {
        const r = { ...clone(i), id: this.nextId++, characterId: id };
        items.push(r);
        checkItems(items);
        return stripItem(r);
      },
      updateItem: async (itemId, patch) => {
        const i = findItem(itemId);
        if (patch.quantity !== undefined && patch.quantity <= 0) throw new Error("Quantity must be positive");
        Object.assign(i, patch);
        checkItems(items);
        return stripItem(i);
      },
      deleteItem: async (itemId) => {
        findItem(itemId);
        items = items.filter((x) => x.id !== itemId);
      },
      addChronicle: async (event, at) => {
        const key = chronicleKey(event);
        const first = ![...this.chronicle, ...chronicle].some((e) => e.event.kind === event.kind && chronicleKey(e.event) === key);
        const e = { id: this.nextId++, event: clone(event), name: draft.name, race: draft.race, first, at: at.toISOString() };
        chronicle.push(e);
        return clone(e);
      },
      addFallen: async (nodeId, mobId, at) => {
        const m = { id: this.nextId++, nodeId, name: draft.name, race: draft.race, mobId, at: at.toISOString() };
        fallen.push(m);
        return { ...m };
      },
    };
    const result = await fn(tx);
    Object.assign(row, draft);
    this.items = [...this.items.filter((i) => i.characterId !== id), ...items];
    if (existing && existingDraft) Object.assign(existing, existingDraft);
    this.fights.push(...created);
    this.chronicle.push(...chronicle);
    this.fallen.push(...fallen);
    return result;
  }

  async touchCharacter(accountId: number, id: number, at: Date) {
    const c = this.characters.find((x) => x.accountId === accountId && x.id === id);
    if (!c) return undefined;
    c.seenAt = at;
    return strip(c);
  }

  async onlineCounts(since: Date) {
    const out: Record<string, number> = {};
    for (const c of this.characters) if (c.seenAt && c.seenAt > since) out[c.location] = (out[c.location] ?? 0) + 1;
    return out;
  }

  async addChatMessage(m: NewChatMessage) {
    const row: ChatRow = { id: this.nextId++, channel: m.channel, accountId: m.accountId, name: m.name, race: m.race, text: m.text, at: m.at.toISOString() };
    this.chat.push(row);
    return stripChat(row);
  }

  async listChat(channels: ChatChannel[], afterId: number | undefined, limit: number) {
    const on = this.chat.filter((m) => channels.includes(m.channel));
    const rows = afterId === undefined ? on.slice(-limit) : on.filter((m) => m.id > afterId).slice(0, limit);
    return rows.map(stripChat);
  }

  async chatStanding(accountId: number, since: Date) {
    const mine = this.chat.filter((m) => m.accountId === accountId);
    const last = mine.at(-1);
    return {
      mutedUntil: this.mutes.get(accountId) ?? null,
      recent: mine.filter((m) => new Date(m.at) > since).length,
      last: last ? new Date(last.at) : null,
    };
  }

  async muteByCharacterName(name: string, until: Date | null) {
    const c = this.characters.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!c) return false;
    if (until) this.mutes.set(c.accountId, until);
    else this.mutes.delete(c.accountId);
    this.chat = this.chat.filter((m) => m.accountId !== c.accountId);
    return true;
  }

  async listChronicle(afterId: number | undefined, limit: number) {
    const rows = afterId === undefined ? this.chronicle.slice(-limit) : this.chronicle.filter((e) => e.id > afterId).slice(0, limit);
    return rows.map(clone);
  }

  async listFallen(since: Date, limit: number) {
    return this.fallen
      .filter((m) => new Date(m.at) > since)
      .reverse()
      .slice(0, limit)
      .map((m) => ({ ...m }));
  }
}

const stripChat = ({ accountId: _, ...m }: ChatRow): ChatMessage => ({ ...m });

const strip = ({ accountId: _, seenAt: __, ...c }: CharRow): CharacterSummary => clone(c);
const stripFight = ({ outcome: _, ...f }: FightRow): StoredFight => clone(f);
/** The same rules as the Postgres unique indexes: one item per slot, one stack per place. */
function checkItems(items: ItemRow[]) {
  const seen = new Set<string>();
  for (const i of items) {
    const key =
      i.location === "equipped" ? `slot:${slotOf(i.templateId)}` : i.itemLevel === null ? `stack:${i.location}:${i.templateId}` : undefined;
    if (!key) continue;
    if (seen.has(key)) throw new Error(`Duplicate ${key}`);
    seen.add(key);
  }
}

const stripItem = ({ characterId: _, ...i }: ItemRow): Item => ({ ...i });
