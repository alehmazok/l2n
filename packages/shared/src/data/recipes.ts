/**
 * Smithy recipes. Source: docs/design.md, section "Crafting". The rules
 * (success chance, failure losses, rarity of crafted gear) are in
 * packages/shared/src/crafting.ts.
 *
 * This file imports only types from items.ts, so items.ts can build recipe
 * items from it without a cycle.
 */
import type { ArchetypeId } from "../types.js";

export interface Recipe {
  id: string;
  /** What the recipe makes, as shown in "Recipe: …". */
  name: string;
  /** Base success chance before bonuses. */
  chance: number;
  /** Silver paid to the smith for every attempt. */
  fee: number;
  inputs: { item: string; quantity: number }[];
  /** Items made on success. Equipment is made at `itemLevel`, each piece rolling its own rarity. */
  makes: { item: string; quantity: number }[];
  itemLevel: number | null;
  /** Gear recipes are for one archetype. */
  archetype?: ArchetypeId;
  /** Silver the smithy asks for the recipe, or null if it is not sold (dropped or given by a quest). */
  price: number | null;
  /** Value of the recipe item, for selling. */
  value: number;
}

const ARMOUR = ["head", "chest", "legs", "gloves", "boots"] as const;
const set = (grade: string, archetype: ArchetypeId) => ARMOUR.map((slot) => ({ item: `${grade}_${archetype}_${slot}`, quantity: 1 }));
const one = (item: string, quantity = 1) => [{ item, quantity }];
const ins = (o: Record<string, number>) => Object.entries(o).map(([item, quantity]) => ({ item, quantity }));

/** Item level of crafted gear for each grade. */
export const CRAFTED_ITEM_LEVEL = { ironbound: 8, steelsworn: 18 } as const;

const LIST: Recipe[] = [
  // Tier I supplies.
  { id: "whetstones_1", name: "Whetstones (I) ×25", chance: 0.9, fee: 20, inputs: ins({ iron_scrap: 2, resin_lump: 1 }), makes: one("whetstone_1", 25), itemLevel: null, price: 40, value: 40 },
  { id: "ember_vials_1", name: "Ember Vials (I) ×25", chance: 0.9, fee: 20, inputs: ins({ resin_lump: 2, marsh_herb: 1 }), makes: one("ember_vial_1", 25), itemLevel: null, price: 40, value: 40 },
  { id: "healing_draughts", name: "Healing Draughts ×3", chance: 0.85, fee: 5, inputs: ins({ marsh_herb: 2, bone_shard: 1 }), makes: one("healing_draught", 3), itemLevel: null, price: 50, value: 50 },
  { id: "mana_draughts", name: "Mana Draughts ×3", chance: 0.85, fee: 5, inputs: ins({ marsh_herb: 1, resin_lump: 2 }), makes: one("mana_draught", 3), itemLevel: null, price: 50, value: 50 },
  // Ironbound gear, item level 8.
  { id: "ironbound_sword", name: "Ironbound Sword", chance: 0.7, fee: 60, inputs: ins({ iron_scrap: 6, bone_shard: 2, rough_hide: 2 }), makes: one("ironbound_warrior_weapon"), itemLevel: CRAFTED_ITEM_LEVEL.ironbound, archetype: "warrior", price: 150, value: 150 },
  { id: "ironbound_staff", name: "Ironbound Staff", chance: 0.7, fee: 60, inputs: ins({ resin_lump: 5, bone_shard: 3, marsh_herb: 2 }), makes: one("ironbound_mage_weapon"), itemLevel: CRAFTED_ITEM_LEVEL.ironbound, archetype: "mage", price: 150, value: 150 },
  { id: "ironbound_mail", name: "Ironbound Mail Set", chance: 0.7, fee: 120, inputs: ins({ iron_scrap: 8, rough_hide: 6, bone_shard: 2 }), makes: set("ironbound", "warrior"), itemLevel: CRAFTED_ITEM_LEVEL.ironbound, archetype: "warrior", price: 250, value: 250 },
  { id: "ironbound_robes", name: "Ironbound Robe Set", chance: 0.7, fee: 120, inputs: ins({ rough_hide: 6, marsh_herb: 4, resin_lump: 4 }), makes: set("ironbound", "mage"), itemLevel: CRAFTED_ITEM_LEVEL.ironbound, archetype: "mage", price: 250, value: 250 },
  // Tier II supplies.
  { id: "whetstones_2", name: "Whetstones (II) ×25", chance: 0.8, fee: 50, inputs: ins({ iron_scrap: 2, heartwood: 1 }), makes: one("whetstone_2", 25), itemLevel: null, price: 200, value: 200 },
  { id: "ember_vials_2", name: "Ember Vials (II) ×25", chance: 0.8, fee: 50, inputs: ins({ glowcap: 2, resin_lump: 1 }), makes: one("ember_vial_2", 25), itemLevel: null, price: 200, value: 200 },
  // Steelsworn gear, item level 18. These recipes only drop from elites and the Ashen Warden.
  { id: "steelsworn_blade", name: "Steelsworn Blade", chance: 0.55, fee: 300, inputs: ins({ grave_iron: 6, heartwood: 3, thick_pelt: 2 }), makes: one("steelsworn_warrior_weapon"), itemLevel: CRAFTED_ITEM_LEVEL.steelsworn, archetype: "warrior", price: null, value: 400 },
  { id: "steelsworn_staff", name: "Steelsworn Staff", chance: 0.55, fee: 300, inputs: ins({ heartwood: 5, ember_shard: 3, spider_silk: 2 }), makes: one("steelsworn_mage_weapon"), itemLevel: CRAFTED_ITEM_LEVEL.steelsworn, archetype: "mage", price: null, value: 400 },
  { id: "steelsworn_plate", name: "Steelsworn Plate Set", chance: 0.55, fee: 600, inputs: ins({ grave_iron: 10, thick_pelt: 6, ash_dust: 4 }), makes: set("steelsworn", "warrior"), itemLevel: CRAFTED_ITEM_LEVEL.steelsworn, archetype: "warrior", price: null, value: 400 },
  { id: "steelsworn_vestments", name: "Steelsworn Vestments Set", chance: 0.55, fee: 600, inputs: ins({ spider_silk: 10, ember_shard: 4, ash_dust: 4 }), makes: set("steelsworn", "mage"), itemLevel: CRAFTED_ITEM_LEVEL.steelsworn, archetype: "mage", price: null, value: 400 },
  // Quest item for the profession chain (its recipe is handed out by the quest in stage 5).
  { id: "lantern_ward_charm", name: "Lantern Ward Charm", chance: 0.6, fee: 100, inputs: ins({ ember_shard: 2, ash_dust: 2, spider_silk: 2, heartwood: 2 }), makes: one("lantern_ward_charm"), itemLevel: null, price: null, value: 0 },
];

export const RECIPES: Record<string, Recipe> = Object.fromEntries(LIST.map((r) => [r.id, r]));

export const recipeItemId = (recipeId: string) => `recipe_${recipeId}`;

export const recipeById = (id: string): Recipe | undefined => (Object.hasOwn(RECIPES, id) ? RECIPES[id] : undefined);
