import { beforeEach, describe, expect, it } from "vitest";
import { buildMob, buildPlayer, playerInputFor, resolveRound, startFight, starterItems, type FightState, type NewItem } from "@l2n/shared";
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
      items: [],
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
      expect(c).toMatchObject({ name: "Grosh", race: "orc", archetype: "warrior", level: 1, xp: 0, hp: 72, silver: 0, location: "brackwell_square", profession: null, autoCharges: true });
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

    const fightState = (seed = 1): FightState =>
      startFight(
        buildPlayer(playerInputFor({ name: "Grosh", race: "orc", archetype: "warrior", level: 1, xp: 0, hp: 72, resource: 0 })),
        buildMob("Mire Rat", 1),
        seed,
      );

    async function hero() {
      const a = await store.createAccount(`f${Math.random()}@example.com`, "h");
      if (a === "email_taken") throw new Error("unexpected");
      const c = await store.createCharacter(char(a.id, "Fighter"));
      if (typeof c === "string") throw new Error("unexpected");
      return { accountId: a.id, id: c.id };
    }

    it("runs character actions only for the owner", async () => {
      const { id } = await hero();
      const other = await store.createAccount("other@example.com", "h");
      if (other === "email_taken") throw new Error("unexpected");
      expect(await store.withCharacter(other.id, id, async () => "ran")).toBeUndefined();
    });

    it("updates characters and keeps one fight in progress", async () => {
      const { accountId, id } = await hero();
      const moved = await store.withCharacter(accountId, id, (tx) => tx.updateCharacter({ location: "mossgate_old_road", hp: 50 }));
      expect(moved).toMatchObject({ location: "mossgate_old_road", hp: 50, xp: 0 });

      const s0 = fightState();
      const created = await store.withCharacter(accountId, id, (tx) => tx.createFight({ mobId: "mire_rat", nodeId: "mossgate_old_road", state: s0 }));
      expect(created).toMatchObject({ characterId: id, mobId: "mire_rat", state: s0 });
      expect(await store.getOngoingFight(id)).toEqual(created);

      const seen = await store.withCharacter(accountId, id, async (tx) => tx.fight);
      expect(seen).toEqual(created);
      await expect(
        store.withCharacter(accountId, id, (tx) => tx.createFight({ mobId: "mire_rat", nodeId: "x", state: s0 })),
      ).rejects.toThrow();

      const s1 = resolveRound(s0, { type: "attack" });
      await store.withCharacter(accountId, id, (tx) => tx.saveFight(s1));
      expect((await store.getOngoingFight(id))?.state).toEqual(s1);

      await store.withCharacter(accountId, id, (tx) => tx.saveFight({ ...s1, outcome: "fled" }));
      expect(await store.getOngoingFight(id)).toBeUndefined();
      expect(await store.withCharacter(accountId, id, async (tx) => tx.fight)).toBeUndefined();
    });

    it("keeps nothing from an action that throws", async () => {
      const { accountId, id } = await hero();
      await expect(
        store.withCharacter(accountId, id, async (tx) => {
          await tx.updateCharacter({ xp: 99 });
          await tx.createFight({ mobId: "mire_rat", nodeId: "mossgate_old_road", state: fightState() });
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect((await store.getCharacter(accountId, id))?.xp).toBe(0);
      expect(await store.getOngoingFight(id)).toBeUndefined();
    });

    it("serialises parallel actions on one character", async () => {
      const { accountId, id } = await hero();
      const bump = () =>
        store.withCharacter(accountId, id, async (tx) => {
          const xp = tx.character.xp;
          await new Promise((r) => setTimeout(r, 5));
          return tx.updateCharacter({ xp: xp + 1 });
        });
      await Promise.all([bump(), bump(), bump(), bump()]);
      expect((await store.getCharacter(accountId, id))?.xp).toBe(4);
    });
    const stack = (templateId: string, quantity: number, location: NewItem["location"] = "bag"): NewItem => ({
      templateId,
      itemLevel: null,
      rarity: null,
      bonus: null,
      quantity,
      location,
    });

    it("creates characters with their starting items", async () => {
      const a = await store.createAccount("i@example.com", "h");
      if (a === "email_taken") throw new Error("unexpected");
      const c = await store.createCharacter(char(a.id, "Kitted", { items: starterItems("warrior") }));
      if (typeof c === "string") throw new Error("unexpected");
      const items = await store.listItems(c.id);
      expect(items.map(({ id: _, ...rest }) => rest)).toEqual(starterItems("warrior"));
      expect(await store.withCharacter(a.id, c.id, async (tx) => tx.items)).toEqual(items);
    });

    it("adds, updates and deletes items inside an action", async () => {
      const { accountId, id } = await hero();
      const silver = await store.withCharacter(accountId, id, (tx) => tx.updateCharacter({ silver: 120, autoCharges: false }));
      expect(silver).toMatchObject({ silver: 120, autoCharges: false, recipes: [] });
      await store.withCharacter(accountId, id, (tx) => tx.updateCharacter({ recipes: ["whetstones_1", "ironbound_mail"] }));
      expect((await store.getCharacter(accountId, id))?.recipes).toEqual(["whetstones_1", "ironbound_mail"]);
      expect((await store.getCharacter(accountId, id))).toMatchObject({ quests: {}, profession: null });
      const quests = { mud_and_rats: { status: "done" as const, progress: [5] }, hermits_lamp: { status: "active" as const, progress: [2] } };
      await store.withCharacter(accountId, id, (tx) => tx.updateCharacter({ quests, profession: "vanguard" }));
      expect((await store.getCharacter(accountId, id))).toMatchObject({ quests, profession: "vanguard" });
      const sword: NewItem = { templateId: "ironbound_warrior_weapon", itemLevel: 4, rarity: "rare", bonus: "crit", quantity: 1, location: "bag" };
      const added = await store.withCharacter(accountId, id, async (tx) => {
        const s = await tx.addItem(sword);
        const h = await tx.addItem(stack("rough_hide", 3));
        expect(tx.items).toHaveLength(2);
        await tx.updateItem(h.id, { quantity: 5, location: "warehouse" });
        await tx.updateItem(s.id, { location: "equipped" });
        return tx.items;
      });
      expect(added).toEqual([
        { ...sword, id: added![0]!.id, location: "equipped" },
        { ...stack("rough_hide", 5, "warehouse"), id: added![1]!.id },
      ]);
      expect(await store.listItems(id)).toEqual(added);
      await store.withCharacter(accountId, id, async (tx) => {
        await tx.deleteItem(added![1]!.id);
        expect(tx.items).toHaveLength(1);
      });
      expect(await store.listItems(id)).toHaveLength(1);
      await expect(store.withCharacter(accountId, id, (tx) => tx.deleteItem(99999))).rejects.toThrow();
      await expect(store.withCharacter(accountId, id, (tx) => tx.updateItem(99999, { quantity: 1 }))).rejects.toThrow();
    });

    it("allows one worn item per slot and one stack per place", async () => {
      const { accountId, id } = await hero();
      const helm = (location: NewItem["location"]): NewItem => ({
        templateId: "ironbound_warrior_head",
        itemLevel: 1,
        rarity: "common",
        bonus: null,
        quantity: 1,
        location,
      });
      await store.withCharacter(accountId, id, (tx) => tx.addItem(helm("equipped")));
      await expect(store.withCharacter(accountId, id, (tx) => tx.addItem(helm("equipped")))).rejects.toThrow();
      await store.withCharacter(accountId, id, (tx) => tx.addItem(stack("bone_shard", 1)));
      await expect(store.withCharacter(accountId, id, (tx) => tx.addItem(stack("bone_shard", 2)))).rejects.toThrow();
      await store.withCharacter(accountId, id, (tx) => tx.addItem(stack("bone_shard", 2, "warehouse")));
      expect(await store.listItems(id)).toHaveLength(3);
    });

    it("rolls back item changes from an action that throws", async () => {
      const { accountId, id } = await hero();
      await expect(
        store.withCharacter(accountId, id, async (tx) => {
          await tx.addItem(stack("marsh_herb", 2));
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await store.listItems(id)).toEqual([]);
    });
    const at = (min: number) => new Date(Date.UTC(2026, 10, 25, 12, min));

    it("counts characters seen recently per node", async () => {
      const { accountId, id } = await hero();
      const other = await store.createAccount("o@example.com", "h");
      if (other === "email_taken") throw new Error("unexpected");
      const c2 = await store.createCharacter(char(other.id, "Ilwen"));
      if (typeof c2 === "string") throw new Error("unexpected");
      expect(await store.touchCharacter(other.id, id, at(0))).toBeUndefined();
      expect((await store.touchCharacter(accountId, id, at(0)))?.name).toBe("Fighter");
      await store.touchCharacter(other.id, c2.id, at(10));
      expect(await store.onlineCounts(at(-1))).toEqual({ brackwell_square: 2 });
      await store.withCharacter(accountId, id, (tx) => tx.updateCharacter({ location: "old_road" }));
      expect(await store.onlineCounts(at(-1))).toEqual({ brackwell_square: 1, old_road: 1 });
      expect(await store.onlineCounts(at(5))).toEqual({ brackwell_square: 1 });
    });

    it("stores chat per channel and pages through it", async () => {
      const { accountId, id } = await hero();
      const say = (channel: "global" | "mossgate_fields", text: string, min: number) =>
        store.addChatMessage({ channel, accountId, characterId: id, name: "Fighter", race: "orc", text, at: at(min) });
      const first = await say("global", "hello <b>all</b>", 0);
      expect(first).toMatchObject({ channel: "global", name: "Fighter", race: "orc", text: "hello <b>all</b>", at: at(0).toISOString() });
      await say("mossgate_fields", "rats here", 1);
      await say("global", "three", 2);
      await say("global", "four", 3);
      expect((await store.listChat(["global"], undefined, 2)).map((m) => m.text)).toEqual(["three", "four"]);
      expect((await store.listChat(["global", "mossgate_fields"], first.id, 2)).map((m) => m.text)).toEqual(["rats here", "three"]);
      expect(await store.listChat(["thornwood_hollow"], undefined, 10)).toEqual([]);
      expect(await store.chatStanding(accountId, at(1))).toEqual({ mutedUntil: null, recent: 2, last: at(3) });
    });

    it("mutes an account by character name and deletes its lines", async () => {
      const { accountId, id } = await hero();
      await store.addChatMessage({ channel: "global", accountId, characterId: id, name: "Fighter", race: "orc", text: "spam", at: at(0) });
      expect(await store.muteByCharacterName("nobody", at(60))).toBe(false);
      expect(await store.muteByCharacterName("FIGHTER", at(60))).toBe(true);
      expect(await store.listChat(["global"], undefined, 10)).toEqual([]);
      expect(await store.chatStanding(accountId, at(-10))).toEqual({ mutedUntil: at(60), recent: 0, last: null });
      await store.muteByCharacterName("Fighter", null);
      expect((await store.chatStanding(accountId, at(-10))).mutedUntil).toBeNull();
    });

    it("writes chronicle entries and fallen markers with the action", async () => {
      const { accountId, id } = await hero();
      await store.withCharacter(accountId, id, async (tx) => {
        const e = await tx.addChronicle({ kind: "boss", mobId: "ashen_warden" }, at(0));
        expect(e).toMatchObject({ event: { kind: "boss", mobId: "ashen_warden" }, name: "Fighter", race: "orc", first: true, at: at(0).toISOString() });
        expect((await tx.addChronicle({ kind: "boss", mobId: "ashen_warden" }, at(1))).first).toBe(false);
        await tx.addFallen("old_road", "mire_rat", at(2));
      });
      await expect(
        store.withCharacter(accountId, id, async (tx) => {
          await tx.addChronicle({ kind: "profession", profession: "reaver" }, at(3));
          await tx.addFallen("old_road", "hedge_crow", at(3));
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      await store.withCharacter(accountId, id, (tx) => tx.addChronicle({ kind: "profession", profession: "reaver" }, at(4)));
      const all = await store.listChronicle(undefined, 10);
      expect(all.map((e) => [e.event.kind, e.first])).toEqual([["boss", true], ["boss", false], ["profession", true]]);
      expect((await store.listChronicle(undefined, 1)).map((e) => e.event.kind)).toEqual(["profession"]);
      expect((await store.listChronicle(all[0]!.id, 1)).map((e) => e.first)).toEqual([false]);
      const fallen = await store.listFallen(at(-1), 10);
      expect(fallen).toEqual([{ id: fallen[0]!.id, nodeId: "old_road", name: "Fighter", race: "orc", mobId: "mire_rat", at: at(2).toISOString() }]);
      expect(await store.listFallen(at(2), 10)).toEqual([]);
    });
  });
}
