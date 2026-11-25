/**
 * Core balance formulas. Every number here is documented in docs/design.md,
 * section "Formulas". Change both together.
 */
import { ARCHETYPES } from "./data/archetypes.js";
import { RACES } from "./data/races.js";
import type { ArchetypeId, RaceId, StatName, Stats } from "./types.js";

export const MAX_LEVEL = 20;
export const BASE_STAT = 10;
export const MAX_FOCUS = 5;

const STAT_NAMES: StatName[] = ["might", "agility", "vitality", "intellect", "spirit"];

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Stat modifier: each point above 10 is worth `perPoint` (e.g. 0.04 = +4%). */
const statScale = (stat: number, perPoint: number) => 1 + (stat - BASE_STAT) * perPoint;

export function characterStats(race: RaceId, archetype: ArchetypeId): Stats {
  const r = RACES[race].statMods;
  const a = ARCHETYPES[archetype].statMods;
  const out = {} as Stats;
  for (const s of STAT_NAMES) out[s] = BASE_STAT + (r[s] ?? 0) + (a[s] ?? 0);
  return out;
}

/** Experience needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return (8 + 2 * level) * (10 + 6 * level);
}

/** Experience for killing a mob, scaled by level difference. */
export function mobXp(mobLevel: number, playerLevel: number): number {
  const diff = mobLevel - playerLevel;
  const mult = clamp(1 + 0.1 * diff, 0.1, 1.3);
  return Math.round((10 + 6 * mobLevel) * mult);
}

export function maxHp(archetype: ArchetypeId, level: number, vitality: number): number {
  const a = ARCHETYPES[archetype];
  return Math.round((a.baseHp + a.hpPerLevel * (level - 1)) * statScale(vitality, 0.04));
}

export function maxMana(level: number, spirit: number): number {
  return Math.round((30 + 6 * (level - 1)) * statScale(spirit, 0.04));
}

/** Mana regained at the start of each of the mage's turns. */
export const manaRegen = (max: number) => Math.max(1, Math.round(max * 0.05));

export function attackPower(level: number, mainStat: number, weaponPower: number): number {
  return (4 + 2 * level) * statScale(mainStat, 0.04) + weaponPower;
}

export function defensePower(level: number, vitality: number, armour: number): number {
  return (2 + 1.5 * level) * statScale(vitality, 0.02) + armour;
}

/**
 * Damage before variance and crit. atk^2 / (atk + def) never reaches zero and
 * makes defence matter more against weak attackers than strong ones.
 */
export function baseDamage(atk: number, def: number, power = 1): number {
  if (atk <= 0) return 0;
  return ((atk * atk) / (atk + def)) * power;
}

export function hitChance(attackerAgi: number, defenderAgi: number, levelDiff: number): number {
  return clamp(0.92 + (attackerAgi - defenderAgi) * 0.01 + levelDiff * 0.02, 0.6, 0.99);
}

export function critChance(agility: number, bonus = 0): number {
  return clamp(0.05 + (agility - BASE_STAT) * 0.005 + bonus, 0.01, 0.3);
}

export function fleeChance(playerAgi: number, enemyAgi: number): number {
  return clamp(0.5 + (playerAgi - enemyAgi) * 0.02, 0.05, 0.95);
}

export const CRIT_MULTIPLIER = 1.75;
/** Bonus to basic attacks while a charge (whetstone or ember vial) is active. */
export const CHARGE_MULTIPLIER = 1.3;

/** Mob templates: stats derived from level and role. */
export type MobRole = "normal" | "elite" | "boss";
const ROLE: Record<MobRole, { hp: number; atk: number; def: number }> = {
  normal: { hp: 1, atk: 1, def: 1 },
  elite: { hp: 2.2, atk: 1.25, def: 1.2 },
  boss: { hp: 6, atk: 1.5, def: 1.4 },
};

export function mobStats(level: number, role: MobRole = "normal") {
  const r = ROLE[role];
  return {
    hp: Math.round((20 + 12 * level) * r.hp),
    atk: (6 + 2.5 * level) * r.atk,
    def: (2 + 1.5 * level) * r.def,
    agility: BASE_STAT,
  };
}

/** Gear stat budgets by tier (see design doc, "Items"). */
export function weaponPowerFor(tier: 1 | 2, itemLevel: number): number {
  return tier === 1 ? 4 + itemLevel : 8 + itemLevel;
}
export function armourFor(tier: 1 | 2, itemLevel: number): number {
  return tier === 1 ? 2 + 0.8 * itemLevel : 4 + 0.8 * itemLevel;
}
export const RARITY_MULTIPLIER = { common: 1, uncommon: 1.08, rare: 1.16 } as const;

/** Crafting success chance, clamped to [5%, 95%]. */
export function craftChance(base: number, bonus = 0): number {
  return clamp(base + bonus, 0.05, 0.95);
}

/** Death penalty: share of the current level's XP bar lost. Never drops a level. */
export const DEATH_XP_LOSS = 0.04;
/** After death the character respawns in Brackwell with this share of max HP and Mana. */
export const RESPAWN_SHARE = 0.3;
/** Auto-battle is allowed against mobs at least this many levels below the player. */
export const AUTO_BATTLE_LEVEL_GAP = 4;
