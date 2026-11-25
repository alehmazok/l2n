import cookie from "@fastify/cookie";
import Fastify from "fastify";
import {
  ARCHETYPES,
  RACES,
  SKILLS,
  armourFor,
  autoResolve,
  buildMob,
  buildPlayer,
  characterStats,
  startFight,
  weaponPowerFor,
  type ArchetypeId,
  type RaceId,
} from "@l2n/shared";
import { authRoutes, sessionHook } from "./routes/auth.js";
import { characterRoutes } from "./routes/characters.js";
import { MemoryStore, type Store } from "./store/index.js";

export interface AppOptions {
  store?: Store;
  cookieSecure?: boolean;
  /** Clock override for tests. */
  now?: () => Date;
  logger?: boolean;
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

  /** Static game data the client needs to render character creation. */
  app.get("/api/meta", async () => ({ races: RACES, archetypes: ARCHETYPES, skills: SKILLS }));

  /**
   * Temporary demo endpoint: the server runs an auto-battle and returns the log.
   * Replaced by real character-bound fights in MVP stage 2.
   */
  app.get<{ Querystring: { race?: string; archetype?: string; level?: string; seed?: string } }>(
    "/api/demo-fight",
    async (req, reply) => {
      const race = (req.query.race ?? "human") as RaceId;
      const archetype = (req.query.archetype ?? "warrior") as ArchetypeId;
      const level = Math.min(20, Math.max(1, Number(req.query.level ?? 1) | 0));
      if (!(race in RACES) || !(archetype in ARCHETYPES)) return reply.code(400).send({ error: "bad race or archetype" });
      const tier = level >= 10 ? 2 : 1;
      const player = buildPlayer({
        name: "Wanderer",
        archetype,
        level,
        stats: characterStats(race, archetype),
        weaponPower: weaponPowerFor(tier, level),
        armour: armourFor(tier, level),
        skills: SKILLS.filter((s) => s.archetype === archetype && s.level <= level).map((s) => s.id),
        charges: 0,
      });
      const seed = Number(req.query.seed ?? Math.floor(Math.random() * 2 ** 31));
      return autoResolve(startFight(player, buildMob("Marsh Prowler", level), seed));
    },
  );

  return app;
}
