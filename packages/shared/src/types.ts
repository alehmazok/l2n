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
  /** One-line lore note shown at character creation. */
  blurb: string;
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

/**
 * What a skill does. Parts combine: Rending Cut is damage plus a damage over
 * time, Shield Bash is damage plus a stun chance. Riders on a damaging skill
 * (stun, dot) only apply when the hit lands.
 */
export interface SkillEffect {
  /** Direct damage multiplier; `execute` raises it while the target is low. */
  damage?: { power: number; execute?: { belowHpShare: number; power: number } };
  /** Heal as a share of max HP. */
  heal?: number;
  /** Chance that the target loses its next action. */
  stun?: number;
  /** Damage over time: `power` per tick, ticking at the end of `turns` rounds. */
  dot?: { name: "bleed" | "burn"; power: number; turns: number };
  /** A buff on the caster for the rest of this round and the next `turns` rounds. */
  buff?:
    | { kind: "attack_up"; value: number; turns: number }
    | { kind: "guard"; value: number; turns: number }
    | { kind: "shield"; shareOfMaxHp: number; turns: number };
}

export interface Skill {
  id: string;
  name: string;
  archetype: ArchetypeId;
  /** Character level at which the skill is learned. */
  level: number;
  /** Focus points for warriors, mana for mages. */
  cost: number;
  effect: SkillEffect;
  /** One-line rules text for the UI. */
  description: string;
}
