import type { Skill } from "../types.js";

/** Source: docs/design.md, section "Skills". */
export const SKILLS: Skill[] = [
  // Warrior: costs are Focus points (max 5).
  { id: "heavy_blow", name: "Heavy Blow", archetype: "warrior", level: 1, cost: 2, effect: { damage: { power: 1.8 } }, description: "1.8x damage." },
  { id: "shield_bash", name: "Shield Bash", archetype: "warrior", level: 4, cost: 2, effect: { damage: { power: 0.8 }, stun: 0.5 }, description: "0.8x damage, 50% chance to stun for 1 turn." },
  { id: "war_cry", name: "War Cry", archetype: "warrior", level: 7, cost: 1, effect: { buff: { kind: "attack_up", value: 0.2, turns: 3 } }, description: "+20% attack for 3 turns." },
  { id: "rending_cut", name: "Rending Cut", archetype: "warrior", level: 10, cost: 3, effect: { damage: { power: 1 }, dot: { name: "bleed", power: 0.4, turns: 3 } }, description: "1.0x damage, then bleed for 0.4x for 3 turns." },
  { id: "second_wind", name: "Second Wind", archetype: "warrior", level: 13, cost: 4, effect: { heal: 0.25 }, description: "Heal 25% of max HP." },
  { id: "iron_stance", name: "Iron Stance", archetype: "warrior", level: 16, cost: 2, effect: { buff: { kind: "guard", value: 0.35, turns: 2 } }, description: "-35% damage taken for 2 turns." },
  { id: "finishing_strike", name: "Finishing Strike", archetype: "warrior", level: 19, cost: 5, effect: { damage: { power: 2, execute: { belowHpShare: 0.3, power: 3.5 } } }, description: "2.0x damage, 3.5x if the target is below 30% HP." },

  // Mage: costs are Mana.
  { id: "ember_bolt", name: "Ember Bolt", archetype: "mage", level: 1, cost: 8, effect: { damage: { power: 1.6 } }, description: "1.6x magic damage." },
  { id: "frost_shackle", name: "Frost Shackle", archetype: "mage", level: 4, cost: 10, effect: { damage: { power: 0.8 }, stun: 0.4 }, description: "0.8x damage, 40% chance the target loses its next action." },
  { id: "arcane_ward", name: "Arcane Ward", archetype: "mage", level: 7, cost: 14, effect: { buff: { kind: "shield", shareOfMaxHp: 0.2, turns: 3 } }, description: "Absorbs damage equal to 20% of max HP for 3 turns." },
  { id: "searing_brand", name: "Searing Brand", archetype: "mage", level: 10, cost: 16, effect: { dot: { name: "burn", power: 0.6, turns: 4 } }, description: "Burn for 0.6x per turn for 4 turns." },
  { id: "mend", name: "Mend", archetype: "mage", level: 13, cost: 18, effect: { heal: 0.3 }, description: "Heal 30% of max HP." },
  { id: "chain_spark", name: "Chain Spark", archetype: "mage", level: 16, cost: 24, effect: { damage: { power: 2.1 } }, description: "2.1x magic damage." },
  { id: "falling_star", name: "Falling Star", archetype: "mage", level: 19, cost: 40, effect: { damage: { power: 2.6 } }, description: "2.6x magic damage." },
];

export function skillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}
