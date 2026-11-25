/**
 * Larger art: mobs, node scenes and character portraits, WebP files generated
 * with Venice (see `assets/art/manifest.json`). A file's name is the id of the
 * mob, the node, or the race and archetype pair. Art is added in batches, so
 * every lookup has a fallback and the game never depends on a picture.
 */
import type { ArchetypeId, RaceId } from "@l2n/shared";
import { esc } from "./ui.js";

const files = import.meta.glob<string>("./assets/art/*/*.webp", { eager: true, query: "?no-inline", import: "default" });

/** Folder ("mobs", "scenes", "portraits") to id to URL. */
export const ART: Record<string, Record<string, string>> = {};
for (const [path, url] of Object.entries(files)) {
  const [folder, file] = path.split("/").slice(-2) as [string, string];
  (ART[folder] ??= {})[file.slice(0, -".webp".length)] = url;
}

export const mobArt = (mobId: string) => ART.mobs?.[mobId];
export const sceneArt = (nodeId: string) => ART.scenes?.[nodeId];
export const portraitArt = (race: RaceId, archetype: ArchetypeId) => ART.portraits?.[`${race}_${archetype}`];

/** A character's portrait; until its art exists, the first letter of `label` on a tile tinted by race. */
export function portrait(race: RaceId, archetype: ArchetypeId, label: string, extra = "") {
  const url = portraitArt(race, archetype);
  // Build-time URLs from Vite, never user input, so they need no escaping.
  const inner = url ? `<img src="${url}" alt="" decoding="async" />` : esc(label.charAt(0));
  return `<span class="portrait portrait-${race} ${extra}" aria-hidden="true">${inner}</span>`;
}
