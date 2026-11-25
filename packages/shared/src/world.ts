/**
 * The living world: chat, who is where, the chronicle and fallen markers.
 * Rules and numbers are in docs/design.md, section "Living world". The server
 * stores and serves these; the client only formats them.
 */
import { PROFESSIONS } from "./data/archetypes.js";
import { RACES } from "./data/races.js";
import { MOBS, ZONES, type ZoneId } from "./data/world.js";
import { itemTemplate } from "./data/items.js";
import type { ProfessionId, RaceId } from "./types.js";

/** Longest chat message, in characters after trimming. */
export const CHAT_MAX_LENGTH = 200;
/** Level a character needs to speak in the global channel; zone chat is open to all. */
export const GLOBAL_CHAT_LEVEL = 2;
/** At least this long between two messages from one account. */
export const CHAT_MIN_INTERVAL_MS = 2_000;
/** At most this many messages from one account per minute. */
export const CHAT_PER_MINUTE = 8;
/** How many chat lines and chronicle entries a client gets at most per request. */
export const CHAT_PAGE = 50;
export const CHRONICLE_PAGE = 20;
/** A character counts as present on its node for this long after its last request. */
export const PRESENCE_WINDOW_MS = 5 * 60_000;
/** Fallen markers stay visible this long. */
export const FALLEN_WINDOW_MS = 30 * 60_000;
/** Most fallen markers shown at once, newest first. */
export const FALLEN_PAGE = 50;

/** `global`, or a zone id for that zone's channel. */
export type ChatChannel = "global" | ZoneId;
export const isChatChannel = (v: string): v is ChatChannel => v === "global" || Object.hasOwn(ZONES, v);

export interface ChatMessage {
  id: number;
  channel: ChatChannel;
  /** The speaker's character name and race at the time. */
  name: string;
  race: RaceId;
  text: string;
  /** ISO time. */
  at: string;
}

/**
 * Clean up a chat line: drop control and invisible formatting characters,
 * collapse runs of whitespace, trim. Rendering still escapes it; this keeps
 * lines readable and stops invisible-text tricks.
 */
export function normalizeChatText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Why a normalised chat line cannot be sent, or null if it can. */
export function chatProblem(text: string): string | null {
  if (!text) return "Say something first.";
  if ([...text].length > CHAT_MAX_LENGTH) return `Keep it under ${CHAT_MAX_LENGTH} characters.`;
  return null;
}

/** Something worth remembering, shown in the chronicle feed. */
export type ChronicleEvent =
  | { kind: "boss"; mobId: string }
  | { kind: "profession"; profession: ProfessionId }
  | { kind: "rare_craft"; templateId: string; itemLevel: number | null };

export interface ChronicleEntry {
  id: number;
  event: ChronicleEvent;
  name: string;
  race: RaceId;
  /** The first time anyone did this (first to beat this boss, take this profession, craft this rare). */
  first: boolean;
  at: string;
}

/** What makes two chronicle events "the same deed" for the `first` flag. */
export function chronicleKey(e: ChronicleEvent): string {
  switch (e.kind) {
    case "boss":
      return e.mobId;
    case "profession":
      return e.profession;
    case "rare_craft":
      return e.templateId;
  }
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** One line of the chronicle, as plain text (escape it before putting it in HTML). */
export function chronicleText(e: Pick<ChronicleEntry, "event" | "name" | "race" | "first">): string {
  const who = `${e.name} the ${RACES[e.race]?.name ?? "Wanderer"}`;
  const ev = e.event;
  switch (ev.kind) {
    case "boss": {
      const mob = MOBS[ev.mobId]?.name ?? "Nameless One";
      return e.first ? `${who} is the first to defeat the ${mob}!` : `${who} defeated the ${mob}.`;
    }
    case "profession": {
      const p = PROFESSIONS[ev.profession]?.name ?? "Wayfarer";
      return e.first ? `${who} is the first ${p} of Hollowreach!` : `${who} became ${article(p)} ${p}.`;
    }
    case "rare_craft": {
      const item = itemTemplate(ev.templateId)?.name ?? "wonder";
      return e.first ? `${who} forged the first Rare ${item} ever made!` : `${who} forged a Rare ${item}.`;
    }
  }
}

export interface FallenMarker {
  id: number;
  nodeId: string;
  name: string;
  race: RaceId;
  mobId: string;
  at: string;
}

/** "Yrsa fell here to a Thicket Wolf." */
export function fallenText(m: Pick<FallenMarker, "name" | "mobId">): string {
  const mob = MOBS[m.mobId]?.name ?? "something in the dark";
  return `${m.name} fell here to ${MOBS[m.mobId] ? `${article(mob)} ` : ""}${mob}.`;
}

/** "just now", "4 min ago", "2 h ago", "3 d ago". */
export function timeAgo(at: string, now: Date): string {
  const s = Math.max(0, (now.getTime() - new Date(at).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Everything a client polls for: who is where, new chat lines, the chronicle and recent deaths. */
export interface WorldView {
  /** Present players per node id, including the asker. Nodes with nobody are left out. */
  online: Record<string, number>;
  chat: ChatMessage[];
  chronicle: ChronicleEntry[];
  fallen: FallenMarker[];
  /** Server time, so "min ago" does not depend on the client's clock. */
  now: string;
}
