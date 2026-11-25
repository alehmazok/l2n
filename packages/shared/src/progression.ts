/**
 * Leveling, racial passives and the outcome of a fight for a character.
 * Used by the server to settle fights and by the client to preview numbers.
 * Source: docs/design.md, sections "Races", "Progression" and "Death".
 */
import { ARCHETYPES, PROFESSIONS } from "./data/archetypes.js";
import { SKILLS } from "./data/skills.js";
import { RESPAWN_NODE } from "./data/world.js";
import type { FightState, PlayerInput } from "./combat.js";
import type { DraughtId } from "./data/items.js";
import {
  AUTO_BATTLE_LEVEL_GAP,
  DEATH_XP_LOSS,
  MAX_LEVEL,
  RESPAWN_SHARE,
  characterStats,
  maxHp,
  maxMana,
  mobXp,
  xpToNext,
} from "./formulas.js";
import { NO_GEAR, type GearStats, type NewItem } from "./items.js";
import type { ArchetypeId, ProfessionId, ProfessionInfo, RaceId } from "./types.js";

export interface RacialBonuses {
  xp: number;
  crit: number;
  damage: number;
  hp: number;
  craft: number;
  resourceDrops: number;
}

/** Numeric effect of each race's passive. Resource drops apply from stage 3, crafting from stage 4. */
export function racialBonuses(race: RaceId): RacialBonuses {
  const b: RacialBonuses = { xp: 0, crit: 0, damage: 0, hp: 0, craft: 0, resourceDrops: 0 };
  if (race === "human") b.xp = 0.05;
  if (race === "dawn_elf") b.crit = 0.03;
  if (race === "dusk_elf") b.damage = 0.05;
  if (race === "orc") b.hp = 0.08;
  if (race === "dwarf") {
    b.craft = 0.05;
    b.resourceDrops = 0.1;
  }
  return b;
}

/** Numeric effect of a profession's passive; all zero without a profession. */
export function professionBonuses(profession: ProfessionId | null | undefined): Required<ProfessionInfo["bonuses"]> {
  const b = profession ? PROFESSIONS[profession]?.bonuses : undefined;
  return { hp: b?.hp ?? 0, damage: b?.damage ?? 0, defence: b?.defence ?? 0, dot: b?.dot ?? 0 };
}

/** Max HP with the racial and profession passives and any max HP bonus from worn gear. */
export function characterMaxHp(race: RaceId, archetype: ArchetypeId, level: number, gearHpBonus = 0, profession?: ProfessionId | null): number {
  const bonus = racialBonuses(race).hp + professionBonuses(profession).hp + gearHpBonus;
  return Math.round(maxHp(archetype, level, characterStats(race, archetype).vitality) * (1 + bonus));
}

/** Max Mana for mages, 0 for warriors (Focus is not stored between fights). */
export function characterMaxMana(race: RaceId, archetype: ArchetypeId, level: number): number {
  return ARCHETYPES[archetype].resource === "mana" ? maxMana(level, characterStats(race, archetype).spirit) : 0;
}

/** Skills of an archetype (and profession, if any) with the level each unlocks at. */
export const skillsFor = (archetype: ArchetypeId, profession?: ProfessionId | null) =>
  SKILLS.filter((s) => s.archetype === archetype && (s.profession === undefined || s.profession === profession));

export const learnedSkillIds = (archetype: ArchetypeId, level: number, profession?: ProfessionId | null) =>
  skillsFor(archetype, profession)
    .filter((s) => s.level <= level)
    .map((s) => s.id);

/** The part of a character that combat and progression need. */
export interface CharacterVitals {
  name: string;
  race: RaceId;
  archetype: ArchetypeId;
  level: number;
  xp: number;
  hp: number;
  resource: number;
  /** Profession taken at level 20; none if left out. */
  profession?: ProfessionId | null;
  /** Worn gear; none if left out. */
  gear?: GearStats;
}

/** Consumables carried into a fight. */
export interface Loadout {
  charges: number;
  chargeItem?: string;
  draughts?: Partial<Record<DraughtId, number>>;
}

/** Combat input for a character with everything they currently have applied. */
export function playerInputFor(c: CharacterVitals, loadout: Loadout = { charges: 0 }): PlayerInput {
  const bonus = racialBonuses(c.race);
  const prof = professionBonuses(c.profession);
  const gear = c.gear ?? NO_GEAR;
  return {
    name: c.name,
    archetype: c.archetype,
    level: c.level,
    stats: characterStats(c.race, c.archetype),
    weaponPower: gear.weaponPower,
    armour: gear.armour,
    skills: learnedSkillIds(c.archetype, c.level, c.profession),
    ...loadout,
    critBonus: bonus.crit + gear.critBonus,
    damageBonus: bonus.damage + prof.damage,
    hpBonus: bonus.hp + prof.hp + gear.hpBonus,
    ...(prof.defence ? { defenceBonus: prof.defence } : {}),
    ...(prof.dot ? { dotBonus: prof.dot } : {}),
    hp: c.hp,
    mana: ARCHETYPES[c.archetype].resource === "mana" ? c.resource : 0,
  };
}

export const canAutoBattle = (playerLevel: number, mobLevel: number) => playerLevel - mobLevel >= AUTO_BATTLE_LEVEL_GAP;

/** XP for a kill including the Human passive. */
export function killXp(race: RaceId, mobLevel: number, playerLevel: number): number {
  return Math.round(mobXp(mobLevel, playerLevel) * (1 + racialBonuses(race).xp));
}

/**
 * Add XP. `xp` is progress inside the current level; leftovers carry into the
 * next level. At the level cap XP stops counting.
 */
export function applyXp(level: number, xp: number, gained: number): { level: number; xp: number; levelsGained: number } {
  let l = level;
  let x = xp + gained;
  while (l < MAX_LEVEL && x >= xpToNext(l)) {
    x -= xpToNext(l);
    l += 1;
  }
  if (l >= MAX_LEVEL) x = 0;
  return { level: l, xp: x, levelsGained: l - level };
}

/** XP lost on death: a share of the current level's bar, never below 0, never a level. */
export function deathXpLoss(level: number, xp: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.min(xp, Math.floor(xpToNext(level) * DEATH_XP_LOSS));
}

export interface FightResult {
  outcome: "won" | "lost" | "fled";
  xpGained: number;
  xpLost: number;
  levelsGained: number;
  level: number;
  /** What a won fight dropped; `lost` is what did not fit in the bag. */
  loot?: { silver: number; items: NewItem[]; lost: NewItem[] };
  /** Quests the fight moved forward (or, after a loss, set back). */
  quests?: string[];
}

export interface CharacterPatch {
  level: number;
  xp: number;
  hp: number;
  resource: number;
  location?: string;
}

/**
 * What a finished fight does to the character:
 * - won: XP for the kill; a level-up refills HP and Mana;
 * - fled: HP and Mana as they were when the fight ended;
 * - lost: death penalty, respawn in Brackwell with 30% HP and Mana.
 */
export function settleFight(c: CharacterVitals, end: FightState): { patch: CharacterPatch; result: FightResult } {
  if (end.outcome === "ongoing") throw new Error("Fight is not over");
  const mana = (v: number) => (ARCHETYPES[c.archetype].resource === "mana" ? v : 0);
  const hpBonus = c.gear?.hpBonus ?? 0;
  if (end.outcome === "lost") {
    const xpLost = deathXpLoss(c.level, c.xp);
    return {
      patch: {
        level: c.level,
        xp: c.xp - xpLost,
        hp: Math.max(1, Math.round(characterMaxHp(c.race, c.archetype, c.level, hpBonus, c.profession) * RESPAWN_SHARE)),
        resource: Math.round(characterMaxMana(c.race, c.archetype, c.level) * RESPAWN_SHARE),
        location: RESPAWN_NODE,
      },
      result: { outcome: "lost", xpGained: 0, xpLost, levelsGained: 0, level: c.level },
    };
  }
  const xpGained = end.outcome === "won" ? killXp(c.race, end.enemy.level, c.level) : 0;
  const next = applyXp(c.level, c.xp, xpGained);
  const leveled = next.levelsGained > 0;
  return {
    patch: {
      level: next.level,
      xp: next.xp,
      hp: leveled ? characterMaxHp(c.race, c.archetype, next.level, hpBonus, c.profession) : Math.max(1, end.player.hp),
      resource: leveled ? characterMaxMana(c.race, c.archetype, next.level) : mana(end.player.resource),
    },
    result: { outcome: end.outcome, xpGained, xpLost: 0, levelsGained: next.levelsGained, level: next.level },
  };
}

/** Full HP and Mana, as after resting in town. */
export function restedVitals(race: RaceId, archetype: ArchetypeId, level: number, gearHpBonus = 0, profession?: ProfessionId | null) {
  return { hp: characterMaxHp(race, archetype, level, gearHpBonus, profession), resource: characterMaxMana(race, archetype, level) };
}
