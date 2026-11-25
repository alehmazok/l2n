import type { Archetype, ArchetypeId, ProfessionId, ProfessionInfo } from "../types.js";

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
      {
        id: "vanguard",
        name: "Vanguard",
        role: "Durable fighter who outlasts enemies.",
        passive: { name: "Bulwark", description: "+10% max HP and +10% defence." },
        bonuses: { hp: 0.1, defence: 0.1 },
      },
      {
        id: "reaver",
        name: "Reaver",
        role: "Aggressive fighter who trades defence for burst.",
        passive: { name: "Bloodlust", description: "+12% damage dealt, −10% defence." },
        bonuses: { damage: 0.12, defence: -0.1 },
      },
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
      {
        id: "stormcaller",
        name: "Stormcaller",
        role: "Burst caster with high mana costs.",
        passive: { name: "Overcharge", description: "+10% damage dealt." },
        bonuses: { damage: 0.1 },
      },
      {
        id: "hexbinder",
        name: "Hexbinder",
        role: "Attrition caster with curses and drains.",
        passive: { name: "Lingering Malice", description: "+25% damage over time and +5% max HP." },
        bonuses: { dot: 0.25, hp: 0.05 },
      },
    ],
  },
};

export const PROFESSIONS: Record<ProfessionId, ProfessionInfo & { archetype: ArchetypeId }> = Object.fromEntries(
  Object.values(ARCHETYPES).flatMap((a) => a.professions.map((p) => [p.id, { ...p, archetype: a.id }])),
) as Record<ProfessionId, ProfessionInfo & { archetype: ArchetypeId }>;

export const isProfessionId = (v: unknown): v is ProfessionId => typeof v === "string" && Object.hasOwn(PROFESSIONS, v);
