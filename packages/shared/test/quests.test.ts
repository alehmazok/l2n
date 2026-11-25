import { describe, expect, it } from "vitest";
import {
  ITEMS,
  MOBS,
  NODES,
  QUESTS,
  QUEST_LIST,
  RECIPES,
  advanceQuests,
  challengeAt,
  createRng,
  isQuestComplete,
  newEntry,
  objectiveProgress,
  questById,
  questItemsFor,
  questOnlyItems,
  questProblem,
  questRecipesFor,
  rollQuestDrops,
  xpToNext,
  type QuestLog,
} from "../src/index.js";

const bag = (templateId: string, quantity: number, location: "bag" | "warehouse" = "bag") => ({ templateId, quantity, location });
const active = (...ids: string[]): QuestLog => Object.fromEntries(ids.map((id) => [id, newEntry(QUESTS[id]!)]));

describe("quest data", () => {
  it("has ten quests in level order, the profession chain last", () => {
    expect(QUEST_LIST).toHaveLength(10);
    const levels = QUEST_LIST.map((q) => q.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(QUEST_LIST.at(-1)!.profession).toBe(true);
    expect(QUEST_LIST.at(-1)!.requires).toBe("unlit_path");
    expect(questById("nope")).toBeUndefined();
    expect(questById("toString")).toBeUndefined();
  });

  it("refers only to things that exist", () => {
    for (const q of QUEST_LIST) {
      expect(QUESTS[q.id]).toBe(q);
      if (q.requires) expect(QUESTS[q.requires], q.id).toBeDefined();
      for (const o of q.objectives) {
        if (o.kind === "kill") {
          for (const m of o.mobs ?? []) expect(MOBS[m], `${q.id} ${m}`).toBeDefined();
          if (o.node) expect(NODES[o.node]?.kind, q.id).toBe("hunt");
        }
        if (o.kind === "deliver") {
          expect(ITEMS[o.item], q.id).toBeDefined();
          if (o.drop?.node) expect(NODES[o.drop.node], q.id).toBeDefined();
        }
        if (o.kind === "visit") expect(NODES[o.node], q.id).toBeDefined();
        if (o.kind === "craft") for (const r of o.recipes) expect(RECIPES[r], q.id).toBeDefined();
      }
      for (const r of q.onAccept?.recipes ?? []) expect(RECIPES[r.recipe], q.id).toBeDefined();
      for (const i of [...(q.onAccept?.items ?? []), ...(q.reward.items ?? [])]) expect(ITEMS[i.item], q.id).toBeDefined();
    }
  });

  it("quest XP is about a third of the XP from level 1 to 20 (docs/design.md, Progression)", () => {
    let total = 0;
    for (let l = 1; l < 20; l++) total += xpToNext(l);
    const quests = QUEST_LIST.reduce((n, q) => n + q.reward.xp, 0);
    expect(quests / total).toBeGreaterThan(0.28);
    expect(quests / total).toBeLessThan(0.38);
  });

  it("no quest pays more XP than two levels' worth at its level", () => {
    for (const q of QUEST_LIST) expect(q.reward.xp, q.id).toBeLessThanOrEqual(2 * xpToNext(q.level === 20 ? 19 : q.level));
  });
});

describe("taking quests", () => {
  it("needs the level, the quest before it, and not to have it already", () => {
    const q = QUESTS.wardens_crypt!;
    expect(questProblem(QUESTS.mud_and_rats!, { level: 1, quests: {} })).toBeNull();
    expect(questProblem(QUESTS.burrow_queen!, { level: 6, quests: {} })).toMatch(/needs level 7/);
    expect(questProblem(q, { level: 20, quests: {} })).toMatch(/Finish The Unlit Path first/);
    expect(questProblem(q, { level: 20, quests: active("unlit_path") })).toMatch(/Finish/);
    expect(questProblem(q, { level: 20, quests: { unlit_path: { status: "done", progress: [] } } })).toBeNull();
    expect(questProblem(q, { level: 20, quests: { ...active("wardens_crypt") } })).toMatch(/already on/);
    expect(questProblem(q, { level: 20, quests: { wardens_crypt: { status: "done", progress: [] } } })).toMatch(/already done/);
  });

  it("hands out items and recipes for the right archetype", () => {
    const q = QUESTS.sharpened_edges!;
    expect(questRecipesFor(q, "warrior")).toEqual(["whetstones_1"]);
    expect(questRecipesFor(q, "mage")).toEqual(["ember_vials_1"]);
    expect(questRecipesFor(QUESTS.unlit_path!, "mage")).toEqual(["lantern_ward_charm"]);
    expect(questRecipesFor(QUESTS.mud_and_rats!, "mage")).toEqual([]);
    expect(questItemsFor(q.onAccept!.items, "warrior").map((i) => [i.templateId, i.quantity])).toEqual([
      ["iron_scrap", 2],
      ["resin_lump", 1],
    ]);
    expect(questItemsFor(QUESTS.millers_debt!.reward.items, "warrior")).toHaveLength(1);
    expect(questItemsFor(QUESTS.millers_debt!.reward.items, "mage")).toHaveLength(2);
    expect(questItemsFor(undefined, "mage")).toEqual([]);
  });

  it("a starter quest's gifts are exactly what its first craft needs", () => {
    const q = QUESTS.sharpened_edges!;
    for (const archetype of ["warrior", "mage"] as const) {
      const recipe = RECIPES[questRecipesFor(q, archetype)[0]!]!;
      const given = questItemsFor(q.onAccept!.items, archetype);
      expect(given.map((i) => ({ item: i.templateId, quantity: i.quantity }))).toEqual(recipe.inputs);
    }
  });

  it("only quest-only drops are given up when abandoning", () => {
    expect(questOnlyItems(QUESTS.millers_debt!)).toEqual(["millers_ledger"]);
    expect(questOnlyItems(QUESTS.unlit_path!)).toEqual(["dimmed_relic"]);
    expect(questOnlyItems(QUESTS.webbed_roads!)).toEqual([]); // silk is a resource
    expect(questOnlyItems(QUESTS.wardens_crypt!)).toEqual([]); // the charm is crafted, keep it
  });
});

describe("quest progress", () => {
  it("counts kills on the right node or of the right mob, up to the target", () => {
    let log = active("mud_and_rats", "bandit_toll");
    for (let i = 0; i < 7; i++) log = advanceQuests(log, { type: "kill", mobId: "mire_rat", nodeId: "mossgate_old_road" }).log;
    expect(log.mud_and_rats!.progress).toEqual([5]);
    const r = advanceQuests(log, { type: "kill", mobId: "brigand_captain", nodeId: "thornwood_hermits_rise" });
    expect(r.changed).toEqual(["bandit_toll"]);
    expect(r.log.bandit_toll!.progress).toEqual([1, 0]);
    expect(advanceQuests(r.log, { type: "kill", mobId: "mire_rat", nodeId: "mossgate_drowned_mill" }).changed).toEqual([]);
  });

  it("does not touch the log it was given or quests already done", () => {
    const log: QuestLog = { ...active("mud_and_rats"), burrow_queen: { status: "done", progress: [1] }, gone: { status: "active", progress: [] } };
    const r = advanceQuests(log, { type: "kill", mobId: "mire_rat", nodeId: "mossgate_old_road" });
    expect(log.mud_and_rats!.progress).toEqual([0]);
    expect(r.log.burrow_queen).toEqual({ status: "done", progress: [1] });
    expect(r.log.gone).toEqual({ status: "active", progress: [] });
  });

  it("a fight chain starts over after a loss", () => {
    let log = active("hermits_lamp", "mud_and_rats");
    for (let i = 0; i < 3; i++) log = advanceQuests(log, { type: "kill", mobId: "crag_lynx", nodeId: "thornwood_hermits_rise" }).log;
    log = advanceQuests(log, { type: "kill", mobId: "mire_rat", nodeId: "mossgate_old_road" }).log;
    const r = advanceQuests(log, { type: "loss" });
    expect(r.log.hermits_lamp!.progress).toEqual([0]);
    expect(r.log.mud_and_rats!.progress).toEqual([1]);
    expect(r.changed).toEqual(["hermits_lamp"]);
  });

  it("counts visits, crafts and deposits", () => {
    let log = active("ash_in_the_wind", "sharpened_edges", "millers_debt");
    log = advanceQuests(log, { type: "visit", nodeId: "cinder_bone_gallery" }).log;
    log = advanceQuests(log, { type: "visit", nodeId: "cinder_bone_gallery" }).log;
    expect(log.ash_in_the_wind!.progress).toEqual([0, 1, 0, 0]);
    log = advanceQuests(log, { type: "craft", recipeId: "healing_draughts" }).log;
    expect(log.sharpened_edges!.progress).toEqual([0]);
    log = advanceQuests(log, { type: "craft", recipeId: "ember_vials_1" }).log;
    expect(log.sharpened_edges!.progress).toEqual([1]);
    log = advanceQuests(log, { type: "deposit" }).log;
    log = advanceQuests(log, { type: "deposit" }).log;
    expect(log.millers_debt!.progress).toEqual([0, 1]);
  });

  it("deliveries count what is in the bag, not the warehouse", () => {
    const q = QUESTS.webbed_roads!;
    const e = { status: "active" as const, progress: [6, 0] };
    expect(objectiveProgress(q, e, [bag("spider_silk", 3), bag("spider_silk", 9, "warehouse")])).toEqual([
      { have: 6, need: 6 },
      { have: 3, need: 5 },
    ]);
    expect(isQuestComplete(q, e, [bag("spider_silk", 3)])).toBe(false);
    expect(isQuestComplete(q, e, [bag("spider_silk", 12)])).toBe(true);
    expect(objectiveProgress(q, e, [bag("spider_silk", 12)])[1]).toEqual({ have: 5, need: 5 });
    expect(isQuestComplete(q, { status: "done", progress: [6, 0] }, [bag("spider_silk", 12)])).toBe(false);
  });
});

describe("quest drops", () => {
  const mob = MOBS.mill_toad!;
  const sure = { next: () => 0, state: () => 0 };

  it("drop only while the quest needs them, where they are found", () => {
    const log = active("millers_debt");
    expect(rollQuestDrops(log, [], mob, "mossgate_drowned_mill", sure)).toMatchObject([{ templateId: "millers_ledger", quantity: 1 }]);
    expect(rollQuestDrops(log, [bag("millers_ledger", 1)], mob, "mossgate_drowned_mill", sure)).toEqual([]);
    expect(rollQuestDrops(log, [], mob, "mossgate_old_road", sure)).toEqual([]);
    expect(rollQuestDrops({}, [], mob, "mossgate_drowned_mill", sure)).toEqual([]);
    expect(rollQuestDrops(log, [], mob, "mossgate_drowned_mill", { next: () => 0.99, state: () => 0 })).toEqual([]);
  });

  it("relics drop anywhere in the Cinder Barrows", () => {
    const log = active("unlit_path");
    for (const node of ["cinder_ash_gate", "cinder_bone_gallery", "cinder_wardens_crypt"])
      expect(rollQuestDrops(log, [], MOBS.restless_bones!, node, sure)).toHaveLength(1);
    expect(rollQuestDrops(log, [], MOBS.toll_brigand!, "thornwood_hermits_rise", sure)).toEqual([]);
  });

  it("about one kill in four drops a relic", () => {
    const rng = createRng(9);
    let n = 0;
    for (let i = 0; i < 4000; i++) n += rollQuestDrops(active("unlit_path"), [], MOBS.restless_bones!, "cinder_ash_gate", rng).length;
    expect(n / 4000).toBeCloseTo(0.25, 1);
  });
});

describe("challenges", () => {
  it("the Burrow Queen can be challenged only while her quest is active; bosses always", () => {
    const burrows = NODES.mossgate_burrows!;
    expect(challengeAt(burrows, {})).toBeUndefined();
    expect(challengeAt(burrows, active("burrow_queen"))?.id).toBe("burrow_queen");
    expect(challengeAt(burrows, { burrow_queen: { status: "done", progress: [1] } })).toBeUndefined();
    expect(challengeAt(NODES.cinder_wardens_crypt!, {})?.id).toBe("ashen_warden");
    expect(challengeAt(NODES.mossgate_old_road!, active("burrow_queen"))).toBeUndefined();
  });
});
