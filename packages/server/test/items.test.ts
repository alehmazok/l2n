import { BAG_SLOTS, WAREHOUSE_FEE, characterMaxHp, itemValue, sellPrice, starterItems } from "@l2n/shared";
import { describe, expect, it } from "vitest";
import { fightToEnd, fixedRandom, gear, setup, stack } from "./helpers.js";

type ItemJson = { id: number; templateId: string; quantity: number; location: string; itemLevel: number | null };
const find = (items: ItemJson[], templateId: string, location = "bag") =>
  items.find((i) => i.templateId === templateId && i.location === location);

/** Fill the bag with distinct junk until it holds BAG_SLOTS rows. */
async function fillBag(t: Awaited<ReturnType<typeof setup>>) {
  const have = (await t.items()).filter((i) => i.location === "bag").length;
  const junk = Array.from({ length: BAG_SLOTS - have }, (_, k) => gear("ironbound_warrior_boots", 1 + (k % 9)));
  await t.give(...junk);
}

describe("starting kit and sheet", () => {
  it("new characters wear an Ironbound set and carry draughts and charges", async () => {
    const { get } = await setup();
    const view = (await get()).json();
    expect(view.items).toHaveLength(starterItems("warrior").length);
    expect(view.items.filter((i: ItemJson) => i.location === "equipped")).toHaveLength(6);
    expect(view.sheet.gear).toMatchObject({ weaponPower: 5, weaponTier: 1 });
    expect(view.character.autoCharges).toBe(true);
  });
});

describe("equipment", () => {
  it("equips gear from the bag, swapping out the worn piece", async () => {
    const t = await setup();
    await t.give(gear("ironbound_warrior_weapon", 5), gear("ironbound_mage_weapon", 1));
    const [sword, staff] = (await t.items()).slice(-2);
    expect((await t.post("/equip", { itemId: sword!.id })).json()).toMatchObject({ error: "cannot_equip" });
    expect((await t.post("/equip", { itemId: staff!.id })).json().message).toMatch(/Only a mage/);
    expect((await t.post("/equip", { itemId: 99999 })).json().error).toBe("no_item");
    await t.force({ level: 5 });
    const before = (await t.get()).json().sheet.attack;
    const res = (await t.post("/equip", { itemId: sword!.id })).json();
    expect(res.sheet.attack).toBe(before + 4);
    const weapons = res.items.filter((i: ItemJson) => i.templateId === "ironbound_warrior_weapon");
    expect(weapons.map((i: ItemJson) => [i.itemLevel, i.location]).sort()).toEqual([
      [1, "bag"],
      [5, "equipped"],
    ]);
  });

  it("unequips into the bag if there is room", async () => {
    const t = await setup();
    const res = (await t.post("/unequip", { slot: "head" })).json();
    expect(find(res.items, "ironbound_warrior_head")).toBeDefined();
    expect((await t.post("/unequip", { slot: "head" })).json().error).toBe("nothing_there");
    expect((await t.post("/unequip", { slot: "tail" })).statusCode).toBe(400);
    await fillBag(t);
    expect((await t.post("/unequip", { slot: "chest" })).json().error).toBe("full");
  });

  it("a rare +HP piece raises max HP, and taking it off trims HP", async () => {
    const t = await setup();
    await t.give(gear("ironbound_warrior_head", 1, { rarity: "rare", bonus: "hp" }));
    const helm = (await t.items()).at(-1)!;
    const plain = characterMaxHp("orc", "warrior", 1);
    const boosted = characterMaxHp("orc", "warrior", 1, 0.03);
    expect((await t.post("/equip", { itemId: helm.id })).json().sheet.maxHp).toBe(boosted);
    expect((await t.post("/rest")).json().character.hp).toBe(boosted);
    const off = (await t.post("/unequip", { slot: "head" })).json();
    expect(off.character.hp).toBe(plain);
  });

  it("cannot change gear during a fight", async () => {
    const t = await setup();
    await t.post("/move", { to: "mossgate_old_road" });
    await t.post("/hunt");
    expect((await t.post("/unequip", { slot: "head" })).json().error).toBe("in_fight");
  });
});

describe("draughts outside fights", () => {
  it("heals 30% of max HP, not above full", async () => {
    const t = await setup();
    const draught = find((await t.get()).json().items, "healing_draught")!;
    expect((await t.post("/use", { itemId: draught.id })).json().error).toBe("already_full");
    await t.force({ hp: 10 });
    const res = (await t.post("/use", { itemId: draught.id })).json();
    expect(res.character.hp).toBe(10 + Math.round(characterMaxHp("orc", "warrior", 1) * 0.3));
    expect(find(res.items, "healing_draught")!.quantity).toBe(2);
  });

  it("mana draughts work for mages only; other items cannot be used", async () => {
    const w = await setup();
    await w.give(stack("mana_draught", 1));
    const items = (await w.get()).json().items;
    expect((await w.post("/use", { itemId: find(items, "mana_draught")!.id })).json().error).toBe("cannot_use");
    expect((await w.post("/use", { itemId: find(items, "whetstone_1")!.id })).json().error).toBe("cannot_use");

    const m = await setup({ race: "human", archetype: "mage" });
    const vial = find((await m.get()).json().items, "mana_draught")!;
    expect((await m.post("/use", { itemId: vial.id })).json().error).toBe("already_full");
    await m.force({ resource: 0 });
    expect((await m.post("/use", { itemId: vial.id })).json().character.resource).toBeGreaterThan(0);
  });
});

describe("market", () => {
  it("sells only at the Market and only for enough silver", async () => {
    const t = await setup();
    expect((await t.post("/buy", { stockId: "whetstone_1", quantity: 10 })).json().error).toBe("not_here");
    await t.post("/move", { to: "brackwell_market" });
    expect((await t.post("/buy", { stockId: "whetstone_1", quantity: 10 })).json().error).toBe("too_poor");
    expect((await t.post("/buy", { stockId: "moon_rock" })).json().error).toBe("not_sold");
    await t.force({ silver: 300 });
    const res = (await t.post("/buy", { stockId: "whetstone_1", quantity: 10 })).json();
    expect(res.character.silver).toBe(300 - 20);
    expect(find(res.items, "whetstone_1")!.quantity).toBe(60);
    expect((await t.post("/buy", { stockId: "ironbound_warrior_weapon@5", quantity: 2 })).json().error).toBe("one_at_a_time");
    const sword = (await t.post("/buy", { stockId: "ironbound_warrior_weapon@5" })).json();
    expect(sword.character.silver).toBe(280 - itemValue({ templateId: "ironbound_warrior_weapon", itemLevel: 5, rarity: "common" }));
    expect(sword.items.some((i: ItemJson) => i.itemLevel === 5 && i.location === "bag")).toBe(true);
  });

  it("refuses purchases that do not fit in the bag", async () => {
    const t = await setup();
    await t.force({ silver: 1000, location: "brackwell_market" });
    await fillBag(t);
    expect((await t.post("/buy", { stockId: "ironbound_mage_weapon@1" })).json().error).toBe("full");
    // A stack that is already in the bag still grows.
    expect((await t.post("/buy", { stockId: "healing_draught" })).statusCode).toBe(200);
  });

  it("buys items from the bag at 30% of their value", async () => {
    const t = await setup();
    await t.give(stack("rough_hide", 5));
    await t.force({ location: "brackwell_market" });
    const hide = find(await t.items(), "rough_hide")!;
    expect((await t.post("/sell", { itemId: hide.id, quantity: 6 })).json().error).toBe("not_enough");
    const some = (await t.post("/sell", { itemId: hide.id, quantity: 2 })).json();
    expect(some.character.silver).toBe(sellPrice({ templateId: "rough_hide", itemLevel: null, rarity: null }, 2));
    const rest = (await t.post("/sell", { itemId: hide.id })).json();
    expect(find(rest.items, "rough_hide")).toBeUndefined();
    expect(rest.character.silver).toBe(5);
    const worn = find(rest.items, "ironbound_warrior_weapon", "equipped")!;
    expect((await t.post("/sell", { itemId: worn.id })).json().error).toBe("no_item");
  });
});

describe("warehouse", () => {
  it("stores items for a fee and gives them back for free", async () => {
    const t = await setup();
    await t.give(stack("bone_shard", 6), gear("ironbound_warrior_gloves", 3));
    const bone = find(await t.items(), "bone_shard")!;
    expect((await t.post("/deposit", { itemId: bone.id })).json().error).toBe("not_here");
    await t.force({ location: "brackwell_warehouse" });
    expect((await t.post("/deposit", { itemId: bone.id })).json().error).toBe("too_poor");
    await t.force({ silver: 10 });
    expect((await t.post("/deposit", { itemId: bone.id, quantity: 7 })).json().error).toBe("not_enough");
    const part = (await t.post("/deposit", { itemId: bone.id, quantity: 4 })).json();
    expect(find(part.items, "bone_shard")!.quantity).toBe(2);
    expect(find(part.items, "bone_shard", "warehouse")!.quantity).toBe(4);
    const all = (await t.post("/deposit", { itemId: bone.id })).json();
    expect(find(all.items, "bone_shard")).toBeUndefined();
    expect(find(all.items, "bone_shard", "warehouse")!.quantity).toBe(6);
    expect(all.character.silver).toBe(10 - 2 * WAREHOUSE_FEE);

    const stored = find(all.items, "bone_shard", "warehouse")!;
    const back = (await t.post("/withdraw", { itemId: stored.id, quantity: 1 })).json();
    expect(find(back.items, "bone_shard")!.quantity).toBe(1);
    expect(back.character.silver).toBe(10 - 2 * WAREHOUSE_FEE);
    const gloves = (await t.items()).find((i) => i.itemLevel === 3)!;
    const moved = (await t.post("/deposit", { itemId: gloves.id })).json();
    expect(moved.items.find((i: ItemJson) => i.id === gloves.id).location).toBe("warehouse");
    expect((await t.post("/withdraw", { itemId: bone.id })).json().error).toBe("no_item");
  });
});

describe("loot and consumables in fights", () => {
  it("packs charges and draughts for the fight and hands back the rest", async () => {
    const t = await setup();
    await t.post("/move", { to: "mossgate_old_road" });
    const hunt = (await t.post("/hunt")).json();
    expect(hunt.fight.state.player).toMatchObject({ charges: 50, chargeItem: "whetstone_1", draughts: { healing_draught: 3 } });
    expect(find(hunt.items, "whetstone_1")).toBeUndefined();
    expect(find(hunt.items, "healing_draught")).toBeUndefined();
    const drink = (await t.post("/fight", { action: { type: "item", itemId: "healing_draught" } })).json();
    expect(drink.fight.state.player.draughts.healing_draught).toBe(2);
    expect((await t.post("/fight", { action: { type: "item" } })).json().error).toBe("invalid");
    expect((await t.post("/fight", { action: { type: "item", itemId: "mana_draught" } })).json().error).toBe("invalid_action");
    const end = await fightToEnd(t.post);
    const left = end.ended.state.player.charges as number;
    expect(left).toBeLessThan(50);
    expect(find(end.items, "whetstone_1")!.quantity).toBe(left);
    expect(find(end.items, "healing_draught")!.quantity).toBeGreaterThanOrEqual(2);
    expect(end.result.loot.silver).toBeGreaterThan(0);
    expect(end.character.silver).toBe(end.result.loot.silver);
    for (const i of end.result.loot.items) expect(end.items.some((x: ItemJson) => x.templateId === i.templateId)).toBe(true);
  });

  it("does not load charges when auto-use is off or they do not match the weapon", async () => {
    const t = await setup();
    expect((await t.post("/settings", { autoCharges: false })).json().character.autoCharges).toBe(false);
    await t.post("/move", { to: "mossgate_old_road" });
    expect((await t.post("/hunt")).json().fight.state.player.charges).toBe(0);
    await fightToEnd(t.post);
    await t.post("/settings", { autoCharges: true });
    await t.post("/unequip", { slot: "weapon" });
    await t.force({ hp: 999 });
    const bare = (await t.post("/hunt")).json();
    expect(bare.fight.state.player.charges).toBe(0);
    expect(find(bare.items, "whetstone_1")!.quantity).toBe(50);
  });

  it("loot that does not fit is lost; death keeps the unused belt", async () => {
    // r = 0 picks the Mire Rat, which always pays silver and often hide.
    const t = await setup({ random: fixedRandom(0, 0.25) });
    await fillBag(t);
    await t.force({ level: 6, hp: 999, location: "mossgate_old_road" });
    let lost = 0;
    for (let i = 0; i < 15 && lost === 0; i++) {
      await t.post("/hunt");
      const end = (await t.post("/fight", { action: { type: "auto" } })).json();
      expect(end.result.outcome).toBe("won");
      lost += end.result.loot.lost.length;
      expect(end.items.filter((x: ItemJson) => x.location === "bag").length).toBeLessThanOrEqual(BAG_SLOTS);
    }
    expect(lost).toBeGreaterThan(0);

    const d = await setup({ random: fixedRandom(0.99, 0.5) });
    await d.force({ hp: 1, location: "mossgate_burrows" });
    await d.post("/hunt");
    const end = await fightToEnd(d.post);
    expect(end.result.outcome).toBe("lost");
    expect(end.result.loot).toBeUndefined();
    expect(find(end.items, "healing_draught")!.quantity).toBe(3);
  });
});

describe("meta", () => {
  it("serves items, the shop and inventory limits", async () => {
    const t = await setup();
    const meta = (await t.app.inject({ method: "GET", url: "/api/meta" })).json();
    expect(meta.items.whetstone_1.kind).toBe("charge");
    expect(meta.shop.length).toBeGreaterThan(10);
    expect(meta.limits).toEqual({ bagSlots: BAG_SLOTS, warehouseSlots: 60, warehouseFee: WAREHOUSE_FEE });
  });
});
