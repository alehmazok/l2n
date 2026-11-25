/**
 * Icons for items and skills: small WebP files generated with Venice (see
 * `assets/icons/manifest.json` for the prompt, model and settings of each, so
 * they can be made again with a better model). An icon's file name is its id.
 */
import { itemTemplate, type NewItem } from "@l2n/shared";

const files = import.meta.glob<string>("./assets/icons/*.webp", { eager: true, query: "?no-inline", import: "default" });

/** Icon id to URL. */
export const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -".webp".length), url]),
);

/** Every recipe item shares one scroll icon; everything else has its own, named like its template. */
export const itemIconId = (templateId: string) => (itemTemplate(templateId)?.kind === "recipe" ? "recipe" : templateId);

const img = (id: string) => {
  const url = ICONS[id];
  // Build-time URLs from Vite, never user input, so they need no escaping.
  return url ? `<img src="${url}" alt="" loading="lazy" decoding="async" />` : "?";
};

/** An item's icon, edged by rarity. */
export function itemIcon(i: Pick<NewItem, "templateId" | "rarity">) {
  const kind = itemTemplate(i.templateId)?.kind ?? "unknown";
  return `<span class="icon icon-${kind} rarity-${i.rarity ?? "common"}" aria-hidden="true">${img(itemIconId(i.templateId))}</span>`;
}

/** The recipe scroll on its own, for recipe book lines. */
export const recipeIcon = () => `<span class="icon icon-recipe" aria-hidden="true">${img("recipe")}</span>`;

/** A skill's icon. */
export const skillIcon = (skillId: string) => `<span class="icon icon-skill" aria-hidden="true">${img(skillId)}</span>`;
