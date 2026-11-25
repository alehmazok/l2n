/**
 * Smithy crafting: what a recipe needs, the success roll, what a failure
 * costs and the rarity of crafted gear. Source: docs/design.md, section
 * "Crafting".
 */
import { itemTemplate, type Rarity } from "./data/items.js";
import type { Recipe } from "./data/recipes.js";
import { craftChance } from "./formulas.js";
import { isEquipment, rollBonus, rollRarity, type Item, type NewItem } from "./items.js";
import { racialBonuses } from "./progression.js";
import { roll, type Rng } from "./rng.js";
import type { RaceId } from "./types.js";

/** Crafted gear rolls rarity a little better than drops: 75% common, 20% uncommon, 5% rare. */
export const CRAFT_RARITY_ODDS: [Rarity, number][] = [
  ["rare", 0.05],
  ["uncommon", 0.2],
  ["common", 0.75],
];

/** Success chance for a character of this race: base plus the Forge-born bonus, clamped to 5–95%. */
export const recipeChance = (recipe: Recipe, race: RaceId) => craftChance(recipe.chance, racialBonuses(race).craft);

/** How many of a stackable item the bag holds. */
export const bagCount = (items: Pick<Item, "templateId" | "quantity" | "location">[], templateId: string) =>
  items.filter((i) => i.location === "bag" && i.templateId === templateId).reduce((n, i) => n + i.quantity, 0);

/** Why a character cannot try a recipe right now, or null if they can. */
export function craftProblem(
  recipe: Recipe,
  c: { recipes: string[]; silver: number },
  items: Pick<Item, "templateId" | "quantity" | "location">[],
): string | null {
  if (!c.recipes.includes(recipe.id)) return `You do not know the recipe for ${recipe.name}.`;
  const missing = recipe.inputs
    .filter((i) => bagCount(items, i.item) < i.quantity)
    .map((i) => `${i.quantity - bagCount(items, i.item)} ${itemTemplate(i.item)?.name ?? i.item}`);
  if (missing.length) return `You need ${missing.join(", ")} more.`;
  if (c.silver < recipe.fee) return `The smith wants ${recipe.fee} silver for the work.`;
  return null;
}

export interface CraftOutcome {
  success: boolean;
  /** What the attempt used up: all inputs on success, half of each (rounded up) on failure. */
  used: { item: string; quantity: number }[];
  /** Items made; empty on failure. */
  made: NewItem[];
}

/** Roll one attempt. The fee is always paid; the caller takes it and the used inputs. */
export function rollCraft(recipe: Recipe, race: RaceId, rng: Rng): CraftOutcome {
  const success = roll(rng, recipeChance(recipe, race));
  if (!success) return { success, used: recipe.inputs.map((i) => ({ item: i.item, quantity: Math.ceil(i.quantity / 2) })), made: [] };
  const made: NewItem[] = recipe.makes.map((m) => {
    const t = itemTemplate(m.item);
    if (isEquipment(t)) {
      const rarity = rollRarity(rng, CRAFT_RARITY_ODDS);
      return { templateId: m.item, itemLevel: recipe.itemLevel, rarity, bonus: rollBonus(rarity, rng), quantity: 1, location: "bag" };
    }
    return { templateId: m.item, itemLevel: null, rarity: null, bonus: null, quantity: m.quantity, location: "bag" };
  });
  return { success, used: recipe.inputs.map((i) => ({ ...i })), made };
}
