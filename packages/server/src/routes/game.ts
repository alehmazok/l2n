/**
 * Game actions for one character: moving on the map, resting, hunting and
 * fighting. Every action runs through `act` (see act.ts), so it sees a
 * consistent character, fight and inventory and commits atomically.
 */
import {
  MOBS,
  NODES,
  autoResolve,
  buildMob,
  buildPlayer,
  canAutoBattle,
  createRng,
  gearStats,
  pickEncounter,
  playerInputFor,
  resolveRound,
  restedVitals,
  rollLoot,
  settleFight,
  startFight,
  type Action,
  type DraughtId,
  type NewItem,
} from "@l2n/shared";
import type { FastifyInstance } from "fastify";
import type { Store } from "../store/index.js";
import { GameError, idParam, makeAct, notFighting } from "./act.js";
import { requireAccount } from "./auth.js";
import { Inventory } from "./inventory.js";

export async function gameRoutes(app: FastifyInstance, opts: { store: Store; random: () => number }) {
  const { store, random } = opts;
  app.addHook("preHandler", requireAccount);
  const act = makeAct(store);

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
      await tx.updateCharacter(restedVitals(c.race, c.archetype, c.level, gearStats(tx.items).hpBonus));
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
      const gear = gearStats(tx.items);
      const loadout = await new Inventory(tx).packBelt(c, gear);
      const state = startFight(buildPlayer(playerInputFor({ ...c, gear }, loadout)), buildMob(mob.name, mob.level, mob.role), seed);
      await tx.createFight({ mobId: mob.id, nodeId: node.id, state });
    }),
  );

  app.post<{ Params: { id: string }; Body: { action: { type: string; skillId?: string; itemId?: DraughtId } } }>(
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
                type: { type: "string", enum: ["attack", "skill", "item", "flee", "auto"] },
                skillId: { type: "string", maxLength: 64 },
                itemId: { type: "string", enum: ["healing_draught", "mana_draught"] },
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
          if (a.type === "item" && !a.itemId) throw new GameError(400, "invalid", "itemId is required for an item.");
          const action: Action =
            a.type === "skill"
              ? { type: "skill", skillId: a.skillId! }
              : a.type === "item"
                ? { type: "item", itemId: a.itemId! }
                : { type: a.type as "attack" | "flee" };
          state = resolveRound(fight.state, action);
        }
        await tx.saveFight(state);
        if (state.outcome === "ongoing") return;

        const inv = new Inventory(tx);
        await inv.unpackBelt(state.player);
        const c = tx.character;
        const { patch, result } = settleFight({ ...c, gear: gearStats(tx.items) }, state);
        const mob = MOBS[fight.mobId];
        if (state.outcome === "won" && mob) {
          // Loot rolls continue the fight's own RNG, which the client never sees.
          const loot = rollLoot(mob, c, createRng(state.rngState));
          const kept: NewItem[] = [];
          const lost: NewItem[] = [];
          for (const i of loot.items) ((await inv.put(i)) ? kept : lost).push(i);
          result.loot = { silver: loot.silver, items: kept, lost };
          await tx.updateCharacter({ ...patch, silver: c.silver + loot.silver });
        } else await tx.updateCharacter(patch);
        return result;
      }),
  );
}
