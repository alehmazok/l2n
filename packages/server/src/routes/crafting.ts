/**
 * The Brackwell smithy: crafting from learned recipes. Buying recipes goes
 * through the shared /buy route (routes/items.ts); learning one through /use.
 */
import { BAG_SLOTS, createRng, craftProblem, isStackable, itemTemplate, recipeById, rollCraft } from "@l2n/shared";
import type { FastifyInstance } from "fastify";
import type { Store } from "../store/index.js";
import { GameError, idParam, makeAct, notFighting } from "./act.js";
import { requireAccount } from "./auth.js";
import { Inventory } from "./inventory.js";
import { atService } from "./items.js";

export async function craftingRoutes(app: FastifyInstance, opts: { store: Store; random: () => number }) {
  app.addHook("preHandler", requireAccount);
  const act = makeAct(opts.store);

  app.post<{ Params: { id: string }; Body: { recipeId: string } }>(
    "/api/characters/:id/craft",
    {
      schema: {
        params: idParam,
        body: { type: "object", required: ["recipeId"], additionalProperties: false, properties: { recipeId: { type: "string", maxLength: 64 } } },
      },
    },
    (req, reply) =>
      act(req, reply, async (tx) => {
        notFighting(tx);
        atService(tx, "crafting");
        const recipe = recipeById(req.body.recipeId);
        if (!recipe) throw new GameError(400, "unknown_recipe", "No such recipe.");
        const c = tx.character;
        const problem = craftProblem(recipe, c, tx.items);
        if (problem) throw new GameError(400, "cannot_craft", problem);

        // Make sure a success fits before anything is spent. Inputs used up in full free their slot.
        const inv = new Inventory(tx);
        const bag = inv.in("bag");
        const freed = recipe.inputs.filter((i) => bag.find((b) => b.templateId === i.item && b.itemLevel === null)?.quantity === i.quantity).length;
        const needed = recipe.makes.filter((m) => {
          const t = itemTemplate(m.item);
          return !(t && isStackable(t) && bag.some((b) => b.templateId === m.item && b.itemLevel === null));
        }).length;
        if (bag.length - freed + needed > BAG_SLOTS) throw new GameError(409, "full", `Make room in your bag first: this needs ${needed} free.`);

        const outcome = rollCraft(recipe, c.race, createRng(Math.floor(opts.random() * 2 ** 32)));
        for (const u of outcome.used) {
          const stack = inv.in("bag").find((b) => b.templateId === u.item && b.itemLevel === null)!;
          await inv.take(stack, u.quantity);
        }
        for (const m of outcome.made) await inv.put(m, true);
        await tx.updateCharacter({ silver: c.silver - recipe.fee });
        return { craft: { recipeId: recipe.id, success: outcome.success, fee: recipe.fee, used: outcome.used, made: outcome.made } };
      }),
  );
}
