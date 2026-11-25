import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { randomInt } from "node:crypto";
import { ARCHETYPES, BAG_SLOTS, ITEMS, MOBS, NODES, PROFESSIONS, QUEST_LIST, RACES, RECIPES, SHOP_STOCK, SKILLS, SMITHY_STOCK, WAREHOUSE_FEE, WAREHOUSE_SLOTS, ZONES } from "@l2n/shared";
import { authRoutes, sessionHook } from "./routes/auth.js";
import { characterRoutes } from "./routes/characters.js";
import { craftingRoutes } from "./routes/crafting.js";
import { gameRoutes } from "./routes/game.js";
import { itemRoutes } from "./routes/items.js";
import { questRoutes } from "./routes/quests.js";
import { MemoryStore, type Store } from "./store/index.js";

export interface AppOptions {
  store?: Store;
  cookieSecure?: boolean;
  /** Clock override for tests. */
  now?: () => Date;
  logger?: boolean;
  /** Source of randomness for encounters and fight seeds, a float in [0, 1). Override in tests. */
  random?: () => number;
}

export function buildApp(opts: AppOptions = {}) {
  const store = opts.store ?? new MemoryStore();
  const now = opts.now ?? (() => new Date());
  const app = Fastify({ logger: opts.logger ?? process.env.NODE_ENV !== "test" });

  app.register(cookie);
  app.decorateRequest("account", null);
  // preHandler (not onRequest) so the cookie plugin has already parsed cookies.
  app.addHook("preHandler", sessionHook(store, now));

  // One error shape for the client: { error, message }.
  app.setErrorHandler((err: { validation?: unknown; statusCode?: number; message: string }, req, reply) => {
    if (err.validation) return reply.code(400).send({ error: "invalid", message: err.message });
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) req.log.error(err);
    return reply.code(status).send({ error: status === 500 ? "internal" : "bad_request", message: status === 500 ? "Something went wrong." : err.message });
  });

  app.get("/health", async () => ({ ok: true }));

  app.register(authRoutes, { store, cookieSecure: opts.cookieSecure ?? false, now });
  app.register(characterRoutes, { store });
  const random = opts.random ?? (() => randomInt(0, 2 ** 32) / 2 ** 32);
  app.register(gameRoutes, { store, random });
  app.register(itemRoutes, { store });
  app.register(craftingRoutes, { store, random });
  app.register(questRoutes, { store });

  /** Static game data: races, archetypes and professions, skills, the world map, items, recipes, quests and what the market and smithy sell. */
  app.get("/api/meta", async () => ({
    races: RACES,
    archetypes: ARCHETYPES,
    professions: PROFESSIONS,
    skills: SKILLS,
    zones: ZONES,
    nodes: NODES,
    mobs: MOBS,
    items: ITEMS,
    shop: SHOP_STOCK,
    smithy: SMITHY_STOCK,
    recipes: RECIPES,
    quests: QUEST_LIST,
    limits: { bagSlots: BAG_SLOTS, warehouseSlots: WAREHOUSE_SLOTS, warehouseFee: WAREHOUSE_FEE },
  }));

  return app;
}
