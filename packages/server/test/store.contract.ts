import { beforeEach, describe, expect, it } from "vitest";
import type { NewCharacter, Store } from "../src/store/index.js";

/** Behaviour every Store must have. Run against MemoryStore and PgStore. */
export function storeContract(name: string, makeStore: () => Promise<Store>) {
  describe(`store contract: ${name}`, () => {
    let store: Store;
    beforeEach(async () => {
      store = await makeStore();
    });

    const char = (accountId: number, name: string, extra: Partial<NewCharacter> = {}): NewCharacter => ({
      accountId,
      name,
      race: "orc",
      archetype: "warrior",
      hp: 72,
      resource: 0,
      maxPerAccount: 4,
      ...extra,
    });

    it("creates accounts with unique emails", async () => {
      const a = await store.createAccount("a@example.com", "hash");
      expect(a).toMatchObject({ email: "a@example.com", passwordHash: "hash" });
      expect(await store.createAccount("a@example.com", "other")).toBe("email_taken");
      expect((await store.findAccountByEmail("a@example.com"))?.passwordHash).toBe("hash");
      expect(await store.findAccountByEmail("nobody@example.com")).toBeUndefined();
    });

    it("finds live sessions and forgets expired or deleted ones", async () => {
      const a = await store.createAccount("s@example.com", "hash");
      if (a === "email_taken") throw new Error("unexpected");
      const t = Buffer.from("token-1");
      const now = new Date("2026-01-01T00:00:00Z");
      await store.createSession(a.id, t, new Date("2026-01-02T00:00:00Z"));
      expect(await store.findSession(t, now)).toEqual({ id: a.id, email: "s@example.com" });
      expect(await store.findSession(t, new Date("2026-01-03T00:00:00Z"))).toBeUndefined();
      expect(await store.findSession(Buffer.from("other"), now)).toBeUndefined();
      await store.deleteSession(t);
      expect(await store.findSession(t, now)).toBeUndefined();
    });

    it("creates and lists characters per account", async () => {
      const a = await store.createAccount("c@example.com", "h");
      const b = await store.createAccount("d@example.com", "h");
      if (a === "email_taken" || b === "email_taken") throw new Error("unexpected");
      const c = await store.createCharacter(char(a.id, "Grosh"));
      expect(c).toMatchObject({ name: "Grosh", race: "orc", archetype: "warrior", level: 1, xp: 0, hp: 72, silver: 0, location: "brackwell", profession: null });
      if (typeof c === "string") throw new Error("unexpected");
      await store.createCharacter(char(a.id, "Ilwen", { race: "dawn_elf", archetype: "mage", hp: 38, resource: 33 }));
      expect((await store.listCharacters(a.id)).map((x) => x.name)).toEqual(["Grosh", "Ilwen"]);
      expect(await store.listCharacters(b.id)).toEqual([]);
      expect(await store.getCharacter(a.id, c.id)).toEqual(c);
      expect(await store.getCharacter(b.id, c.id)).toBeUndefined();
    });

    it("keeps character names unique regardless of case", async () => {
      const a = await store.createAccount("n@example.com", "h");
      const b = await store.createAccount("m@example.com", "h");
      if (a === "email_taken" || b === "email_taken") throw new Error("unexpected");
      await store.createCharacter(char(a.id, "Aldric"));
      expect(await store.createCharacter(char(b.id, "ALDRIC"))).toBe("name_taken");
    });

    it("enforces the per-account character limit", async () => {
      const a = await store.createAccount("l@example.com", "h");
      if (a === "email_taken") throw new Error("unexpected");
      await store.createCharacter(char(a.id, "Onea", { maxPerAccount: 2 }));
      await store.createCharacter(char(a.id, "Twob", { maxPerAccount: 2 }));
      expect(await store.createCharacter(char(a.id, "Three", { maxPerAccount: 2 }))).toBe("limit_reached");
    });
  });
}
