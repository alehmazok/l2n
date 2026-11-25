import type { Skill } from "../types.js";

/** Source: docs/design.md, section "Skills". */
export const SKILLS: Skill[] = [
  // Warrior: costs are Focus points (max 5).
  { id: "heavy_blow", name: "Heavy Blow", archetype: "warrior", level: 1, cost: 2, effect: { kind: "damage", school: "physical", power: 1.8 } },
  { id: "shield_bash", name: "Shield Bash", archetype: "warrior", level: 4, cost: 2, effect: { kind: "planned", description: "0.8x damage, 50% chance to stun for 1 turn." } },
  { id: "war_cry", name: "War Cry", archetype: "warrior", level: 7, cost: 1, effect: { kind: "planned", description: "+20% attack for 3 turns." } },
  { id: "rending_cut", name: "Rending Cut", archetype: "warrior", level: 10, cost: 3, effect: { kind: "planned", description: "1.0x damage plus bleed 0.4x for 3 turns." } },
  { id: "second_wind", name: "Second Wind", archetype: "warrior", level: 13, cost: 4, effect: { kind: "heal", percentOfMaxHp: 0.25 } },
  { id: "iron_stance", name: "Iron Stance", archetype: "warrior", level: 16, cost: 2, effect: { kind: "planned", description: "-35% damage taken for 2 turns." } },
  { id: "finishing_strike", name: "Finishing Strike", archetype: "warrior", level: 19, cost: 5, effect: { kind: "planned", description: "2.0x damage, 3.5x if target is below 30% HP." } },

  // Mage: costs are Mana.
  { id: "ember_bolt", name: "Ember Bolt", archetype: "mage", level: 1, cost: 8, effect: { kind: "damage", school: "magic", power: 1.6 } },
  { id: "frost_shackle", name: "Frost Shackle", archetype: "mage", level: 4, cost: 10, effect: { kind: "planned", description: "0.8x damage, target loses its next action with 40% chance." } },
  { id: "arcane_ward", name: "Arcane Ward", archetype: "mage", level: 7, cost: 14, effect: { kind: "planned", description: "Absorbs damage equal to 20% of max HP for 3 turns." } },
  { id: "searing_brand", name: "Searing Brand", archetype: "mage", level: 10, cost: 16, effect: { kind: "planned", description: "Burn 0.6x per turn for 4 turns." } },
  { id: "mend", name: "Mend", archetype: "mage", level: 13, cost: 18, effect: { kind: "heal", percentOfMaxHp: 0.3 } },
  { id: "chain_spark", name: "Chain Spark", archetype: "mage", level: 16, cost: 24, effect: { kind: "damage", school: "magic", power: 2.1 } },
  { id: "falling_star", name: "Falling Star", archetype: "mage", level: 19, cost: 40, effect: { kind: "damage", school: "magic", power: 2.6 } },
];

export function skillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}
