import { BAG_SLOTS, RECIPES, createRng } from "@l2n/shared";
import { describe, expect, it } from "vitest";
import { fightToEnd, fixedRandom, gear, setup, stack } from "./helpers.js";

type ItemJson = { id: number; templateId: string; quantity: number; location: string; itemLevel: number | null; rarity: string | null };
const qty = (items: ItemJson[], templateId: string) =>
  items.filter((i) => i.templateId === templateId && i.location === "bag").reduce((n, i) => n + i.quantity, 0);

/**
 * A value for the app's random() whose crafting roll (the first draw of the
 * RNG seeded from it) satisfies `want`.
 */
const craftRoll = (want: (roll: number) => boolean) => {
  for (let k = 0; k < 100_000; k++) if (want(createRng(Math.floor((k / 100_000) * 2 ** 32)).next())) return k / 100_000;
  throw new Error("no such roll");
};

/** A character standing in the smithy with silver and the given recipes learned. */
async function atSmithy(opts: Parameters<typeof setup>[0] = {}, recipes: string[] = []) {
  const t = await setup(opts);
  await t.post("/move", { to: "brackwell_smithy" });
  await t.force({ silver: 1000, recipes });
  return t;
}

describe("recipes", () => {
  it("are bought at the smithy, not the market, and learned from the bag", async () => {
    const t = await setup();
    await t.force({ silver: 100 });
    expect((await t.post("/buy", { stockId: "recipe_whetstones_1" })).json().error).toBe("not_here");
    await t.post("/move", { to: "brackwell_smithy" });
    expect((await t.post("/buy", { stockId: "healing_draught" })).json().error).toBe("not_here");
    expect((await t.post("/buy", { stockId: "recipe_steelsworn_blade" })).json().error).toBe("not_sold");
    const bought = (await t.post("/buy", { stockId: "recipe_whetstones_1" })).json();
    expect(bought.character.silver).toBe(100 - RECIPES.whetstones_1!.price!);
    const recipe = bought.items.find((i: ItemJson) => i.templateId === "recipe_whetstones_1");
    const learned = (await t.post("/use", { itemId: recipe.id })).json();
    expect(learned.character.recipes).toEqual(["whetstones_1"]);
    expect(qty(learned.items, "recipe_whetstones_1")).toBe(0);
    await t.give(stack("recipe_whetstones_1", 1));
    const again = (await t.items()).at(-1)!;
    expect((await t.post("/use", { itemId: again.id })).json().error).toBe("already_known");
  });
});

describe("crafting", () => {
  it("only works in the smithy, with a known recipe, the resources and the fee", async () => {
    const t = await setup();
    await t.force({ silver: 100, recipes: ["whetstones_1"] });
    expect((await t.post("/craft", { recipeId: "whetstones_1" })).json().error).toBe("not_here");
    await t.post("/move", { to: "brackwell_smithy" });
    expect((await t.post("/craft", { recipeId: "nope" })).json().error).toBe("unknown_recipe");
    expect((await t.post("/craft", { recipeId: "ember_vials_1" })).json().message).toMatch(/do not know/);
    expect((await t.post("/craft", { recipeId: "whetstones_1" })).json().message).toMatch(/You need 2 Iron Scrap, 1 Resin Lump more/);
    await t.give(stack("iron_scrap", 2), stack("resin_lump", 1));
    await t.force({ silver: 5 });
    expect((await t.post("/craft", { recipeId: "whetstones_1" })).json().message).toMatch(/20 silver/);
  });

  it("a success takes the fee and the inputs and adds the output to its stack", async () => {
    const t = await atSmithy({ random: fixedRandom(craftRoll((r) => r < 0.5)) }, ["whetstones_1"]);
    await t.give(stack("iron_scrap", 3), stack("resin_lump", 1));
    const res = (await t.post("/craft", { recipeId: "whetstones_1" })).json();
    expect(res.craft).toMatchObject({ recipeId: "whetstones_1", success: true, fee: 20 });
    expect(res.character.silver).toBe(980);
    expect(qty(res.items, "iron_scrap")).toBe(1);
    expect(qty(res.items, "resin_lump")).toBe(0);
    expect(qty(res.items, "whetstone_1")).toBe(50 + 25);
  });

  it("a failure takes the fee and half of each input", async () => {
    const t = await atSmithy({ random: fixedRandom(craftRoll((r) => r > 0.99)) }, ["ironbound_mail"]);
    await t.give(stack("iron_scrap", 8), stack("rough_hide", 6), stack("bone_shard", 2));
    const res = (await t.post("/craft", { recipeId: "ironbound_mail" })).json();
    expect(res.craft.success).toBe(false);
    expect(res.craft.made).toEqual([]);
    expect(res.character.silver).toBe(1000 - 120);
    expect([qty(res.items, "iron_scrap"), qty(res.items, "rough_hide"), qty(res.items, "bone_shard")]).toEqual([4, 3, 1]);
    expect(res.character.recipes).toEqual(["ironbound_mail"]);
  });

  it("set recipes make five pieces at the crafted item level, and need the bag room", async () => {
    const t = await atSmithy({ random: fixedRandom(craftRoll((r) => r < 0.5)) }, ["ironbound_mail"]);
    await t.give(stack("iron_scrap", 9), stack("rough_hide", 6), stack("bone_shard", 2));
    const have = (await t.items()).filter((i) => i.location === "bag").length;
    // Leave 2 free. Used-up rough_hide and bone_shard stacks free 2 more: one short of the 5 needed.
    await t.give(...Array.from({ length: BAG_SLOTS - have - 2 }, (_, k) => gear("ironbound_warrior_boots", 1 + (k % 9))));
    expect((await t.post("/craft", { recipeId: "ironbound_mail" })).json().error).toBe("full");
    const junk = (await t.items()).filter((i) => i.templateId === "ironbound_warrior_boots" && i.location === "bag");
    await t.post("/move", { to: "brackwell_square" });
    await t.post("/move", { to: "brackwell_market" });
    await t.post("/sell", { itemId: junk[0]!.id });
    await t.post("/move", { to: "brackwell_square" });
    await t.post("/move", { to: "brackwell_smithy" });
    const res = (await t.post("/craft", { recipeId: "ironbound_mail" })).json();
    expect(res.error).toBeUndefined();
    expect(res.craft.success).toBe(true);
    const made = res.craft.made as ItemJson[];
    expect(made.map((i) => i.templateId)).toEqual(RECIPES.ironbound_mail!.makes.map((m) => m.item));
    expect(made.every((i) => i.itemLevel === 8 && i.rarity !== null)).toBe(true);
    expect(res.items.filter((i: ItemJson) => i.location === "bag")).toHaveLength(BAG_SLOTS);
  });

  it("Forge-born dwarves succeed where others just fail", async () => {
    // Steelsworn blade: 55% for most, 60% for dwarves. A roll of 0.57 splits them.
    for (const [race, ok] of [["human", false], ["dwarf", true]] as const) {
      const t = await atSmithy({ race, random: fixedRandom(craftRoll((r) => r > 0.56 && r < 0.59)) }, ["steelsworn_blade"]);
      await t.give(stack("grave_iron", 6), stack("heartwood", 3), stack("thick_pelt", 2));
      expect((await t.post("/craft", { recipeId: "steelsworn_blade" })).json().craft.success, race).toBe(ok);
    }
  });

  it("not during a fight", async () => {
    const t = await atSmithy({}, ["whetstones_1"]);
    await t.post("/move", { to: "brackwell_square" });
    await t.post("/move", { to: "mossgate_old_road" });
    await t.post("/hunt");
    expect((await t.post("/craft", { recipeId: "whetstones_1" })).json().error).toBe("in_fight");
  });
});

describe("quest items", () => {
  it("cannot be sold", async () => {
    const t = await setup();
    await t.give(stack("lantern_ward_charm", 1));
    await t.post("/move", { to: "brackwell_market" });
    const charm = (await t.items()).at(-1)!;
    expect((await t.post("/sell", { itemId: charm.id })).json().error).toBe("cannot_sell");
  });
});

describe("the Ashen Warden", () => {
  it("is challenged only in the Warden's Crypt, and drops loot and maybe a recipe", async () => {
    const t = await setup({ random: fixedRandom(0, 0.5) });
    expect((await t.post("/challenge")).json().error).toBe("no_boss");
    await t.force({ level: 20, location: "cinder_wardens_crypt", hp: 99999 });
    const res = (await t.post("/challenge")).json();
    expect(res.fight.mobId).toBe("ashen_warden");
    expect(res.fight.state.enemy).toMatchObject({ name: "Ashen Warden", level: 20 });
    expect(res.fight.canAuto).toBe(false);
    expect((await t.post("/challenge")).json().error).toBe("in_fight");
  });

  it("a win pays boss silver and always drops equipment", async () => {
    const t = await setup({ random: fixedRandom(0, 0.5) });
    await t.force({ level: 20, location: "cinder_wardens_crypt" });
    await t.post("/challenge");
    // Make the fight short: drop the Warden to 1 HP in storage.
    await t.store.withCharacter(1, t.id, async (tx) => {
      const s = tx.fight!.state;
      await tx.saveFight({ ...s, enemy: { ...s.enemy, hp: 1 } });
    });
    const end = await fightToEnd(t.post);
    expect(end.result.outcome).toBe("won");
    expect(end.result.loot.silver).toBeGreaterThanOrEqual(Math.round(24 * 15 * 0.8));
    expect(end.result.loot.items.some((i: ItemJson) => i.itemLevel === 20)).toBe(true);
  });
});

describe("meta", () => {
  it("lists recipes and the smithy's stock", async () => {
    const t = await setup();
    const meta = (await t.app.inject({ method: "GET", url: "/api/meta" })).json();
    expect(Object.keys(meta.recipes)).toHaveLength(15);
    expect(meta.smithy).toHaveLength(10);
    expect(meta.nodes.cinder_wardens_crypt.boss).toBe("ashen_warden");
  });
});
