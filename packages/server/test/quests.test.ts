import { QUESTS, characterMaxHp, killXp, xpToNext } from "@l2n/shared";
import { describe, expect, it } from "vitest";
import { fightToEnd, fixedRandom, setup, stack } from "./helpers.js";

type ItemJson = { id: number; templateId: string; quantity: number; location: string };
const qty = (items: ItemJson[], templateId: string, location = "bag") =>
  items.filter((i) => i.templateId === templateId && i.location === location).reduce((n, i) => n + i.quantity, 0);

/** A character standing at the notice board. */
async function atBoard(opts: Parameters<typeof setup>[0] = {}) {
  const t = await setup(opts);
  await t.post("/move", { to: "brackwell_notice_board" });
  const accept = (questId: string) => t.post("/quests/accept", { questId });
  const complete = (questId: string, profession?: string) => t.post("/quests/complete", { questId, ...(profession ? { profession } : {}) });
  return { ...t, accept, complete };
}

describe("the notice board", () => {
  it("takes quests only at the board, at the right level and once", async () => {
    const t = await setup();
    expect((await t.post("/quests/accept", { questId: "mud_and_rats" })).json().error).toBe("not_here");
    await t.post("/move", { to: "brackwell_notice_board" });
    expect((await t.post("/quests/accept", { questId: "nope" })).json().error).toBe("unknown_quest");
    expect((await t.post("/quests/accept", { questId: "burrow_queen" })).json().message).toMatch(/needs level 7/);
    const res = (await t.post("/quests/accept", { questId: "mud_and_rats" })).json();
    expect(res.quest).toMatchObject({ questId: "mud_and_rats", action: "accepted" });
    expect(res.character.quests).toEqual({ mud_and_rats: { status: "active", progress: [0] } });
    expect((await t.post("/quests/accept", { questId: "mud_and_rats" })).json().message).toMatch(/already on/);
    expect((await t.post("/quests/complete", { questId: "mud_and_rats" })).json().error).toBe("not_complete");
    expect((await t.post("/quests/complete", { questId: "burrow_queen" })).json().error).toBe("not_active");
  });

  it("counts kills, then pays XP, silver and items on turn-in", async () => {
    const t = await atBoard();
    await t.accept("mud_and_rats");
    await t.post("/move", { to: "brackwell_square" });
    await t.post("/move", { to: "mossgate_old_road" });
    let xp = 0;
    for (let i = 0; i < 5; i++) {
      await t.post("/hunt");
      const end = await fightToEnd(t.post);
      expect(end.result.outcome).toBe("won");
      expect(end.result.quests).toEqual(["mud_and_rats"]);
      xp += end.result.xpGained;
      if (end.character.hp < 30) await t.force({ hp: 80 });
    }
    // A sixth kill no longer counts.
    await t.post("/hunt");
    expect((await fightToEnd(t.post)).result.quests).toBeUndefined();
    const before = (await t.get()).json();
    expect(before.character.quests.mud_and_rats.progress).toEqual([5]);
    await t.post("/move", { to: "brackwell_square" });
    expect((await t.complete("mud_and_rats")).json().error).toBe("not_here");
    await t.post("/move", { to: "brackwell_notice_board" });
    const done = (await t.complete("mud_and_rats")).json();
    expect(done.quest).toMatchObject({ action: "completed", xp: 140, silver: 30 });
    expect(done.character.silver).toBe(before.character.silver + 30);
    expect(done.character.quests.mud_and_rats.status).toBe("done");
    expect(qty(done.items, "healing_draught")).toBe(qty(before.items, "healing_draught") + 3);
    // The orc had 140 XP of quest reward on top of the kills; a level-up refills HP.
    expect(done.character.level).toBe(xp + 140 >= xpToNext(1) ? 2 : 1);
    if (done.character.level === 2) expect(done.character.hp).toBe(characterMaxHp("orc", "warrior", 2));
    expect((await t.accept("mud_and_rats")).json().message).toMatch(/already done/);
    expect((await t.post("/quests/abandon", { questId: "mud_and_rats" })).json().error).toBe("not_active");
  });

  it("Humans get their XP bonus on quest rewards; a big reward can level up", async () => {
    const t = await atBoard({ race: "human" });
    await t.force({ level: 18, xp: xpToNext(18) - 100, recipes: [] });
    await t.accept("unlit_path");
    await t.force({ quests: { unlit_path: { status: "active", progress: [0, 1] } }, hp: 5 });
    await t.give(stack("dimmed_relic", 3));
    const done = (await t.complete("unlit_path")).json();
    expect(done.quest.xp).toBe(Math.round(3650 * 1.05));
    expect(done.quest.levelsGained).toBe(1);
    expect(done.character).toMatchObject({ level: 19, hp: characterMaxHp("human", "warrior", 19) });
    expect(qty(done.items, "dimmed_relic")).toBe(0);
  });

  it("drops quest items while a delivery needs them and takes them on turn-in", async () => {
    // random() = 0: first mob of the node, and loot rolls that always hit.
    const t = await atBoard({ random: fixedRandom(0) });
    await t.force({ level: 3 });
    await t.accept("millers_debt");
    await t.force({ location: "mossgate_drowned_mill", hp: 200 });
    let got = 0;
    for (let i = 0; i < 20 && got === 0; i++) {
      await t.post("/hunt");
      const end = await fightToEnd(t.post);
      got = qty(end.items, "millers_ledger");
      await t.force({ hp: 200 });
    }
    expect(got).toBe(1);
    // One ledger is enough: no second one drops.
    for (let i = 0; i < 5; i++) {
      await t.post("/hunt");
      await fightToEnd(t.post);
      await t.force({ hp: 200 });
    }
    expect(qty(await t.items(), "millers_ledger")).toBe(1);
    // The warehouse part.
    await t.force({ location: "brackwell_warehouse", silver: 10 });
    const draught = (await t.items()).find((i) => i.templateId === "healing_draught")!;
    const dep = (await t.post("/deposit", { itemId: draught.id, quantity: 1 })).json();
    expect(dep.character.quests.millers_debt.progress).toEqual([0, 1]);
    await t.force({ location: "brackwell_notice_board" });
    const done = (await t.complete("millers_debt")).json();
    expect(done.quest.action).toBe("completed");
    expect(qty(done.items, "millers_ledger")).toBe(0);
  });

  it("teaches a recipe and gives the stuff for it; the craft counts", async () => {
    const t = await atBoard({ archetype: "mage", race: "dwarf" });
    await t.force({ level: 5, silver: 100 });
    const res = (await t.accept("sharpened_edges")).json();
    expect(res.character.recipes).toEqual(["ember_vials_1"]);
    expect([qty(res.items, "resin_lump"), qty(res.items, "marsh_herb")]).toEqual([2, 1]);
    await t.post("/move", { to: "brackwell_square" });
    await t.post("/move", { to: "brackwell_smithy" });
    // Try until the craft succeeds (90% each, and the quest gave one batch).
    let crafted = (await t.post("/craft", { recipeId: "ember_vials_1" })).json();
    while (!crafted.craft?.success) {
      await t.give(stack("resin_lump", 2), stack("marsh_herb", 1));
      crafted = (await t.post("/craft", { recipeId: "ember_vials_1" })).json();
    }
    expect(crafted.character.quests.sharpened_edges.progress).toEqual([1]);
  });

  it("refuses to hand out more than the bag can take, and keeps nothing", async () => {
    const t = await atBoard();
    await t.force({ level: 5 });
    const filler = Array.from({ length: 40 - (await t.items()).filter((i) => i.location === "bag").length }, (_, i) => ({
      templateId: "ironbound_warrior_head",
      itemLevel: 1 + (i % 9),
      rarity: "common" as const,
      bonus: null,
      quantity: 1,
      location: "bag" as const,
    }));
    await t.give(...filler);
    const res = (await t.accept("sharpened_edges")).json();
    expect(res.error).toBe("full");
    expect((await t.get()).json().character).toMatchObject({ quests: {}, recipes: [] });
  });

  it("abandoning drops progress and the quest's own drops", async () => {
    const t = await atBoard();
    await t.force({ level: 18 });
    const res = (await t.accept("unlit_path")).json();
    expect(res.character.recipes).toEqual(["lantern_ward_charm"]);
    await t.give(stack("dimmed_relic", 2), stack("lantern_ward_charm", 1));
    const gone = (await t.post("/quests/abandon", { questId: "unlit_path" })).json();
    expect(gone.quest.action).toBe("abandoned");
    expect(gone.character.quests).toEqual({});
    expect(qty(gone.items, "dimmed_relic")).toBe(0);
    expect(qty(gone.items, "lantern_ward_charm")).toBe(1);
    expect(gone.character.recipes).toEqual(["lantern_ward_charm"]);
    // Taking it again does not learn the recipe twice.
    expect((await t.accept("unlit_path")).json().character.recipes).toEqual(["lantern_ward_charm"]);
  });

  it("the hermit's fight chain starts over after a death", async () => {
    const t = await atBoard({ random: fixedRandom(0.99, 0.5) });
    await t.force({ level: 12 });
    await t.accept("hermits_lamp");
    await t.force({ quests: { hermits_lamp: { status: "active", progress: [4] } }, location: "thornwood_hermits_rise", hp: 1 });
    await t.post("/hunt");
    const end = await fightToEnd(t.post);
    expect(end.result.outcome).toBe("lost");
    expect(end.result.quests).toEqual(["hermits_lamp"]);
    expect(end.character.quests.hermits_lamp.progress).toEqual([0]);
  });

  it("counts places visited", async () => {
    const t = await atBoard();
    await t.force({ level: 16 });
    await t.accept("ash_in_the_wind");
    await t.force({ location: "thornwood_hermits_rise" });
    const moved = (await t.post("/move", { to: "cinder_ash_gate" })).json();
    expect(moved.character.quests.ash_in_the_wind.progress).toEqual([1, 0, 0, 0]);
  });
});

describe("the Burrow Queen", () => {
  it("can be challenged in the Burrows only while her quest is active", async () => {
    const t = await atBoard();
    await t.force({ level: 7, location: "mossgate_burrows" });
    expect((await t.post("/challenge")).json().error).toBe("no_boss");
    await t.force({ location: "brackwell_notice_board" });
    await t.accept("burrow_queen");
    await t.force({ location: "mossgate_burrows", level: 20, hp: 2000 });
    const fight = (await t.post("/challenge")).json().fight;
    expect(fight.mobId).toBe("burrow_queen");
    const end = (await t.post("/fight", { action: { type: "auto" } })).json();
    expect(end.result).toMatchObject({ outcome: "won", xpGained: killXp("orc", 7, 20), quests: ["burrow_queen"] });
  });
});

describe("the profession change", () => {
  async function readyForWarden(archetype: "warrior" | "mage" = "warrior") {
    const t = await atBoard({ archetype });
    await t.force({ level: 20, silver: 0, quests: { unlit_path: { status: "done", progress: [0, 1] } } });
    await t.accept("wardens_crypt");
    return t;
  }

  it("needs part 1 first", async () => {
    const t = await atBoard();
    await t.force({ level: 20 });
    expect((await t.accept("wardens_crypt")).json().message).toMatch(/Finish The Unlit Path first/);
  });

  it("needs the Warden dead, the charm and a profession of your archetype", async () => {
    const t = await readyForWarden();
    expect((await t.complete("wardens_crypt", "vanguard")).json().error).toBe("not_complete");
    await t.force({ quests: { unlit_path: { status: "done", progress: [0, 1] }, wardens_crypt: { status: "active", progress: [1, 0] } }, hp: 10 });
    expect((await t.complete("wardens_crypt", "vanguard")).json().error).toBe("not_complete");
    await t.give(stack("lantern_ward_charm", 1));
    expect((await t.complete("wardens_crypt")).json().error).toBe("choose_profession");
    expect((await t.complete("wardens_crypt", "stormcaller")).json().message).toMatch(/Vanguard or Reaver/);
    const done = (await t.complete("wardens_crypt", "vanguard")).json();
    expect(done.quest).toMatchObject({ action: "completed", profession: "vanguard", silver: QUESTS.wardens_crypt!.reward.silver, xp: 0 });
    expect(done.character).toMatchObject({ profession: "vanguard", hp: characterMaxHp("orc", "warrior", 20, 0, "vanguard") });
    expect(done.sheet.professionPassive.name).toBe("Bulwark");
    expect(done.sheet.skills.learned.map((s: { id: string }) => s.id)).toContain("shield_wall");
    expect(qty(done.items, "lantern_ward_charm")).toBe(0);
  });

  it("profession skills are usable in fights, and the Vanguard's HP counts when resting", async () => {
    const t = await readyForWarden();
    await t.force({ profession: "vanguard", location: "mossgate_old_road", hp: 10 });
    await t.post("/hunt");
    const f = (await t.get()).json().fight;
    expect(f.state.player.skills).toContain("bulwark_strike");
    await t.post("/fight", { action: { type: "auto" } });
    await t.force({ location: "brackwell_square" });
    expect((await t.post("/rest")).json().character.hp).toBe(characterMaxHp("orc", "warrior", 20, 0, "vanguard"));
  });
});
