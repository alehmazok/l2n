import { START_NODE, type CharacterSummary, type FightState } from "@l2n/shared";
import type { Account, CharacterTx, NewCharacter, Store, StoredFight } from "./types.js";

type CharRow = CharacterSummary & { accountId: number };
type FightRow = StoredFight & { outcome: FightState["outcome"] };

const clone = <T>(v: T): T => structuredClone(v);

export class MemoryStore implements Store {
  private accounts: Account[] = [];
  private sessions = new Map<string, { accountId: number; expiresAt: Date }>();
  private characters: CharRow[] = [];
  private fights: FightRow[] = [];
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
      createdAt: new Date().toISOString(),
    };
    this.characters.push(c);
    return strip(c);
  }

  async getOngoingFight(characterId: number) {
    const f = this.fights.find((x) => x.characterId === characterId && x.outcome === "ongoing");
    return f && stripFight(f);
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
    const tx: CharacterTx = {
      character: strip(draft),
      fight: fight && stripFight(fight),
      updateCharacter: async (patch) => {
        Object.assign(draft, patch);
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
    };
    const result = await fn(tx);
    Object.assign(row, draft);
    if (existing && existingDraft) Object.assign(existing, existingDraft);
    this.fights.push(...created);
    return result;
  }
}

const strip = ({ accountId: _, ...c }: CharRow): CharacterSummary => ({ ...c });
const stripFight = ({ outcome: _, ...f }: FightRow): StoredFight => clone(f);
