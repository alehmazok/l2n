/**
 * Quest rules: who can take a quest, how progress moves, when a quest is
 * complete and what it hands out. Source: docs/design.md, section "Quests".
 * Pure functions; the server stores the quest log on the character.
 */
import { MOBS, NODES, type MapNode, type MobTemplate } from "./data/world.js";
import { itemTemplate } from "./data/items.js";
import { QUEST_LIST, type Quest, type QuestItem, type QuestObjective } from "./data/quests.js";
import { bagCount } from "./crafting.js";
import type { Item, NewItem } from "./items.js";
import { roll, type Rng } from "./rng.js";
import type { ArchetypeId } from "./types.js";

/**
 * A quest taken by a character. `progress` has one counter per objective;
 * deliver objectives keep 0 there and count the bag instead.
 */
export interface QuestEntry {
  status: "active" | "done";
  progress: number[];
}
export type QuestLog = Record<string, QuestEntry>;

/** Something that happened to a character that a quest may count. */
export type QuestEvent =
  | { type: "kill"; mobId: string; nodeId: string }
  | { type: "loss" }
  | { type: "visit"; nodeId: string }
  | { type: "craft"; recipeId: string }
  | { type: "deposit" };

type Bag = Pick<Item, "templateId" | "quantity" | "location">[];

const entryOf = (log: QuestLog, id: string) => (Object.hasOwn(log, id) ? log[id] : undefined);

/** Why a character cannot take a quest right now, or null if they can. */
export function questProblem(q: Quest, c: { level: number; quests: QuestLog }): string | null {
  const e = entryOf(c.quests, q.id);
  if (e?.status === "active") return `You are already on ${q.name}.`;
  if (e?.status === "done") return `You have already done ${q.name}.`;
  if (c.level < q.level) return `${q.name} needs level ${q.level}.`;
  if (q.requires && entryOf(c.quests, q.requires)?.status !== "done") {
    const before = QUEST_LIST.find((x) => x.id === q.requires);
    return `Finish ${before?.name ?? q.requires} first.`;
  }
  return null;
}

/** A fresh log entry for a quest just taken. */
export const newEntry = (q: Quest): QuestEntry => ({ status: "active", progress: q.objectives.map(() => 0) });

const target = (o: QuestObjective) => (o.kind === "visit" ? 1 : o.count);

/** Progress on each objective: counters, or what the bag holds for deliveries, capped at the target. */
export function objectiveProgress(q: Quest, e: QuestEntry, items: Bag): { have: number; need: number }[] {
  return q.objectives.map((o, i) => {
    const need = target(o);
    const have = o.kind === "deliver" ? bagCount(items, o.item) : (e.progress[i] ?? 0);
    return { have: Math.min(have, need), need };
  });
}

export const isQuestComplete = (q: Quest, e: QuestEntry, items: Bag) =>
  e.status === "active" && objectiveProgress(q, e, items).every((p) => p.have >= p.need);

const killCounts = (o: Extract<QuestObjective, { kind: "kill" }>, mobId: string, nodeId: string) =>
  (!o.mobs || o.mobs.includes(mobId)) && (!o.node || o.node === nodeId);

/**
 * Apply an event to every active quest. Returns the new log and the ids of
 * the quests that changed; the log passed in is not modified.
 */
export function advanceQuests(log: QuestLog, event: QuestEvent): { log: QuestLog; changed: string[] } {
  const next: QuestLog = {};
  const changed: string[] = [];
  for (const [id, e] of Object.entries(log)) {
    const q = QUEST_LIST.find((x) => x.id === id);
    if (!q || e.status !== "active") {
      next[id] = e;
      continue;
    }
    const progress = q.objectives.map((o, i) => {
      const cur = e.progress[i] ?? 0;
      switch (o.kind) {
        case "kill":
          if (event.type === "loss") return o.resetOnLoss ? 0 : cur;
          return event.type === "kill" && killCounts(o, event.mobId, event.nodeId) ? Math.min(o.count, cur + 1) : cur;
        case "craft":
          return event.type === "craft" && o.recipes.includes(event.recipeId) ? Math.min(o.count, cur + 1) : cur;
        case "visit":
          return event.type === "visit" && event.nodeId === o.node ? 1 : cur;
        case "deposit":
          return event.type === "deposit" ? Math.min(o.count, cur + 1) : cur;
        case "deliver":
          return cur;
      }
    });
    if (progress.some((p, i) => p !== (e.progress[i] ?? 0))) changed.push(id);
    next[id] = { status: e.status, progress };
  }
  return { log: next, changed };
}

const dropsHere = (d: NonNullable<Extract<QuestObjective, { kind: "deliver" }>["drop"]>, mob: MobTemplate, nodeId: string) =>
  (d.mobs ? d.mobs.includes(mob.id) : true) && (d.node ? d.node === nodeId : true) && (d.zone ? NODES[nodeId]?.zone === d.zone : true);

/**
 * Quest items a kill drops: one roll for each active delivery the bag does
 * not hold enough for yet. Rolled after the normal loot, from the same RNG.
 */
export function rollQuestDrops(log: QuestLog, items: Bag, mob: MobTemplate, nodeId: string, rng: Rng): NewItem[] {
  const out: NewItem[] = [];
  for (const q of QUEST_LIST) {
    if (entryOf(log, q.id)?.status !== "active") continue;
    for (const o of q.objectives) {
      if (o.kind !== "deliver" || !o.drop || !dropsHere(o.drop, mob, nodeId)) continue;
      if (bagCount(items, o.item) + out.filter((i) => i.templateId === o.item).length >= o.count) continue;
      if (roll(rng, o.drop.chance)) out.push({ templateId: o.item, itemLevel: null, rarity: null, bonus: null, quantity: 1, location: "bag" });
    }
  }
  return out;
}

/** The items of a list meant for this archetype, as new bag stacks. */
export function questItemsFor(list: QuestItem[] | undefined, archetype: ArchetypeId): NewItem[] {
  return (list ?? [])
    .filter((i) => !i.archetype || i.archetype === archetype)
    .map((i) => ({ templateId: i.item, itemLevel: null, rarity: null, bonus: null, quantity: i.quantity, location: "bag" }));
}

/** Recipes a quest teaches this archetype when taken. */
export const questRecipesFor = (q: Quest, archetype: ArchetypeId) =>
  (q.onAccept?.recipes ?? []).filter((r) => !r.archetype || r.archetype === archetype).map((r) => r.recipe);

/** Quest items that drop only for this quest: given up when it is abandoned. */
export const questOnlyItems = (q: Quest) =>
  q.objectives.flatMap((o) => (o.kind === "deliver" && o.drop && itemTemplate(o.item)?.kind === "quest" ? [o.item] : []));

/** Who can be challenged at a node: its boss, or a quest foe while that quest is active. */
export function challengeAt(node: MapNode, log: QuestLog): MobTemplate | undefined {
  if (node.boss) return MOBS[node.boss];
  if (node.questFoe && entryOf(log, node.questFoe.quest)?.status === "active") return MOBS[node.questFoe.mob];
  return undefined;
}
