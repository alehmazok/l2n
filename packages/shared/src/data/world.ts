/**
 * The world map: a graph of nodes grouped into zones, and the mobs that live
 * on hunting nodes. Source: docs/design.md, section "World".
 */
import type { MobRole } from "../formulas.js";

export type ZoneId = "brackwell" | "mossgate_fields";

export interface Zone {
  id: ZoneId;
  name: string;
  /** Level range of the zone's mobs; null for safe zones. */
  levels: [number, number] | null;
}

export interface MapNode {
  id: string;
  name: string;
  zone: ZoneId;
  /** Town nodes are safe (resting, later shops); hunting nodes have mobs. */
  kind: "town" | "hunt";
  description: string;
  links: string[];
  /** Mob ids that can be met when hunting here. */
  mobs: string[];
  /** Town service that opens in a later stage, shown as "coming soon". */
  service?: string;
}

export interface MobTemplate {
  id: string;
  name: string;
  level: number;
  role: MobRole;
  description: string;
}

export const ZONES: Record<ZoneId, Zone> = {
  brackwell: { id: "brackwell", name: "Brackwell", levels: null },
  mossgate_fields: { id: "mossgate_fields", name: "Mossgate Fields", levels: [1, 7] },
};

export const MOBS: Record<string, MobTemplate> = {
  mire_rat: { id: "mire_rat", name: "Mire Rat", level: 1, role: "normal", description: "A fat rat that lives in the ditches by the road." },
  hedge_crow: { id: "hedge_crow", name: "Hedge Crow", level: 2, role: "normal", description: "Bold, loud and fond of shiny buckles." },
  mangy_cur: { id: "mangy_cur", name: "Mangy Cur", level: 3, role: "normal", description: "A stray dog gone wild since the farms emptied." },
  mill_toad: { id: "mill_toad", name: "Mill Toad", level: 3, role: "normal", description: "A toad the size of a bucket, sitting in the millrace." },
  silt_crawler: { id: "silt_crawler", name: "Silt Crawler", level: 4, role: "normal", description: "A pale, many-legged thing from the flooded cellar." },
  drowned_scavenger: { id: "drowned_scavenger", name: "Drowned Scavenger", level: 5, role: "normal", description: "Something that was once a looter, still looking for coin." },
  burrow_mole: { id: "burrow_mole", name: "Burrow Mole", level: 5, role: "normal", description: "Blind, clawed and very territorial." },
  tusked_digger: { id: "tusked_digger", name: "Tusked Digger", level: 6, role: "normal", description: "A tunnelling boar with a bad temper." },
  burrow_hulk: { id: "burrow_hulk", name: "Burrow Hulk", level: 7, role: "normal", description: "An old digger grown huge in the dark." },
};

export const START_NODE = "brackwell_square";
export const RESPAWN_NODE = "brackwell_square";

export const NODES: Record<string, MapNode> = {
  brackwell_square: {
    id: "brackwell_square",
    name: "Brackwell Square",
    zone: "brackwell",
    kind: "town",
    description: "A muddy square around a dead lantern post. Wayfarers rest here between hunts.",
    links: ["brackwell_market", "brackwell_smithy", "brackwell_warehouse", "brackwell_notice_board", "mossgate_old_road"],
    mobs: [],
  },
  brackwell_market: {
    id: "brackwell_market",
    name: "Market",
    zone: "brackwell",
    kind: "town",
    description: "Three stalls and a cart. The traders are still unpacking.",
    links: ["brackwell_square"],
    mobs: [],
    service: "Shop",
  },
  brackwell_smithy: {
    id: "brackwell_smithy",
    name: "Smithy",
    zone: "brackwell",
    kind: "town",
    description: "The forge is warm, but the smith is not taking orders yet.",
    links: ["brackwell_square"],
    mobs: [],
    service: "Crafting",
  },
  brackwell_warehouse: {
    id: "brackwell_warehouse",
    name: "Warehouse",
    zone: "brackwell",
    kind: "town",
    description: "A barn with numbered stalls and a keeper who counts everything twice.",
    links: ["brackwell_square"],
    mobs: [],
    service: "Warehouse",
  },
  brackwell_notice_board: {
    id: "brackwell_notice_board",
    name: "Notice Board",
    zone: "brackwell",
    kind: "town",
    description: "Bounties and pleas pinned three deep. Most are too faded to read.",
    links: ["brackwell_square"],
    mobs: [],
    service: "Quests",
  },
  mossgate_old_road: {
    id: "mossgate_old_road",
    name: "Old Road",
    zone: "mossgate_fields",
    kind: "hunt",
    description: "The cracked road out of Brackwell, overgrown at the edges. Vermin everywhere.",
    links: ["brackwell_square", "mossgate_drowned_mill"],
    mobs: ["mire_rat", "hedge_crow", "mangy_cur"],
  },
  mossgate_drowned_mill: {
    id: "mossgate_drowned_mill",
    name: "Drowned Mill",
    zone: "mossgate_fields",
    kind: "hunt",
    description: "The river took the mill wheel years ago. Things live in the flooded floor now.",
    links: ["mossgate_old_road", "mossgate_burrows"],
    mobs: ["mill_toad", "silt_crawler", "drowned_scavenger"],
  },
  mossgate_burrows: {
    id: "mossgate_burrows",
    name: "Burrows",
    zone: "mossgate_fields",
    kind: "hunt",
    description: "A hillside riddled with tunnels. Something large digs deeper every night.",
    links: ["mossgate_drowned_mill"],
    mobs: ["burrow_mole", "tusked_digger", "burrow_hulk"],
  },
};

/** Level range of a hunting node, from its mobs. */
export function nodeLevels(node: MapNode): [number, number] | null {
  if (node.mobs.length === 0) return null;
  const levels = node.mobs.map((m) => MOBS[m]!.level);
  return [Math.min(...levels), Math.max(...levels)];
}

/** Relative chance to meet a mob: mobs above your level show up less often. */
export function encounterWeight(mobLevel: number, playerLevel: number): number {
  const diff = mobLevel - playerLevel;
  return diff <= 0 ? 3 : diff === 1 ? 2 : 1;
}

/** Pick the mob met when hunting on `node`; `r` is a float in [0, 1). */
export function pickEncounter(node: MapNode, playerLevel: number, r: number): MobTemplate {
  const mobs = node.mobs.map((id) => MOBS[id]!);
  if (mobs.length === 0) throw new Error(`Nothing to hunt at ${node.id}`);
  const weights = mobs.map((m) => encounterWeight(m.level, playerLevel));
  let x = r * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < mobs.length; i++) {
    x -= weights[i]!;
    if (x < 0) return mobs[i]!;
  }
  return mobs[mobs.length - 1]!;
}
