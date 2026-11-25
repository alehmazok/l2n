import { describe, expect, it } from "vitest";
import {
  ITEMS,
  MOBS,
  SHOP_STOCK,
  SLOTS,
  armourFor,
  autoAction,
  autoResolve,
  buildMob,
  buildPlayer,
  chargeId,
  createRng,
  equipProblem,
  equipmentId,
  equipmentStats,
  fullSet,
  gearStats,
  isStackable,
  itemName,
  itemTemplate,
  itemValue,
  mobSilverBase,
  playerInputFor,
  referenceGear,
  resolveRound,
  rollLoot,
  rollRarity,
  chargesBoost,
  skillById,
  sellPrice,
  slotOf,
  starterItems,
  startFight,
  stockEntry,
  stockItem,
  tierForItemLevel,
  weaponPowerFor,
  type EquipmentTemplate,
  type FightState,
  type Item,
  type MobTemplate,
  type NewItem,
} from "../src/index.js";

const eq = (id: string) => ITEMS[id] as EquipmentTemplate;

describe("item data", () => {
  it("has a full set per grade and archetype, and valid mob drops", () => {
    for (const tier of [1, 2] as const)
      for (const a of ["warrior", "mage"] as const)
        for (const slot of SLOTS) expect(eq(equipmentId(tier, a, slot))).toMatchObject({ kind: "equipment", tier, slot, archetype: a });
    for (const m of Object.values(MOBS)) for (const d of m.drops) expect(["resource", "recipe"]).toContain(ITEMS[d.item]?.kind);
    expect(itemTemplate("nope")).toBeUndefined();
    expect(itemTemplate("toString")).toBeUndefined();
    expect(isStackable(ITEMS.healing_draught!)).toBe(true);
    expect(isStackable(eq("ironbound_mage_weapon"))).toBe(false);
    expect(chargeId("mage", 2)).toBe("ember_vial_2");
    expect(tierForItemLevel(9)).toBe(1);
    expect(tierForItemLevel(10)).toBe(2);
  });

  it("derives equipment stats from the grade formulas and rarity", () => {
    expect(equipmentStats(eq("ironbound_warrior_weapon"), 5)).toEqual({ weaponPower: weaponPowerFor(1, 5), armour: 0 });
    expect(equipmentStats(eq("steelsworn_mage_weapon"), 12, "rare").weaponPower).toBe(Math.round(20 * 1.16 * 10) / 10);
    expect(equipmentStats(eq("ironbound_warrior_chest"), 5).armour).toBe(Math.round(armourFor(1, 5) * 0.35 * 10) / 10);
  });

  it("a full common set of your level matches the reference gear", () => {
    for (const level of [1, 7, 10, 20]) {
      const tier = level >= 10 ? 2 : 1;
      const g = referenceGear("warrior", level);
      expect(g.weaponPower).toBe(weaponPowerFor(tier, level));
      expect(g.armour).toBeCloseTo(armourFor(tier, level), 0);
      expect(g.weaponTier).toBe(tier);
    }
  });

  it("adds rare bonuses and ignores what is not worn", () => {
    const items: NewItem[] = [
      { templateId: "ironbound_warrior_weapon", itemLevel: 3, rarity: "rare", bonus: "crit", quantity: 1, location: "equipped" },
      { templateId: "ironbound_warrior_head", itemLevel: 3, rarity: "rare", bonus: "hp", quantity: 1, location: "equipped" },
      { templateId: "ironbound_warrior_chest", itemLevel: 9, rarity: "common", bonus: null, quantity: 1, location: "bag" },
      { templateId: "healing_draught", itemLevel: null, rarity: null, bonus: null, quantity: 3, location: "equipped" },
    ];
    expect(gearStats(items)).toMatchObject({ critBonus: 0.02, hpBonus: 0.03, weaponTier: 1, weaponPower: Math.round(7 * 1.16 * 10) / 10 });
    expect(gearStats([])).toMatchObject({ weaponPower: 0, armour: 0, weaponTier: null });
  });

  it("checks archetype and level before equipping", () => {
    const steel = { templateId: "steelsworn_warrior_weapon", itemLevel: 12 };
    expect(equipProblem(steel, "warrior", 12)).toBeNull();
    expect(equipProblem(steel, "warrior", 11)).toMatch(/level 12/);
    expect(equipProblem(steel, "mage", 20)).toMatch(/warrior/);
    expect(equipProblem({ templateId: "ironbound_mage_weapon", itemLevel: 1 }, "mage", 1)).toBeNull();
    expect(equipProblem({ templateId: "healing_draught", itemLevel: null }, "mage", 1)).toMatch(/cannot be worn/);
  });

  it("gives new characters a worn set, draughts and charges", () => {
    const w = starterItems("warrior");
    expect(w.filter((i) => i.location === "equipped")).toHaveLength(6);
    expect(w.find((i) => i.templateId === "whetstone_1")?.quantity).toBe(50);
    expect(w.some((i) => i.templateId === "mana_draught")).toBe(false);
    expect(starterItems("mage").some((i) => i.templateId === "mana_draught")).toBe(true);
  });

  it("names items with their rarity", () => {
    expect(itemName({ templateId: "ironbound_warrior_weapon", rarity: "common" })).toBe("Ironbound Sword");
    expect(itemName({ templateId: "ironbound_warrior_weapon", rarity: "rare" })).toBe("Ironbound Sword (Rare)");
    expect(itemName({ templateId: "steelsworn_mage_chest", rarity: "uncommon" })).toBe("Steelsworn Vestments (Uncommon)");
    expect(itemName({ templateId: "gone", rarity: null })).toBe("gone");
    expect(slotOf("ironbound_mage_boots")).toBe("boots");
    expect(slotOf("rough_hide")).toBeNull();
  });
});

describe("prices", () => {
  it("values gear by grade, item level and rarity; NPCs pay 30%", () => {
    const w = { templateId: "ironbound_warrior_weapon", itemLevel: 5, rarity: "common" as const };
    expect(itemValue(w)).toBe(130);
    expect(itemValue({ ...w, rarity: "rare" })).toBe(325);
    expect(itemValue({ templateId: "steelsworn_warrior_weapon", itemLevel: 10, rarity: "common" })).toBe(645);
    expect(itemValue({ templateId: "ironbound_warrior_chest", itemLevel: 5, rarity: "common" })).toBe(Math.round(130 * 0.35));
    expect(itemValue({ templateId: "rough_hide", itemLevel: null, rarity: null })).toBe(4);
    expect(itemValue({ templateId: "gone", itemLevel: null, rarity: null })).toBe(0);
    expect(sellPrice(w)).toBe(39);
    expect(sellPrice({ templateId: "rough_hide", itemLevel: null, rarity: null }, 5)).toBe(5);
    expect(sellPrice({ templateId: "marsh_herb", itemLevel: null, rarity: null }, 2)).toBe(2);
  });

  it("stocks charges, draughts and gear of both grades", () => {
    const ids = SHOP_STOCK.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SHOP_STOCK) expect(ITEMS[s.templateId]).toBeDefined();
    expect(stockEntry("whetstone_1")).toMatchObject({ itemLevel: null });
    const gear = stockEntry("steelsworn_mage_weapon@15")!;
    expect(stockItem(gear, 1)).toMatchObject({ itemLevel: 15, rarity: "common", location: "bag", quantity: 1 });
    expect(stockItem(stockEntry("healing_draught")!, 7)).toMatchObject({ itemLevel: null, rarity: null, quantity: 7 });
    expect(stockEntry("nope")).toBeUndefined();
  });
});

describe("loot", () => {
  const rat = MOBS.mire_rat!;

  it("is deterministic for a seed and always pays silver", () => {
    const a = rollLoot(rat, { race: "human", archetype: "warrior" }, createRng(7));
    const b = rollLoot(rat, { race: "human", archetype: "warrior" }, createRng(7));
    expect(a).toEqual(b);
    for (let seed = 1; seed < 200; seed++) {
      const l = rollLoot(rat, { race: "human", archetype: "warrior" }, createRng(seed));
      expect(l.silver).toBeGreaterThanOrEqual(Math.round(mobSilverBase(1) * 0.8));
      expect(l.silver).toBeLessThanOrEqual(Math.round(mobSilverBase(1) * 1.2));
      for (const i of l.items) expect(i.location).toBe("bag");
    }
  });

  it("drops equipment of the killer's archetype at the mob's level, with rarity", () => {
    const boss: MobTemplate = { ...MOBS.burrow_hulk!, role: "boss", level: 12 };
    const seen = new Set<string>();
    for (let seed = 1; seed < 300; seed++) {
      const gear = rollLoot(boss, { race: "orc", archetype: "mage" }, createRng(seed)).items.filter((i) => i.itemLevel !== null);
      expect(gear).toHaveLength(1);
      const g = gear[0]!;
      expect(eq(g.templateId)).toMatchObject({ archetype: "mage", tier: 2 });
      expect(g.itemLevel).toBe(12);
      expect(g.bonus !== null).toBe(g.rarity === "rare");
      seen.add(g.rarity!);
    }
    expect(seen).toEqual(new Set(["common", "uncommon", "rare"]));
  });

  it("rarity odds are about 80/17/3", () => {
    const rng = createRng(1);
    const n = 20_000;
    const count = { common: 0, uncommon: 0, rare: 0 };
    for (let i = 0; i < n; i++) count[rollRarity(rng)]++;
    expect(count.common / n).toBeCloseTo(0.8, 1);
    expect(count.uncommon / n).toBeCloseTo(0.17, 1);
    expect(count.rare / n).toBeGreaterThan(0.02);
    expect(count.rare / n).toBeLessThan(0.04);
  });

  it("dwarves find more resources", () => {
    const resources = (race: "dwarf" | "human") => {
      let n = 0;
      for (let seed = 1; seed <= 4000; seed++)
        for (const i of rollLoot(rat, { race, archetype: "warrior" }, createRng(seed)).items)
          if (ITEMS[i.templateId]!.kind === "resource") n += i.quantity;
      return n;
    };
    const ratio = resources("dwarf") / resources("human");
    expect(ratio).toBeGreaterThan(1.05);
    expect(ratio).toBeLessThan(1.15);
  });
});

describe("consumables in a fight", () => {
  const start = (archetype: "warrior" | "mage", extra: Partial<Parameters<typeof playerInputFor>[1]> = {}, hp = 9999): FightState =>
    startFight(
      buildPlayer(
        playerInputFor(
          { name: "T", race: "human", archetype, level: 5, xp: 0, hp, resource: 0, gear: referenceGear(archetype, 5) },
          { charges: 0, ...extra },
        ),
      ),
      buildMob("Mob", 5),
      3,
    );

  it("a healing draught restores 30% of max HP and takes the turn", () => {
    const s = start("warrior", { draughts: { healing_draught: 2 } }, 10);
    const after = resolveRound(s, { type: "item", itemId: "healing_draught" });
    const drink = after.log.find((e) => e.t === "draught");
    expect(drink).toEqual({ t: "draught", item: "healing_draught", amount: Math.round(s.player.maxHp * 0.3) });
    expect(after.player.draughts?.healing_draught).toBe(1);
    expect(s.player.draughts?.healing_draught).toBe(2);
    expect(after.log.some((e) => e.t === "hit" && e.who === "player")).toBe(false);
  });

  it("a mana draught refills mana for mages only", () => {
    const m = start("mage", { draughts: { mana_draught: 1 } });
    const after = resolveRound({ ...m, player: { ...m.player, resource: 0 } }, { type: "item", itemId: "mana_draught" });
    const regen = Math.max(1, Math.round(m.player.maxResource * 0.05));
    expect(after.player.resource).toBe(regen + Math.round(m.player.maxResource * 0.3));
    const w = start("warrior", { draughts: { mana_draught: 1 } });
    expect(() => resolveRound(w, { type: "item", itemId: "mana_draught" })).toThrow(/mana/);
  });

  it("rejects draughts you do not carry and unknown items", () => {
    expect(() => resolveRound(start("warrior"), { type: "item", itemId: "healing_draught" })).toThrow(/none left/);
    expect(() => resolveRound(start("warrior"), { type: "item", itemId: "elixir" as "healing_draught" })).toThrow(/Unknown item/);
  });

  it("charges boost basic attacks and are spent one per attack", () => {
    const s = start("warrior", { charges: 1, chargeItem: "whetstone_1" });
    expect(s.player.chargeItem).toBe("whetstone_1");
    const after = resolveRound(s, { type: "attack" });
    expect(after.player.charges).toBe(0);
    expect(after.player.chargeItem).toBeUndefined();
    expect(start("warrior", { charges: 0, chargeItem: "whetstone_1" }).player.chargeItem).toBeUndefined();
  });

  it("ember vials boost damaging spells, not a mage's basic attack", () => {
    const m = start("mage", { charges: 2, chargeItem: "ember_vial_1" });
    const full = { ...m, player: { ...m.player, resource: m.player.maxResource } };
    expect(resolveRound(full, { type: "attack" }).player.charges).toBe(2);
    const cast = resolveRound(full, { type: "skill", skillId: "ember_bolt" });
    expect(cast.player.charges).toBe(1);
    const plain = resolveRound({ ...full, player: { ...full.player, charges: 0 } }, { type: "skill", skillId: "ember_bolt" });
    const dmg = (s: FightState) => s.log.find((e) => e.t === "hit" && e.who === "player");
    expect(dmg(cast)).toBeDefined();
    expect((dmg(cast) as { amount: number }).amount / (dmg(plain) as { amount: number }).amount).toBeCloseTo(1.3, 1);
    // Warriors' skills do not take whetstones.
    const w = start("warrior", { charges: 2, chargeItem: "whetstone_1" });
    expect(resolveRound({ ...w, player: { ...w.player, resource: 5 } }, { type: "skill", skillId: "heavy_blow" }).player.charges).toBe(2);
    expect(chargesBoost("mage", skillById("arcane_ward")!)).toBe(false);
    expect(chargesBoost("mage", skillById("searing_brand")!)).toBe(true);
    expect(chargesBoost("warrior", "attack")).toBe(true);
  });

  it("auto-battle drinks a healing draught when low and has no heal skill", () => {
    const s = start("warrior", { draughts: { healing_draught: 1 } }, 5);
    expect(autoAction(s)).toEqual({ type: "item", itemId: "healing_draught" });
    expect(autoAction(start("warrior", {}, 5))).toEqual({ type: "attack" });
  });
});

describe("economy", () => {
  // Rule of thumb from docs/design.md: an even-level kill pays a bit more
  // silver than the charges spent on it, so hunting with charges is
  // affordable but not free. Warriors spend them on basic attacks, mages on
  // damaging spells.
  for (const archetype of ["warrior", "mage"] as const)
    it(`a ${archetype}'s even-level kill pays 1.1–3.5× the charges it used`, () => {
      for (let level = 1; level <= 20; level++) {
        const tier = level >= 10 ? 2 : 1;
        const price = (ITEMS[chargeId(archetype, tier)] as { value: number }).value;
        let used = 0;
        const n = 100;
        for (let seed = 1; seed <= n; seed++) {
          const p = buildPlayer(
            playerInputFor(
              { name: "T", race: "human", archetype, level, xp: 0, hp: 9999, resource: 9999, gear: referenceGear(archetype, level) },
              { charges: 100, chargeItem: chargeId(archetype, tier) },
            ),
          );
          used += 100 - autoResolve(startFight(p, buildMob("Mob", level), seed)).player.charges;
        }
        const ratio = mobSilverBase(level) / ((used / n) * price);
        expect(ratio, `level ${level}`).toBeGreaterThan(1.1);
        expect(ratio, `level ${level}`).toBeLessThan(3.5);
      }
    });

  it("a full shop set costs a few levels of hunting", () => {
    const set = (a: "warrior", iL: number) => fullSet(a, iL).reduce((s, i) => s + itemValue(i as Item), 0);
    expect(set("warrior", 5)).toBeLessThan(300);
    expect(set("warrior", 10)).toBeGreaterThan(1000);
  });
});
