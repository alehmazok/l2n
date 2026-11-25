import {
  ARCHETYPES,
  MAX_CHARACTERS_PER_ACCOUNT,
  RACES,
  characterSheet,
  normalizeCharacterName,
  startingVitals,
  validateCharacterName,
  type ArchetypeId,
  type CharacterSummary,
  type RaceId,
} from "@l2n/shared";
import type { FastifyInstance } from "fastify";
import type { Store } from "../store/index.js";
import { requireAccount } from "./auth.js";

const withSheet = (c: CharacterSummary) => ({ character: c, sheet: characterSheet(c.race, c.archetype, c.level) });

export async function characterRoutes(app: FastifyInstance, opts: { store: Store }) {
  const { store } = opts;
  app.addHook("preHandler", requireAccount);

  app.get("/api/characters", async (req) => ({
    characters: await store.listCharacters(req.account!.id),
    maxCharacters: MAX_CHARACTERS_PER_ACCOUNT,
  }));

  app.post<{ Body: { name: string; race: RaceId; archetype: ArchetypeId } }>(
    "/api/characters",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "race", "archetype"],
          additionalProperties: false,
          properties: {
            name: { type: "string", maxLength: 64 },
            race: { type: "string", enum: Object.keys(RACES) },
            archetype: { type: "string", enum: Object.keys(ARCHETYPES) },
          },
        },
      },
    },
    async (req, reply) => {
      const { race, archetype } = req.body;
      const name = normalizeCharacterName(req.body.name);
      const problem = validateCharacterName(name);
      if (problem) return reply.code(400).send({ error: "invalid", message: problem });
      const created = await store.createCharacter({
        accountId: req.account!.id,
        name,
        race,
        archetype,
        ...startingVitals(race, archetype),
        maxPerAccount: MAX_CHARACTERS_PER_ACCOUNT,
      });
      if (created === "name_taken")
        return reply.code(409).send({ error: "name_taken", message: `The name ${name} is already taken.` });
      if (created === "limit_reached")
        return reply.code(409).send({
          error: "limit_reached",
          message: `An account can have at most ${MAX_CHARACTERS_PER_ACCOUNT} characters.`,
        });
      return reply.code(201).send(withSheet(created));
    },
  );

  app.get<{ Params: { id: string } }>("/api/characters/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const c = Number.isSafeInteger(id) && id > 0 ? await store.getCharacter(req.account!.id, id) : undefined;
    if (!c) return reply.code(404).send({ error: "not_found", message: "Character not found." });
    return withSheet(c);
  });
}
