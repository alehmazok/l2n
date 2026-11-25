import type { Archetype, ArchetypeId } from "../types.js";

/** Source: docs/design.md, section "Archetypes and professions". */
export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  warrior: {
    id: "warrior",
    name: "Warrior",
    statMods: { might: 4, vitality: 2 },
    mainStat: "might",
    school: "physical",
    baseHp: 60,
    hpPerLevel: 14,
    resource: "focus",
    professions: [
      { id: "vanguard", name: "Vanguard", role: "Durable fighter who outlasts enemies." },
      { id: "reaver", name: "Reaver", role: "Aggressive fighter who trades defence for burst." },
    ],
  },
  mage: {
    id: "mage",
    name: "Mage",
    statMods: { intellect: 4, spirit: 2 },
    mainStat: "intellect",
    school: "magic",
    baseHp: 40,
    hpPerLevel: 9,
    resource: "mana",
    professions: [
      { id: "stormcaller", name: "Stormcaller", role: "Burst caster with high mana costs." },
      { id: "hexbinder", name: "Hexbinder", role: "Attrition caster with curses and drains." },
    ],
  },
};
