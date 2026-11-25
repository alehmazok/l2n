/**
 * Item templates: equipment, charges, draughts and resources.
 * Source: docs/design.md, section "Items". Equipment stats are not written
 * here; they come from the tier formulas and the item level of each copy.
 */
import type { ArchetypeId } from "../types.js";
import { RECIPES, recipeItemId } from "./recipes.js";

export type Slot = "weapon" | "head" | "chest" | "legs" | "gloves" | "boots";
export const SLOTS: Slot[] = ["weapon", "head", "chest", "legs", "gloves", "boots"];
export type ArmourSlot = Exclude<Slot, "weapon">;

/** Share of a full set's armour carried by each piece. Sums to 1. */
export const ARMOUR_SHARE: Record<ArmourSlot, number> = { head: 0.15, chest: 0.35, legs: 0.25, gloves: 0.125, boots: 0.125 };

export type Tier = 1 | 2;
export interface TierInfo {
  tier: Tier;
  id: string;
  name: string;
  /** Lowest character level that can wear the grade. */
  level: number;
  /** Item levels the grade covers. */
  itemLevels: [number, number];
}
export const TIERS: Record<Tier, TierInfo> = {
  1: { tier: 1, id: "ironbound", name: "Ironbound", level: 1, itemLevels: [1, 9] },
  2: { tier: 2, id: "steelsworn", name: "Steelsworn", level: 10, itemLevels: [10, 20] },
};
export const tierForItemLevel = (itemLevel: number): Tier => (itemLevel >= TIERS[2].itemLevels[0] ? 2 : 1);

export type Rarity = "common" | "uncommon" | "rare";
export const RARITIES: Rarity[] = ["common", "uncommon", "rare"];
export const RARITY_NAMES: Record<Rarity, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare" };

/** The extra roll a rare item carries. */
export type RareBonus = "crit" | "hp";
export const RARE_BONUSES: Record<RareBonus, { value: number; label: string }> = {
  crit: { value: 0.02, label: "+2% crit chance" },
  hp: { value: 0.03, label: "+3% max HP" },
};

interface BaseTemplate {
  id: string;
  name: string;
  description: string;
}
export interface EquipmentTemplate extends BaseTemplate {
  kind: "equipment";
  slot: Slot;
  tier: Tier;
  archetype: ArchetypeId;
}
export interface ChargeTemplate extends BaseTemplate {
  kind: "charge";
  tier: Tier;
  archetype: ArchetypeId;
  /** Shop price of one charge in silver. */
  value: number;
}
export type DraughtId = "healing_draught" | "mana_draught";
export interface DraughtTemplate extends BaseTemplate {
  kind: "draught";
  id: DraughtId;
  restores: "hp" | "mana";
  value: number;
}
export interface ResourceTemplate extends BaseTemplate {
  kind: "resource";
  value: number;
}
/** A smithy recipe; learning it (from the bag) adds it to the character's recipe book. */
export interface RecipeTemplate extends BaseTemplate {
  kind: "recipe";
  /** Id in RECIPES (data/recipes.ts). */
  recipe: string;
  /** Recipes for one archetype's gear only drop for that archetype. */
  archetype?: ArchetypeId;
  value: number;
}
/** Quest items: kept, never sold. */
export interface QuestTemplate extends BaseTemplate {
  kind: "quest";
  value: number;
}
export type ItemTemplate = EquipmentTemplate | ChargeTemplate | DraughtTemplate | ResourceTemplate | RecipeTemplate | QuestTemplate;

const EQUIPMENT_NAMES: Record<Tier, Record<ArchetypeId, Record<Slot, string>>> = {
  1: {
    warrior: { weapon: "Sword", head: "Helm", chest: "Hauberk", legs: "Greaves", gloves: "Gauntlets", boots: "Boots" },
    mage: { weapon: "Staff", head: "Hood", chest: "Robe", legs: "Breeches", gloves: "Gloves", boots: "Shoes" },
  },
  2: {
    warrior: { weapon: "Blade", head: "Helm", chest: "Cuirass", legs: "Greaves", gloves: "Gauntlets", boots: "Sabatons" },
    mage: { weapon: "Staff", head: "Cowl", chest: "Vestments", legs: "Leggings", gloves: "Gloves", boots: "Boots" },
  },
};
const TIER_FLAVOUR: Record<Tier, string> = {
  1: "Plain frontier work, riveted and patched.",
  2: "Smith-stamped steel, sworn to hold.",
};

/** Equipment template id, e.g. `ironbound_warrior_weapon`. */
export const equipmentId = (tier: Tier, archetype: ArchetypeId, slot: Slot) => `${TIERS[tier].id}_${archetype}_${slot}`;

function equipment(): EquipmentTemplate[] {
  const out: EquipmentTemplate[] = [];
  for (const tier of [1, 2] as Tier[])
    for (const archetype of ["warrior", "mage"] as ArchetypeId[])
      for (const slot of SLOTS)
        out.push({
          id: equipmentId(tier, archetype, slot),
          name: `${TIERS[tier].name} ${EQUIPMENT_NAMES[tier][archetype][slot]}`,
          kind: "equipment",
          slot,
          tier,
          archetype,
          description: TIER_FLAVOUR[tier],
        });
  return out;
}

/** Charge template for an archetype and tier: whetstones for warriors, ember vials for mages. */
export const chargeId = (archetype: ArchetypeId, tier: Tier) => `${archetype === "warrior" ? "whetstone" : "ember_vial"}_${tier}`;

const OTHER: ItemTemplate[] = [
  { id: "whetstone_1", name: "Whetstone (I)", kind: "charge", tier: 1, archetype: "warrior", value: 2, description: "Sharpens one basic attack with an Ironbound weapon: ×1.3 damage." },
  { id: "whetstone_2", name: "Whetstone (II)", kind: "charge", tier: 2, archetype: "warrior", value: 5, description: "Sharpens one basic attack with a Steelsworn weapon: ×1.3 damage." },
  { id: "ember_vial_1", name: "Ember Vial (I)", kind: "charge", tier: 1, archetype: "mage", value: 2, description: "Feeds one damaging spell cast with an Ironbound staff: ×1.3 damage." },
  { id: "ember_vial_2", name: "Ember Vial (II)", kind: "charge", tier: 2, archetype: "mage", value: 4, description: "Feeds one damaging spell cast with a Steelsworn staff: ×1.3 damage." },
  { id: "healing_draught", name: "Healing Draught", kind: "draught", restores: "hp", value: 10, description: "Restores 30% of max HP. In a fight it takes your turn." },
  { id: "mana_draught", name: "Mana Draught", kind: "draught", restores: "mana", value: 10, description: "Restores 30% of max Mana. In a fight it takes your turn." },
  { id: "rough_hide", name: "Rough Hide", kind: "resource", value: 4, description: "Scraped from field beasts. Leatherworkers want it." },
  { id: "bone_shard", name: "Bone Shard", kind: "resource", value: 4, description: "Splintered bone, good for handles and charms." },
  { id: "iron_scrap", name: "Iron Scrap", kind: "resource", value: 6, description: "Bent nails, buckles and broken blades. The smith melts it down." },
  { id: "resin_lump", name: "Resin Lump", kind: "resource", value: 5, description: "Sticky pitch from old timbers. Burns slow and hot." },
  { id: "marsh_herb", name: "Marsh Herb", kind: "resource", value: 5, description: "A bitter green that grows by still water. Brewers use it." },
  { id: "thick_pelt", name: "Thick Pelt", kind: "resource", value: 7, description: "A heavy forest hide, tough enough for straps and padding." },
  { id: "heartwood", name: "Heartwood", kind: "resource", value: 7, description: "Dense, dark wood from the heart of an old tree." },
  { id: "spider_silk", name: "Spider Silk", kind: "resource", value: 8, description: "Strong grey thread, spun from the webs of Spider Dell." },
  { id: "glowcap", name: "Glowcap", kind: "resource", value: 8, description: "A mushroom that glows faintly blue. Mages brew it." },
  { id: "ash_dust", name: "Ash Dust", kind: "resource", value: 9, description: "Fine grey ash from the barrows. It never quite goes cold." },
  { id: "grave_iron", name: "Grave Iron", kind: "resource", value: 12, description: "Old iron from burial goods, dark and hard." },
  { id: "ember_shard", name: "Ember Shard", kind: "resource", value: 12, description: "A splinter of glassy stone with a spark trapped inside." },
  { id: "lantern_ward_charm", name: "Lantern Ward Charm", kind: "quest", value: 0, description: "A small lantern of glass and grave iron. It is said to keep the dark at bay." },
  { id: "millers_ledger", name: "Miller's Ledger", kind: "quest", value: 0, description: "A swollen account book from the Drowned Mill. Most of the names can still be read." },
  { id: "dimmed_relic", name: "Dimmed Relic", kind: "quest", value: 0, description: "A lantern fitting of old dwarf work, cold and black. Something drained it." },
];

/** Recipe items, one per recipe; see data/recipes.ts. */
function recipeItems(): RecipeTemplate[] {
  return Object.values(RECIPES).map((r) => ({
    id: recipeItemId(r.id),
    name: `Recipe: ${r.name}`,
    kind: "recipe",
    recipe: r.id,
    ...(r.archetype ? { archetype: r.archetype } : {}),
    value: r.value,
    description: `Teaches the smithy recipe for ${r.name}. Learn it from your bag.`,
  }));
}

export const ITEMS: Record<string, ItemTemplate> = Object.fromEntries([...equipment(), ...OTHER, ...recipeItems()].map((t) => [t.id, t]));

export const itemTemplate = (id: string): ItemTemplate | undefined => (Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined);

export const isStackable = (t: ItemTemplate) => t.kind !== "equipment";
