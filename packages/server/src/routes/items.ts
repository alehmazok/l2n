/**
 * Items outside of fights: wearing gear, drinking draughts, the Brackwell
 * market and warehouse, and the charge auto-use setting.
 */
import {
  ARCHETYPES,
  DRAUGHT_RESTORE,
  MAX_QUANTITY,
  NODES,
  SLOTS,
  WAREHOUSE_FEE,
  characterMaxHp,
  characterMaxMana,
  equipProblem,
  gearStats,
  itemName,
  itemTemplate,
  isSellable,
  itemValue,
  sellPrice,
  slotOf,
  stockEntry,
  stockItem,
  type Slot,
  type TownService,
} from "@l2n/shared";
import type { FastifyInstance } from "fastify";
import type { CharacterTx, Store } from "../store/index.js";
import { GameError, idParam, makeAct, notFighting } from "./act.js";
import { requireAccount } from "./auth.js";
import { Inventory } from "./inventory.js";

const SERVICE_NODE: Record<"shop" | "warehouse" | "crafting", string> = { shop: "Market", warehouse: "Warehouse", crafting: "Smithy" };

export function atService(tx: CharacterTx, service: TownService & keyof typeof SERVICE_NODE) {
  if (NODES[tx.character.location]?.service !== service)
    throw new GameError(400, "not_here", `Go to the ${SERVICE_NODE[service]} in Brackwell first.`);
}

/** After gear changes, HP above the new maximum is cut back. */
async function clampHp(tx: CharacterTx) {
  const c = tx.character;
  const max = characterMaxHp(c.race, c.archetype, c.level, gearStats(tx.items).hpBonus);
  if (c.hp > max) await tx.updateCharacter({ hp: max });
}

const itemBody = (extra: Record<string, object> = {}) =>
  ({
    type: "object",
    required: ["itemId", ...Object.keys(extra).filter((k) => k !== "quantity")],
    additionalProperties: false,
    properties: { itemId: { type: "integer", minimum: 1 }, ...extra },
  }) as const;
const quantity = { type: "integer", minimum: 1, maximum: MAX_QUANTITY } as const;

export async function itemRoutes(app: FastifyInstance, opts: { store: Store }) {
  app.addHook("preHandler", requireAccount);
  const act = makeAct(opts.store);
  type Req<B> = { Params: { id: string }; Body: B };

  app.post<Req<{ itemId: number }>>("/api/characters/:id/equip", { schema: { params: idParam, body: itemBody() } }, (req, reply) =>
    act(req, reply, async (tx) => {
      notFighting(tx);
      const inv = new Inventory(tx);
      const item = inv.find(req.body.itemId, "bag");
      const problem = equipProblem(item, tx.character.archetype, tx.character.level);
      if (problem) throw new GameError(400, "cannot_equip", problem);
      const worn = inv.in("equipped").find((i) => slotOf(i.templateId) === slotOf(item.templateId));
      // Swap in place: the worn piece takes the new one's room in the bag.
      if (worn) await tx.updateItem(worn.id, { location: "bag" });
      await tx.updateItem(item.id, { location: "equipped" });
      await clampHp(tx);
    }),
  );

  app.post<Req<{ slot: Slot }>>(
    "/api/characters/:id/unequip",
    {
      schema: {
        params: idParam,
        body: { type: "object", required: ["slot"], additionalProperties: false, properties: { slot: { type: "string", enum: SLOTS } } },
      },
    },
    (req, reply) =>
      act(req, reply, async (tx) => {
        notFighting(tx);
        const inv = new Inventory(tx);
        const worn = inv.in("equipped").find((i) => slotOf(i.templateId) === req.body.slot);
        if (!worn) throw new GameError(400, "nothing_there", "You are not wearing anything there.");
        await inv.move(worn, 1, "bag");
        await clampHp(tx);
      }),
  );

  app.post<Req<{ itemId: number }>>("/api/characters/:id/use", { schema: { params: idParam, body: itemBody() } }, (req, reply) =>
    act(req, reply, async (tx) => {
      notFighting(tx);
      const inv = new Inventory(tx);
      const item = inv.find(req.body.itemId, "bag");
      const t = itemTemplate(item.templateId);
      const c = tx.character;
      if (t?.kind === "recipe") {
        if (c.recipes.includes(t.recipe)) throw new GameError(400, "already_known", "You already know that recipe.");
        await inv.take(item, 1);
        await tx.updateCharacter({ recipes: [...c.recipes, t.recipe] });
        return;
      }
      if (t?.kind !== "draught") throw new GameError(400, "cannot_use", "You cannot use that here.");
      if (t.restores === "hp") {
        const max = characterMaxHp(c.race, c.archetype, c.level, gearStats(tx.items).hpBonus);
        if (c.hp >= max) throw new GameError(400, "already_full", "You are already at full health.");
        await inv.take(item, 1);
        await tx.updateCharacter({ hp: Math.min(max, c.hp + Math.round(max * DRAUGHT_RESTORE)) });
      } else {
        if (ARCHETYPES[c.archetype].resource !== "mana") throw new GameError(400, "cannot_use", "Warriors have no mana.");
        const max = characterMaxMana(c.race, c.archetype, c.level);
        if (c.resource >= max) throw new GameError(400, "already_full", "Your mana is already full.");
        await inv.take(item, 1);
        await tx.updateCharacter({ resource: Math.min(max, c.resource + Math.round(max * DRAUGHT_RESTORE)) });
      }
    }),
  );

  app.post<Req<{ stockId: string; quantity?: number }>>(
    "/api/characters/:id/buy",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          required: ["stockId"],
          additionalProperties: false,
          properties: { stockId: { type: "string", maxLength: 64 }, quantity },
        },
      },
    },
    (req, reply) =>
      act(req, reply, async (tx) => {
        notFighting(tx);
        const stock = stockEntry(req.body.stockId);
        if (!stock) throw new GameError(400, "not_sold", "Nobody in Brackwell sells that.");
        atService(tx, stock.service ?? "shop");
        const n = req.body.quantity ?? 1;
        if (stock.itemLevel !== null && n !== 1) throw new GameError(400, "one_at_a_time", "Gear is sold one piece at a time.");
        const item = stockItem(stock, n);
        const cost = itemValue(item) * n;
        if (tx.character.silver < cost) throw new GameError(400, "too_poor", `That costs ${cost} silver.`);
        const inv = new Inventory(tx);
        if (!(await inv.put(item))) throw new GameError(409, "full", "Your bag is full.");
        await tx.updateCharacter({ silver: tx.character.silver - cost });
      }),
  );

  app.post<Req<{ itemId: number; quantity?: number }>>(
    "/api/characters/:id/sell",
    { schema: { params: idParam, body: itemBody({ quantity }) } },
    (req, reply) =>
      act(req, reply, async (tx) => {
        notFighting(tx);
        atService(tx, "shop");
        const inv = new Inventory(tx);
        const item = inv.find(req.body.itemId, "bag");
        if (!isSellable(itemTemplate(item.templateId))) throw new GameError(400, "cannot_sell", "The trader will not take that. You will need it.");
        const n = req.body.quantity ?? item.quantity;
        await inv.take(item, n);
        await tx.updateCharacter({ silver: tx.character.silver + sellPrice(item, n) });
      }),
  );

  for (const [path, from, to] of [
    ["deposit", "bag", "warehouse"],
    ["withdraw", "warehouse", "bag"],
  ] as const)
    app.post<Req<{ itemId: number; quantity?: number }>>(
      `/api/characters/:id/${path}`,
      { schema: { params: idParam, body: itemBody({ quantity }) } },
      (req, reply) =>
        act(req, reply, async (tx) => {
          notFighting(tx);
          atService(tx, "warehouse");
          const inv = new Inventory(tx);
          const item = inv.find(req.body.itemId, from);
          const n = req.body.quantity ?? item.quantity;
          if (n > item.quantity) throw new GameError(400, "not_enough", "You do not have that many.");
          if (to === "warehouse") {
            if (tx.character.silver < WAREHOUSE_FEE)
              throw new GameError(400, "too_poor", `The keeper wants ${WAREHOUSE_FEE} silver to store ${itemName(item)}.`);
            await tx.updateCharacter({ silver: tx.character.silver - WAREHOUSE_FEE });
          }
          await inv.move(item, n, to);
        }),
    );

  app.post<Req<{ autoCharges: boolean }>>(
    "/api/characters/:id/settings",
    {
      schema: {
        params: idParam,
        body: { type: "object", required: ["autoCharges"], additionalProperties: false, properties: { autoCharges: { type: "boolean" } } },
      },
    },
    (req, reply) =>
      act(req, reply, async (tx) => {
        await tx.updateCharacter({ autoCharges: req.body.autoCharges });
      }),
  );
}
