import type { Race, RaceId } from "../types.js";

/** Source: docs/design.md, section "Races". */
export const RACES: Record<RaceId, Race> = {
  human: {
    id: "human",
    name: "Human",
    statMods: { might: 1, agility: 1, vitality: 1, intellect: 1, spirit: 1 },
    passive: { name: "Restless", description: "+5% experience from all sources." },
    blurb: "Rebuilt fastest after the Dimming. Adaptable, ambitious, impatient.",
  },
  dawn_elf: {
    id: "dawn_elf",
    name: "Dawn Elf",
    statMods: { agility: 3, intellect: 1, spirit: 2, vitality: -1 },
    passive: { name: "Keen Sight", description: "+3% critical chance." },
    blurb: "Keepers of the old forest shrines and their small lanterns. Graceful and precise.",
  },
  dusk_elf: {
    id: "dusk_elf",
    name: "Dusk Elf",
    statMods: { agility: 2, intellect: 3, might: 1, vitality: -1, spirit: -1 },
    passive: { name: "Nightblood", description: "+5% damage dealt." },
    blurb: "Broke from their kin to learn magic the Compact forbade. Proud, sharp, distrusted.",
  },
  orc: {
    id: "orc",
    name: "Orc",
    statMods: { might: 3, vitality: 3, agility: -1, intellect: -1 },
    passive: { name: "Thick Hide", description: "+8% maximum HP." },
    blurb: "Clans of the high steppe who honour strength and debt, and kept their oaths.",
  },
  dwarf: {
    id: "dwarf",
    name: "Dwarf",
    statMods: { might: 2, vitality: 3, spirit: 1, agility: -2 },
    passive: { name: "Forge-born", description: "+5% crafting success, +10% resource drops." },
    blurb: "Guild-folk of the deep halls who made the lanterns, and want to know why they failed.",
  },
};
