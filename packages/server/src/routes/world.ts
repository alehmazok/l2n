/**
 * The living world: polling for who is where, chat lines, the chronicle and
 * fallen markers, and sending chat. See docs/design.md, "Living world".
 * Chronicle entries and fallen markers are written by the game actions
 * themselves (game.ts, crafting.ts, quests.ts) inside their transaction.
 */
import {
  CHAT_MIN_INTERVAL_MS,
  CHAT_PAGE,
  CHAT_PER_MINUTE,
  CHRONICLE_PAGE,
  FALLEN_PAGE,
  FALLEN_WINDOW_MS,
  GLOBAL_CHAT_LEVEL,
  NODES,
  PRESENCE_WINDOW_MS,
  chatProblem,
  normalizeChatText,
  type ChatChannel,
  type CharacterSummary,
  type WorldView,
} from "@l2n/shared";
import type { FastifyInstance } from "fastify";
import type { Store } from "../store/index.js";
import { idParam } from "./act.js";
import { requireAccount } from "./auth.js";

/** The channels a character hears: global and the zone it stands in. */
export function channelsFor(c: CharacterSummary): ChatChannel[] {
  const zone = NODES[c.location]?.zone;
  return zone ? ["global", zone] : ["global"];
}

const cursor = { type: "string", pattern: "^(0|[1-9][0-9]{0,15})$" } as const;

export async function worldRoutes(app: FastifyInstance, opts: { store: Store; now: () => Date }) {
  const { store, now } = opts;
  app.addHook("preHandler", requireAccount);

  const notFound = { error: "not_found", message: "Character not found." };

  app.get<{ Params: { id: string }; Querystring: { chat?: string; chronicle?: string } }>(
    "/api/characters/:id/world",
    {
      schema: {
        params: idParam,
        querystring: { type: "object", additionalProperties: false, properties: { chat: cursor, chronicle: cursor } },
      },
    },
    async (req, reply) => {
      const t = now();
      const c = await store.touchCharacter(req.account!.id, Number(req.params.id), t);
      if (!c) return reply.code(404).send(notFound);
      const after = (v: string | undefined) => (v === undefined ? undefined : Number(v));
      const [online, chat, chronicle, fallen] = await Promise.all([
        store.onlineCounts(new Date(t.getTime() - PRESENCE_WINDOW_MS)),
        store.listChat(channelsFor(c), after(req.query.chat), CHAT_PAGE),
        store.listChronicle(after(req.query.chronicle), CHRONICLE_PAGE),
        store.listFallen(new Date(t.getTime() - FALLEN_WINDOW_MS), FALLEN_PAGE),
      ]);
      const view: WorldView = { online, chat, chronicle, fallen, now: t.toISOString() };
      return view;
    },
  );

  app.post<{ Params: { id: string }; Body: { channel: "global" | "zone"; text: string } }>(
    "/api/characters/:id/chat",
    {
      schema: {
        params: idParam,
        body: {
          type: "object",
          required: ["channel", "text"],
          additionalProperties: false,
          // The raw limit is generous so whitespace that normalising removes does not count; the real limit is checked after.
          properties: { channel: { type: "string", enum: ["global", "zone"] }, text: { type: "string", maxLength: 1000 } },
        },
      },
    },
    async (req, reply) => {
      const t = now();
      const accountId = req.account!.id;
      const c = await store.touchCharacter(accountId, Number(req.params.id), t);
      if (!c) return reply.code(404).send(notFound);
      const text = normalizeChatText(req.body.text);
      const problem = chatProblem(text);
      if (problem) return reply.code(400).send({ error: "invalid", message: problem });

      const standing = await store.chatStanding(accountId, new Date(t.getTime() - 60_000));
      if (standing.mutedUntil && standing.mutedUntil > t)
        return reply.code(403).send({ error: "muted", message: "You cannot use chat for now." });
      if ((standing.last && t.getTime() - standing.last.getTime() < CHAT_MIN_INTERVAL_MS) || standing.recent >= CHAT_PER_MINUTE)
        return reply.code(429).send({ error: "too_fast", message: "You are speaking too fast. Wait a moment." });

      let channel: ChatChannel;
      if (req.body.channel === "global") {
        if (c.level < GLOBAL_CHAT_LEVEL)
          return reply.code(403).send({ error: "level_too_low", message: `Global chat opens at level ${GLOBAL_CHAT_LEVEL}. Zone chat is open to all.` });
        channel = "global";
      } else {
        const zone = NODES[c.location]?.zone;
        if (!zone) return reply.code(400).send({ error: "lost", message: "You are nowhere anyone can hear you." });
        channel = zone;
      }
      const message = await store.addChatMessage({ channel, accountId, characterId: c.id, name: c.name, race: c.race, text, at: t });
      return reply.code(201).send({ message });
    },
  );
}
