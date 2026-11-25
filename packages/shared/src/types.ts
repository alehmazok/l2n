export type StatName = "might" | "agility" | "vitality" | "intellect" | "spirit";
export type Stats = Record<StatName, number>;

export type RaceId = "human" | "dawn_elf" | "dusk_elf" | "orc" | "dwarf";
export type ArchetypeId = "warrior" | "mage";
export type DamageSchool = "physical" | "magic";

export interface Race {
  id: RaceId;
  name: string;
  /** Added to the base of 10 in every stat. */
  statMods: Partial<Stats>;
  passive: { name: string; description: string };
}

export interface Archetype {
  id: ArchetypeId;
  name: string;
  statMods: Partial<Stats>;
  /** Stat that drives attack power. */
  mainStat: "might" | "intellect";
  school: DamageSchool;
  baseHp: number;
  hpPerLevel: number;
  /** Warriors build Focus in combat, mages spend Mana. */
  resource: "focus" | "mana";
  professions: [ProfessionInfo, ProfessionInfo];
}

export interface ProfessionInfo {
  id: string;
  name: string;
  role: string;
}

export type SkillEffect =
  | { kind: "damage"; school: DamageSchool; power: number }
  | { kind: "heal"; percentOfMaxHp: number }
  /** Designed but not yet implemented by the combat engine. */
  | { kind: "planned"; description: string };

export interface Skill {
  id: string;
  name: string;
  archetype: ArchetypeId;
  /** Character level at which the skill is learned. */
  level: number;
  /** Focus points for warriors, mana for mages. */
  cost: number;
  effect: SkillEffect;
}
