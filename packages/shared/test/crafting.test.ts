import { describe, expect, it } from "vitest";
import {
  CRAFT_RARITY_ODDS,
  ITEMS,
  MOBS,
  RECIPES,
  SMITHY_STOCK,
  bagCount,
  craftProblem,
  createRng,
  itemValue,
  recipeById,
  recipeChance,
  recipeItemId,
  rollCraft,
  rollLoot,
  stockEntry,
  type Item,
} from "../src/index.js";

const bag = (stacks: Record<string, number>): Item[] =>
  Object.entries(stacks).map(([templateId, quantity], i) => ({
    id: i + 1,
    templateId,
    itemLevel: null,
    rarity: null,
    bonus: null,
    quantity,
    location: "bag",
  }));

describe("recipe data", () => {
  it("has 15 recipes with known inputs and outputs, and a recipe item for each", () => {
    expect(Object.keys(RECIPES)).toHaveLength(15);
    for (const r of Object.values(RECIPES)) {
      for (const i of r.inputs) expect(ITEMS[i.item]?.kind, `${r.id} needs ${i.item}`).toBe("resource");
      for (const m of r.makes) expect(ITEMS[m.item], `${r.id} makes ${m.item}`).toBeDefined();
      const gear = r.makes.some((m) => ITEMS[m.item]!.kind === "equipment");
      expect(r.itemLevel !== null, r.id).toBe(gear);
      for (const m of r.makes) {
        const t = ITEMS[m.item]!;
        if (t.kind === "equipment") expect(t.archetype).toBe(r.archetype);
      }
      expect(ITEMS[recipeItemId(r.id)]).toMatchObject({ kind: "recipe", recipe: r.id });
      expect(r.chance).toBeGreaterThan(0);
      expect(r.chance).toBeLessThan(1);
    }
    expect(recipeById("nope")).toBeUndefined();
    expect(recipeById("toString")).toBeUndefined();
  });

  it("set recipes make the five armour pieces", () => {
    expect(RECIPES.ironbound_mail!.makes.map((m) => m.item)).toEqual([
      "ironbound_warrior_head",
      "ironbound_warrior_chest",
      "ironbound_warrior_legs",
      "ironbound_warrior_gloves",
      "ironbound_warrior_boots",
    ]);
  });

  it("the smith sells the first ten recipes; Steelsworn gear recipes drop and the charm comes from a quest", () => {
    expect(SMITHY_STOCK).toHaveLength(10);
    expect(stockEntry("recipe_whetstones_1")).toMatchObject({ service: "crafting" });
    expect(stockEntry("recipe_steelsworn_blade")).toBeUndefined();
    expect(itemValue({ templateId: "recipe_ironbound_mail", itemLevel: null, rarity: null })).toBe(250);
    const dropped = new Set(Object.values(MOBS).flatMap((m) => m.drops.map((d) => d.item)));
    for (const id of ["steelsworn_blade", "steelsworn_staff", "steelsworn_plate", "steelsworn_vestments"])
      expect(dropped.has(recipeItemId(id)), id).toBe(true);
    expect(dropped.has(recipeItemId("lantern_ward_charm"))).toBe(false);
  });

  it("crafted supplies cost less than buying them", () => {
    for (const r of Object.values(RECIPES)) {
      if (r.itemLevel !== null || r.id === "lantern_ward_charm") continue;
      const inputs = r.inputs.reduce((s, i) => s + i.quantity * itemValue({ templateId: i.item, itemLevel: null, rarity: null }), 0);
      const made = r.makes.reduce((s, m) => s + m.quantity * itemValue({ templateId: m.item, itemLevel: null, rarity: null }), 0);
      expect((r.fee + inputs) / r.chance, r.id).toBeLessThan(made);
    }
  });
});

describe("crafting", () => {
  const r = RECIPES.whetstones_1!;
  const enough = bag({ iron_scrap: 2, resin_lump: 1 });

  it("needs the recipe, the resources in the bag and the fee", () => {
    expect(craftProblem(r, { recipes: [], silver: 100 }, enough)).toMatch(/do not know/);
    expect(craftProblem(r, { recipes: [r.id], silver: 100 }, bag({ iron_scrap: 1 }))).toBe("You need 1 Iron Scrap, 1 Resin Lump more.");
    expect(craftProblem(r, { recipes: [r.id], silver: 19 }, enough)).toMatch(/20 silver/);
    expect(craftProblem(r, { recipes: [r.id], silver: 20 }, enough)).toBeNull();
    // Resources in the warehouse do not count.
    expect(craftProblem(r, { recipes: [r.id], silver: 20 }, enough.map((i) => ({ ...i, location: "warehouse" as const })))).toMatch(/need/);
    expect(bagCount(enough, "iron_scrap")).toBe(2);
  });

  it("adds the dwarf bonus and clamps the chance", () => {
    expect(recipeChance(RECIPES.steelsworn_blade!, "human")).toBeCloseTo(0.55);
    expect(recipeChance(RECIPES.steelsworn_blade!, "dwarf")).toBeCloseTo(0.6);
    expect(recipeChance(r, "dwarf")).toBeCloseTo(0.95);
  });

  it("succeeds at about the recipe's chance", () => {
    let ok = 0;
    for (let seed = 1; seed <= 4000; seed++) if (rollCraft(RECIPES.steelsworn_plate!, "human", createRng(seed)).success) ok++;
    expect(ok / 4000).toBeGreaterThan(0.52);
    expect(ok / 4000).toBeLessThan(0.58);
  });

  it("on success uses every input and makes the output", () => {
    const seed = [...Array(50).keys()].find((s) => rollCraft(r, "human", createRng(s)).success)!;
    const out = rollCraft(r, "human", createRng(seed));
    expect(out.used).toEqual(r.inputs);
    expect(out.made).toEqual([{ templateId: "whetstone_1", itemLevel: null, rarity: null, bonus: null, quantity: 25, location: "bag" }]);
  });

  it("on failure loses half of each input, rounded up, and makes nothing", () => {
    const g = RECIPES.ironbound_mail!;
    const seed = [...Array(200).keys()].find((s) => !rollCraft(g, "human", createRng(s)).success)!;
    const out = rollCraft(g, "human", createRng(seed));
    expect(out.made).toEqual([]);
    expect(out.used).toEqual([
      { item: "iron_scrap", quantity: 4 },
      { item: "rough_hide", quantity: 3 },
      { item: "bone_shard", quantity: 1 },
    ]);
  });

  it("crafted gear has the recipe's item level and rolls its own rarity per piece", () => {
    const count = { common: 0, uncommon: 0, rare: 0 };
    let bonuses = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const out = rollCraft(RECIPES.ironbound_mail!, "human", createRng(seed));
      for (const i of out.made) {
        expect(i.itemLevel).toBe(8);
        count[i.rarity!]++;
        if (i.bonus) bonuses++;
        expect(i.bonus !== null).toBe(i.rarity === "rare");
      }
    }
    const total = count.common + count.uncommon + count.rare;
    expect(count.rare / total).toBeGreaterThan(0.035);
    expect(count.rare / total).toBeLessThan(0.065);
    expect(count.uncommon / total).toBeGreaterThan(0.17);
    expect(count.uncommon / total).toBeLessThan(0.23);
    expect(bonuses).toBe(count.rare);
    expect(CRAFT_RARITY_ODDS.reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1);
  });
});

describe("recipe drops", () => {
  it("drop only for the killer's archetype", () => {
    const seen = { warrior: new Set<string>(), mage: new Set<string>() };
    for (const archetype of ["warrior", "mage"] as const)
      for (let seed = 1; seed <= 400; seed++)
        for (const i of rollLoot(MOBS.ashen_warden!, { race: "human", archetype }, createRng(seed)).items)
          if (ITEMS[i.templateId]!.kind === "recipe") seen[archetype].add(i.templateId);
    expect([...seen.warrior].sort()).toEqual(["recipe_steelsworn_blade", "recipe_steelsworn_plate"]);
    expect([...seen.mage].sort()).toEqual(["recipe_steelsworn_staff", "recipe_steelsworn_vestments"]);
  });
});
