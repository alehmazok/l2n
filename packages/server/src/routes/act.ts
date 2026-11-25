/**
 * Shared plumbing for game actions on one character: every action runs inside
 * `store.withCharacter`, so it sees a consistent character, fight and
 * inventory and commits atomically, then answers with the new game view.
 */
import { InvalidAction, type FightResult, type NewItem } from "@l2n/shared";
import type { FastifyReply } from "fastify";
import type { CharacterTx, Store, StoredFight } from "../store/index.js";
import type { QuestResult } from "./quests.js";
import { fightView, gameView } from "./view.js";

export class GameError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", pattern: "^[1-9][0-9]{0,15}$" } },
} as const;

export const notFighting = (tx: CharacterTx) => {
  if (tx.fight) throw new GameError(409, "in_fight", "Finish the fight first.");
};

/** What a crafting attempt did, sent along with the game view. */
export interface CraftResult {
  recipeId: string;
  success: boolean;
  fee: number;
  used: { item: string; quantity: number }[];
  made: NewItem[];
}

/** An action may report a finished fight's result or a crafting attempt. */
export type ActFn = (tx: CharacterTx) => Promise<FightResult | { craft: CraftResult } | { quest: QuestResult } | void>;

export function makeAct(store: Store) {
  /** Run one action on the caller's character and answer with the new game view. */
  return async function act(req: { account: { id: number } | null; params: { id: string } }, reply: FastifyReply, fn: ActFn) {
    try {
      const out = await store.withCharacter(req.account!.id, Number(req.params.id), async (tx) => {
        // Track the latest character and fight so the answer reflects this action exactly.
        let character = tx.character;
        let fight = tx.fight;
        let ended: StoredFight | undefined;
        const tracked: CharacterTx = {
          get character() {
            return character;
          },
          get fight() {
            return fight;
          },
          get items() {
            return tx.items;
          },
          updateCharacter: async (p) => (character = await tx.updateCharacter(p)),
          createFight: async (f) => (fight = await tx.createFight(f)),
          saveFight: async (s) => {
            const saved = await tx.saveFight(s);
            fight = s.outcome === "ongoing" ? saved : undefined;
            if (!fight) ended = saved;
            return saved;
          },
          addItem: (i) => tx.addItem(i),
          updateItem: (id, p) => tx.updateItem(id, p),
          deleteItem: (id) => tx.deleteItem(id),
        };
        const result = await fn(tracked);
        const extra =
          result && "craft" in result
            ? { craft: result.craft }
            : result && "quest" in result
              ? { quest: result.quest }
              : result && ended
                ? { result, ended: fightView(ended) }
                : {};
        return { ...gameView(character, fight, tx.items), ...extra };
      });
      if (!out) return reply.code(404).send({ error: "not_found", message: "Character not found." });
      return out;
    } catch (err) {
      if (err instanceof GameError) return reply.code(err.status).send({ error: err.code, message: err.message });
      if (err instanceof InvalidAction) return reply.code(400).send({ error: "invalid_action", message: err.message });
      throw err;
    }
  };
}
