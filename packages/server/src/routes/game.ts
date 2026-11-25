/**
 * Game actions for one character: moving on the map, resting, hunting and
 * fighting. Every action runs inside `store.withCharacter`, so it sees a
 * consistent character and fight and commits atomically.
 */
import {
  InvalidAction,
  NODES,
  autoResolve,
  buildMob,
  buildPlayer,
  canAutoBattle,
  pickEncounter,
  playerInputFor,
  resolveRound,
  restedVitals,
  settleFight,
  startFight,
  type Action,
  type FightResult,
} from "@l2n/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { CharacterTx, Store, StoredFight } from "../store/index.js";
import { requireAccount } from "./auth.js";
import { fightView, gameView } from "./view.js";

class GameError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", pattern: "^[1-9][0-9]{0,15}$" } },
} as const;

export async function gameRoutes(app: FastifyInstance, opts: { store: Store; random: () => number }) {
  const { store, random } = opts;
  app.addHook("preHandler", requireAccount);

  /** Run one action on the caller's character and answer with the new game view. */
  async function act(
    req: { account: { id: number } | null; params: { id: string } },
    reply: FastifyReply,
    fn: (tx: CharacterTx) => Promise<FightResult | void>,
  ) {
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
          updateCharacter: async (p) => (character = await tx.updateCharacter(p)),
          createFight: async (f) => (fight = await tx.createFight(f)),
          saveFight: async (s) => {
            const saved = await tx.saveFight(s);
            fight = s.outcome === "ongoing" ? saved : undefined;
            if (!fight) ended = saved;
            return saved;
          },
        };
        const result = await fn(tracked);
        return { ...gameView(character, fight), ...(result && ended ? { result, ended: fightView(ended) } : {}) };
      });
      if (!out) return reply.code(404).send({ error: "not_found", message: "Character not found." });
      return out;
    } catch (err) {
      if (err instanceof GameError) return reply.code(err.status).send({ error: err.code, message: err.message });
      if (err instanceof InvalidAction) return reply.code(400).send({ error: "invalid_action", message: err.message });
      throw err;
    }
  }

  const notFighting = (tx: CharacterTx) => {
    if (tx.fight) throw new GameError(409, "in_fight", "Finish the fight first.");
  };

  app.post<{ Params: { id: string }; Body: { to: string } }>(
    "/api/characters/:id/move",
    {
      schema: {
        params: idParam,
        body: { type: "object", required: ["to"], additionalProperties: false, properties: { to: { type: "string", maxLength: 64 } } },
      },
    },
    (req, reply) =>
      act(req, reply, async (tx) => {
        notFighting(tx);
        const here = NODES[tx.character.location];
        const to = req.body.to;
        if (!Object.hasOwn(NODES, to)) throw new GameError(400, "unknown_node", "No such place.");
        if (here && !here.links.includes(to)) throw new GameError(400, "not_adjacent", `You cannot go to ${NODES[to]!.name} from here.`);
        await tx.updateCharacter({ location: to });
      }),
  );

  app.post<{ Params: { id: string } }>("/api/characters/:id/rest", { schema: { params: idParam } }, (req, reply) =>
    act(req, reply, async (tx) => {
      notFighting(tx);
      const c = tx.character;
      if (NODES[c.location]?.kind !== "town") throw new GameError(400, "not_in_town", "You can only rest in town.");
      await tx.updateCharacter(restedVitals(c.race, c.archetype, c.level));
    }),
  );

  app.post<{ Params: { id: string } }>("/api/characters/:id/hunt", { schema: { params: idParam } }, (req, reply) =>
    act(req, reply, async (tx) => {
      notFighting(tx);
      const c = tx.character;
      const node = NODES[c.location];
      if (!node || node.kind !== "hunt") throw new GameError(400, "not_hunting_ground", "There is nothing to hunt here.");
      const mob = pickEncounter(node, c.level, random());
      const seed = Math.floor(random() * 2 ** 32);
      const state = startFight(buildPlayer(playerInputFor(c)), buildMob(mob.name, mob.level, mob.role), seed);
      await tx.createFight({ mobId: mob.id, nodeId: node.id, state });
    }),
  );

  app.post<{ Params: { id: string }; Body: { action: { type: string; skillId?: string } } }>(
    "/api/characters/:id/fight",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          required: ["action"],
          additionalProperties: false,
          properties: {
            action: {
              type: "object",
              required: ["type"],
              additionalProperties: false,
              properties: {
                type: { type: "string", enum: ["attack", "skill", "flee", "auto"] },
                skillId: { type: "string", maxLength: 64 },
              },
            },
          },
        },
      },
    },
    (req, reply) =>
      act(req, reply, async (tx) => {
        const fight = tx.fight;
        if (!fight) throw new GameError(409, "no_fight", "You are not in a fight.");
        const a = req.body.action;
        let state;
        if (a.type === "auto") {
          if (!canAutoBattle(fight.state.player.level, fight.state.enemy.level))
            throw new GameError(400, "auto_not_allowed", "Auto-battle works only on mobs 4 or more levels below you.");
          state = autoResolve(fight.state);
          if (state.outcome === "ongoing") throw new GameError(500, "auto_stalled", "Auto-battle did not finish.");
        } else {
          if (a.type === "skill" && !a.skillId) throw new GameError(400, "invalid", "skillId is required for a skill.");
          const action: Action = a.type === "skill" ? { type: "skill", skillId: a.skillId! } : { type: a.type as "attack" | "flee" };
          state = resolveRound(fight.state, action);
        }
        await tx.saveFight(state);
        if (state.outcome === "ongoing") return;
        const { patch, result } = settleFight(tx.character, state);
        await tx.updateCharacter(patch);
        return result;
      }),
  );
}
