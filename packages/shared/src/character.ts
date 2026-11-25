/**
 * Character creation rules and the character sheet. Used by the server to
 * validate and by the client to preview, so both always agree.
 * Source: docs/design.md, sections "Races", "Archetypes" and "Formulas".
 */
import { ARCHETYPES } from "./data/archetypes.js";
import { RACES } from "./data/races.js";
import { SKILLS } from "./data/skills.js";
import {
  MAX_FOCUS,
  attackPower,
  characterStats,
  critChance,
  defensePower,
  maxMana,
  xpToNext,
} from "./formulas.js";
import { characterMaxHp, provisionalGear, racialBonuses } from "./progression.js";
import type { ArchetypeId, RaceId, Skill, Stats } from "./types.js";

export const MAX_CHARACTERS_PER_ACCOUNT = 4;
export const CHARACTER_NAME_MIN = 3;
export const CHARACTER_NAME_MAX = 16;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const EMAIL_MAX = 254;

const NAME_RE = /^[A-Za-z]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isRaceId = (v: unknown): v is RaceId => typeof v === "string" && Object.hasOwn(RACES, v);
export const isArchetypeId = (v: unknown): v is ArchetypeId => typeof v === "string" && Object.hasOwn(ARCHETYPES, v);

/** Returns an error message, or null when the name is valid. Uniqueness is checked by the server. */
export function validateCharacterName(name: string): string | null {
  if (name.length < CHARACTER_NAME_MIN || name.length > CHARACTER_NAME_MAX)
    return `Name must be ${CHARACTER_NAME_MIN}–${CHARACTER_NAME_MAX} letters.`;
  if (!NAME_RE.test(name)) return "Name may contain only letters A–Z.";
  return null;
}

/** Canonical form of a name: "aLDRIC" becomes "Aldric". */
export const normalizeCharacterName = (name: string) =>
  name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase();

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function validateEmail(email: string): string | null {
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters.`;
  return null;
}

/** A character as the API returns it. */
export interface CharacterSummary {
  id: number;
  name: string;
  race: RaceId;
  archetype: ArchetypeId;
  profession: string | null;
  level: number;
  xp: number;
  hp: number;
  resource: number;
  silver: number;
  location: string;
  createdAt: string;
}

export interface CharacterSheet {
  stats: Stats;
  maxHp: number;
  resource: { kind: "focus" | "mana"; max: number; startsAt: number };
  /** Attack and defence include the provisional starter kit (see provisionalGear). */
  attack: number;
  defence: number;
  critChance: number;
  /** Extra damage dealt from passives, e.g. 0.05 for +5%. */
  damageBonus: number;
  xpBonus: number;
  xpToNext: number | null;
  passive: { name: string; description: string };
  skills: { learned: Skill[]; upcoming: Skill[] };
}

/** Derived numbers for a character, with the racial passive applied. */
export function characterSheet(race: RaceId, archetype: ArchetypeId, level = 1): CharacterSheet {
  const a = ARCHETYPES[archetype];
  const stats = characterStats(race, archetype);
  const resourceMax = a.resource === "mana" ? maxMana(level, stats.spirit) : MAX_FOCUS;
  const next = xpToNext(level);
  const bonus = racialBonuses(race);
  const gear = provisionalGear(level);
  const own = SKILLS.filter((s) => s.archetype === archetype);
  return {
    stats,
    maxHp: characterMaxHp(race, archetype, level),
    resource: { kind: a.resource, max: resourceMax, startsAt: a.resource === "mana" ? resourceMax : 0 },
    attack: Math.round(attackPower(level, stats[a.mainStat], gear.weaponPower)),
    defence: Math.round(defensePower(level, stats.vitality, gear.armour)),
    critChance: critChance(stats.agility, bonus.crit),
    damageBonus: bonus.damage,
    xpBonus: bonus.xp,
    xpToNext: Number.isFinite(next) ? next : null,
    passive: RACES[race].passive,
    skills: { learned: own.filter((s) => s.level <= level), upcoming: own.filter((s) => s.level > level) },
  };
}

/** HP and resource a brand-new character is stored with. */
export function startingVitals(race: RaceId, archetype: ArchetypeId) {
  const sheet = characterSheet(race, archetype, 1);
  return { hp: sheet.maxHp, resource: sheet.resource.startsAt };
}
