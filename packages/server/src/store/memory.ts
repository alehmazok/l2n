import type { CharacterSummary } from "@l2n/shared";
import type { Account, NewCharacter, Store } from "./types.js";

export class MemoryStore implements Store {
  private accounts: Account[] = [];
  private sessions = new Map<string, { accountId: number; expiresAt: Date }>();
  private characters: (CharacterSummary & { accountId: number })[] = [];
  private nextId = 1;

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
      location: "brackwell",
      createdAt: new Date().toISOString(),
    };
    this.characters.push(c);
    return strip(c);
  }
}

const strip = ({ accountId: _, ...c }: CharacterSummary & { accountId: number }): CharacterSummary => ({ ...c });
