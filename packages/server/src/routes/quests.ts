/**
 * The Brackwell notice board: taking, abandoning and turning in quests, and
 * the profession change at the end of the profession chain. Progress is
 * counted by the actions themselves through `questEvent`.
 */
import {
  ARCHETYPES,
  NODES,
  advanceQuests,
  BAG_SLOTS,
  applyXp,
  gearStats,
  isQuestComplete,
  isStackable,
  itemTemplate,
  newEntry,
  questById,
  questItemsFor,
  questOnlyItems,
  questProblem,
  questRecipesFor,
  racialBonuses,
  restedVitals,
  type NewItem,
  type ProfessionId,
  type QuestEvent,
  type QuestLog,
} from "@l2n/shared";
import type { FastifyInstance } from "fastify";
import type { CharacterTx, Store } from "../store/index.js";
import { GameError, idParam, makeAct, notFighting } from "./act.js";
import { requireAccount } from "./auth.js";
import { Inventory } from "./inventory.js";

/** What a notice board action did, sent along with the game view. */
export interface QuestResult {
  questId: string;
  action: "accepted" | "abandoned" | "completed";
  xp: number;
  silver: number;
  items: NewItem[];
  levelsGained: number;
  profession?: ProfessionId;
}

/** Count an event towards the character's active quests. Returns the ids of the quests it moved. */
export async function questEvent(tx: CharacterTx, event: QuestEvent): Promise<string[]> {
  const { log, changed } = advanceQuests(tx.character.quests, event);
  if (changed.length) await tx.updateCharacter({ quests: log });
  return changed;
}

function atBoard(tx: CharacterTx) {
  if (NODES[tx.character.location]?.service !== "quests") throw new GameError(400, "not_here", "Go to the Notice Board in Brackwell first.");
}

const questFor = (id: string) => {
  const q = questById(id);
  if (!q) throw new GameError(400, "unknown_quest", "No such quest.");
  return q;
};

/** Put items into the bag, refusing (and so rolling back the action) if they do not all fit. */
async function giveAll(inv: Inventory, items: NewItem[]) {
  const bag = inv.in("bag");
  const needed = items.filter((i) => {
    const t = itemTemplate(i.templateId);
    return !(t && isStackable(t) && bag.some((b) => b.templateId === i.templateId && b.itemLevel === null));
  });
  const distinct = new Set(needed.map((i) => i.templateId)).size;
  if (bag.length + distinct > BAG_SLOTS) throw new GameError(409, "full", `Make room in your bag first: this needs ${distinct} free.`);
  for (const i of items) await inv.put(i, true);
}

const questBody = (extra: Record<string, object> = {}) =>
  ({
    type: "object",
    required: ["questId"],
    additionalProperties: false,
    properties: { questId: { type: "string", maxLength: 64 }, ...extra },
  }) as const;

export async function questRoutes(app: FastifyInstance, opts: { store: Store }) {
  app.addHook("preHandler", requireAccount);
  const act = makeAct(opts.store);
  type Req<B> = { Params: { id: string }; Body: B };

  app.post<Req<{ questId: string }>>("/api/characters/:id/quests/accept", { schema: { params: idParam, body: questBody() } }, (req, reply) =>
    act(req, reply, async (tx) => {
      notFighting(tx);
      atBoard(tx);
      const q = questFor(req.body.questId);
      const c = tx.character;
      const problem = questProblem(q, c);
      if (problem) throw new GameError(400, "cannot_accept", problem);
      const items = questItemsFor(q.onAccept?.items, c.archetype);
      await giveAll(new Inventory(tx), items);
      const recipes = [...c.recipes, ...questRecipesFor(q, c.archetype).filter((r) => !c.recipes.includes(r))];
      await tx.updateCharacter({ quests: { ...c.quests, [q.id]: newEntry(q) }, recipes });
      return { quest: { questId: q.id, action: "accepted", xp: 0, silver: 0, items, levelsGained: 0 } satisfies QuestResult };
    }),
  );

  app.post<Req<{ questId: string }>>("/api/characters/:id/quests/abandon", { schema: { params: idParam, body: questBody() } }, (req, reply) =>
    act(req, reply, async (tx) => {
      notFighting(tx);
      const q = questFor(req.body.questId);
      const c = tx.character;
      if (c.quests[q.id]?.status !== "active") throw new GameError(400, "not_active", `You are not on ${q.name}.`);
      const inv = new Inventory(tx);
      for (const id of questOnlyItems(q))
        for (const i of tx.items.filter((x) => x.templateId === id && x.location !== "equipped")) await inv.take(i, i.quantity);
      const quests: QuestLog = { ...c.quests };
      delete quests[q.id];
      await tx.updateCharacter({ quests });
      return { quest: { questId: q.id, action: "abandoned", xp: 0, silver: 0, items: [], levelsGained: 0 } satisfies QuestResult };
    }),
  );

  app.post<Req<{ questId: string; profession?: ProfessionId }>>(
    "/api/characters/:id/quests/complete",
    { schema: { params: idParam, body: questBody({ profession: { type: "string", maxLength: 32 } }) } },
    (req, reply) =>
      act(req, reply, async (tx) => {
        notFighting(tx);
        atBoard(tx);
        const q = questFor(req.body.questId);
        const c = tx.character;
        const entry = c.quests[q.id];
        if (entry?.status !== "active") throw new GameError(400, "not_active", `You are not on ${q.name}.`);
        if (!isQuestComplete(q, entry, tx.items)) throw new GameError(400, "not_complete", `${q.name} is not finished yet.`);
        const profession = req.body.profession;
        if (q.profession) {
          if (c.profession) throw new GameError(400, "has_profession", "You have already chosen your path.");
          if (!ARCHETYPES[c.archetype].professions.some((p) => p.id === profession))
            throw new GameError(400, "choose_profession", `Choose a profession: ${ARCHETYPES[c.archetype].professions.map((p) => p.name).join(" or ")}.`);
        }

        // Hand over what the quest asked for, then make sure the rewards fit.
        const inv = new Inventory(tx);
        for (const o of q.objectives) {
          if (o.kind !== "deliver") continue;
          let left = o.count;
          for (const i of inv.in("bag").filter((x) => x.templateId === o.item && x.itemLevel === null)) {
            const n = Math.min(left, i.quantity);
            await inv.take(i, n);
            left -= n;
          }
          if (left > 0) throw new Error("delivery went missing");
        }
        const items = questItemsFor(q.reward.items, c.archetype);
        await giveAll(inv, items);

        const xp = Math.round(q.reward.xp * (1 + racialBonuses(c.race).xp));
        const next = applyXp(c.level, c.xp, xp);
        const newProfession = q.profession ? profession! : c.profession;
        // A level-up or a new profession refills HP and Mana, like a level-up after a kill.
        const refill =
          next.levelsGained > 0 || newProfession !== c.profession
            ? restedVitals(c.race, c.archetype, next.level, gearStats(tx.items).hpBonus, newProfession)
            : {};
        await tx.updateCharacter({
          level: next.level,
          xp: next.xp,
          ...refill,
          silver: c.silver + q.reward.silver,
          quests: { ...c.quests, [q.id]: { status: "done", progress: entry.progress } },
          ...(q.profession ? { profession: newProfession } : {}),
        });
        return {
          quest: {
            questId: q.id,
            action: "completed",
            xp,
            silver: q.reward.silver,
            items,
            levelsGained: next.levelsGained,
            ...(q.profession ? { profession: newProfession! } : {}),
          } satisfies QuestResult,
        };
      }),
  );
}
