/**
 * The world map: a graph of nodes grouped into zones, and the mobs that live
 * on hunting nodes. Source: docs/design.md, section "World".
 */
import type { MobRole } from "../formulas.js";

export type ZoneId = "brackwell" | "mossgate_fields" | "thornwood_hollow" | "cinder_barrows";

export type TownService = "shop" | "warehouse" | "crafting" | "quests";
/** Services that work in this build; the others show as "coming soon". */
export const OPEN_SERVICES: TownService[] = ["shop", "warehouse", "crafting"];

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
  /** Town service offered here. Quests open in a later stage. */
  service?: TownService;
  /** A boss that can be challenged here on purpose; it never turns up while hunting. */
  boss?: string;
}

export interface MobTemplate {
  id: string;
  name: string;
  level: number;
  role: MobRole;
  description: string;
  /**
   * Resources, recipes and other stackables a kill may drop: `chance` per
   * kill, 1 to `max` (default 1) of them. A recipe for the other archetype
   * is skipped, like equipment.
   */
  drops: { item: string; chance: number; max?: number }[];
}

export const ZONES: Record<ZoneId, Zone> = {
  brackwell: { id: "brackwell", name: "Brackwell", levels: null },
  mossgate_fields: { id: "mossgate_fields", name: "Mossgate Fields", levels: [1, 7] },
  thornwood_hollow: { id: "thornwood_hollow", name: "Thornwood Hollow", levels: [7, 14] },
  cinder_barrows: { id: "cinder_barrows", name: "Cinder Barrows", levels: [14, 20] },
};

export const MOBS: Record<string, MobTemplate> = {
  mire_rat: { id: "mire_rat", name: "Mire Rat", level: 1, role: "normal", description: "A fat rat that lives in the ditches by the road.", drops: [{ item: "rough_hide", chance: 0.4 }, { item: "marsh_herb", chance: 0.2 }] },
  hedge_crow: { id: "hedge_crow", name: "Hedge Crow", level: 2, role: "normal", description: "Bold, loud and fond of shiny buckles.", drops: [{ item: "bone_shard", chance: 0.35 }, { item: "iron_scrap", chance: 0.15 }] },
  mangy_cur: { id: "mangy_cur", name: "Mangy Cur", level: 3, role: "normal", description: "A stray dog gone wild since the farms emptied.", drops: [{ item: "rough_hide", chance: 0.45 }, { item: "bone_shard", chance: 0.3 }] },
  mill_toad: { id: "mill_toad", name: "Mill Toad", level: 3, role: "normal", description: "A toad the size of a bucket, sitting in the millrace.", drops: [{ item: "marsh_herb", chance: 0.45 }, { item: "resin_lump", chance: 0.2 }] },
  silt_crawler: { id: "silt_crawler", name: "Silt Crawler", level: 4, role: "normal", description: "A pale, many-legged thing from the flooded cellar.", drops: [{ item: "bone_shard", chance: 0.35 }, { item: "resin_lump", chance: 0.3 }] },
  drowned_scavenger: { id: "drowned_scavenger", name: "Drowned Scavenger", level: 5, role: "normal", description: "Something that was once a looter, still looking for coin.", drops: [{ item: "iron_scrap", chance: 0.5, max: 2 }, { item: "resin_lump", chance: 0.2 }] },
  burrow_mole: { id: "burrow_mole", name: "Burrow Mole", level: 5, role: "normal", description: "Blind, clawed and very territorial.", drops: [{ item: "rough_hide", chance: 0.45 }, { item: "marsh_herb", chance: 0.2 }] },
  tusked_digger: { id: "tusked_digger", name: "Tusked Digger", level: 6, role: "normal", description: "A tunnelling boar with a bad temper.", drops: [{ item: "rough_hide", chance: 0.4, max: 2 }, { item: "bone_shard", chance: 0.35 }] },
  burrow_hulk: { id: "burrow_hulk", name: "Burrow Hulk", level: 7, role: "normal", description: "An old digger grown huge in the dark.", drops: [{ item: "rough_hide", chance: 0.4, max: 2 }, { item: "iron_scrap", chance: 0.3 }, { item: "bone_shard", chance: 0.3 }] },

  // Thornwood Hollow: forest creatures and bandits, the first elites.
  briar_boar: { id: "briar_boar", name: "Briar Boar", level: 7, role: "normal", description: "Its hide is full of thorns it no longer feels.", drops: [{ item: "thick_pelt", chance: 0.4 }, { item: "rough_hide", chance: 0.3 }, { item: "heartwood", chance: 0.2 }] },
  thicket_wolf: { id: "thicket_wolf", name: "Thicket Wolf", level: 8, role: "normal", description: "Grey wolves that hunt the forest edge in threes.", drops: [{ item: "thick_pelt", chance: 0.45 }, { item: "bone_shard", chance: 0.3 }] },
  roadside_cutpurse: { id: "roadside_cutpurse", name: "Roadside Cutpurse", level: 9, role: "normal", description: "A bandit who waits where the track bends.", drops: [{ item: "iron_scrap", chance: 0.5, max: 2 }, { item: "glowcap", chance: 0.15 }] },
  dell_spider: { id: "dell_spider", name: "Dell Spider", level: 9, role: "normal", description: "Long-legged and patient, the size of a shield.", drops: [{ item: "spider_silk", chance: 0.45 }, { item: "bone_shard", chance: 0.2 }] },
  web_lurker: { id: "web_lurker", name: "Web Lurker", level: 10, role: "normal", description: "It waits above the path and drops without a sound.", drops: [{ item: "spider_silk", chance: 0.5, max: 2 }, { item: "glowcap", chance: 0.2 }] },
  fungal_shambler: { id: "fungal_shambler", name: "Fungal Shambler", level: 11, role: "normal", description: "A walking heap of rot and pale caps.", drops: [{ item: "glowcap", chance: 0.45 }, { item: "heartwood", chance: 0.3 }] },
  brood_matron: { id: "brood_matron", name: "Brood Matron", level: 11, role: "elite", description: "The mother of the dell, bloated and fast.", drops: [{ item: "spider_silk", chance: 0.6, max: 3 }, { item: "glowcap", chance: 0.4 }, { item: "recipe_steelsworn_blade", chance: 0.1 }, { item: "recipe_steelsworn_staff", chance: 0.1 }] },
  crag_lynx: { id: "crag_lynx", name: "Crag Lynx", level: 12, role: "normal", description: "A tufted cat that leaps from the rocks above.", drops: [{ item: "thick_pelt", chance: 0.45, max: 2 }, { item: "bone_shard", chance: 0.3 }] },
  hollow_stag: { id: "hollow_stag", name: "Hollow Stag", level: 13, role: "normal", description: "Its antlers are grown through with living wood.", drops: [{ item: "heartwood", chance: 0.45 }, { item: "glowcap", chance: 0.25 }] },
  toll_brigand: { id: "toll_brigand", name: "Toll Brigand", level: 14, role: "normal", description: "Wants a silver for the road, then all the rest.", drops: [{ item: "iron_scrap", chance: 0.5, max: 2 }, { item: "thick_pelt", chance: 0.2 }] },
  brigand_captain: { id: "brigand_captain", name: "Brigand Captain", level: 14, role: "elite", description: "Runs the toll on the hermit's path. Wears stolen steel.", drops: [{ item: "iron_scrap", chance: 0.6, max: 3 }, { item: "heartwood", chance: 0.4 }, { item: "recipe_steelsworn_plate", chance: 0.1 }, { item: "recipe_steelsworn_vestments", chance: 0.1 }] },

  // Cinder Barrows: undead and constructs, and the Ashen Warden.
  cinder_hound: { id: "cinder_hound", name: "Cinder Hound", level: 14, role: "normal", description: "A burnt dog that still guards the gate.", drops: [{ item: "ash_dust", chance: 0.45 }, { item: "bone_shard", chance: 0.25 }] },
  ashbound_sentry: { id: "ashbound_sentry", name: "Ashbound Sentry", level: 15, role: "normal", description: "A stone guard with a coal for a heart.", drops: [{ item: "grave_iron", chance: 0.4 }, { item: "ash_dust", chance: 0.3 }] },
  restless_bones: { id: "restless_bones", name: "Restless Bones", level: 16, role: "normal", description: "A skeleton that keeps getting up.", drops: [{ item: "bone_shard", chance: 0.5, max: 2 }, { item: "ash_dust", chance: 0.3 }] },
  ossuary_crawler: { id: "ossuary_crawler", name: "Ossuary Crawler", level: 16, role: "normal", description: "Bones knit into something with too many legs.", drops: [{ item: "bone_shard", chance: 0.45 }, { item: "grave_iron", chance: 0.25 }] },
  gallery_wight: { id: "gallery_wight", name: "Gallery Wight", level: 17, role: "normal", description: "A pale shape that walks the burial niches.", drops: [{ item: "ember_shard", chance: 0.35 }, { item: "ash_dust", chance: 0.35 }] },
  bone_colossus: { id: "bone_colossus", name: "Bone Colossus", level: 18, role: "elite", description: "A giant stacked from a hundred dead.", drops: [{ item: "grave_iron", chance: 0.6, max: 3 }, { item: "bone_shard", chance: 0.5, max: 2 }, { item: "recipe_steelsworn_blade", chance: 0.08 }, { item: "recipe_steelsworn_staff", chance: 0.08 }] },
  crypt_keeper: { id: "crypt_keeper", name: "Crypt Keeper", level: 18, role: "normal", description: "It still sweeps the crypt floor, and hates guests.", drops: [{ item: "grave_iron", chance: 0.45 }, { item: "ember_shard", chance: 0.25 }] },
  ember_revenant: { id: "ember_revenant", name: "Ember Revenant", level: 19, role: "normal", description: "A dead knight with fire where its face was.", drops: [{ item: "ember_shard", chance: 0.45 }, { item: "ash_dust", chance: 0.35, max: 2 }] },
  gravebound_champion: { id: "gravebound_champion", name: "Gravebound Champion", level: 20, role: "elite", description: "The Warden's last sworn blade, still on duty.", drops: [{ item: "grave_iron", chance: 0.5, max: 3 }, { item: "ember_shard", chance: 0.5, max: 2 }, { item: "recipe_steelsworn_plate", chance: 0.08 }, { item: "recipe_steelsworn_vestments", chance: 0.08 }] },
  ashen_warden: { id: "ashen_warden", name: "Ashen Warden", level: 20, role: "boss", description: "Keeper of the barrows' last lantern, burnt out and furious.", drops: [{ item: "ember_shard", chance: 1, max: 3 }, { item: "grave_iron", chance: 1, max: 3 }, { item: "ash_dust", chance: 1, max: 3 }, { item: "recipe_steelsworn_blade", chance: 0.25 }, { item: "recipe_steelsworn_staff", chance: 0.25 }, { item: "recipe_steelsworn_plate", chance: 0.25 }, { item: "recipe_steelsworn_vestments", chance: 0.25 }] },
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
    links: ["brackwell_market", "brackwell_smithy", "brackwell_warehouse", "brackwell_notice_board", "mossgate_old_road", "thornwood_bramble_edge"],
    mobs: [],
  },
  brackwell_market: {
    id: "brackwell_market",
    name: "Market",
    zone: "brackwell",
    kind: "town",
    description: "Three stalls and a cart. Charges, draughts and plain gear, and a trader who buys anything.",
    links: ["brackwell_square"],
    mobs: [],
    service: "shop",
  },
  brackwell_smithy: {
    id: "brackwell_smithy",
    name: "Smithy",
    zone: "brackwell",
    kind: "town",
    description: "A hot forge and a smith who will make anything, if you bring the stuff and the coin.",
    links: ["brackwell_square"],
    mobs: [],
    service: "crafting",
  },
  brackwell_warehouse: {
    id: "brackwell_warehouse",
    name: "Warehouse",
    zone: "brackwell",
    kind: "town",
    description: "A barn with numbered stalls and a keeper who counts everything twice.",
    links: ["brackwell_square"],
    mobs: [],
    service: "warehouse",
  },
  brackwell_notice_board: {
    id: "brackwell_notice_board",
    name: "Notice Board",
    zone: "brackwell",
    kind: "town",
    description: "Bounties and pleas pinned three deep. Most are too faded to read.",
    links: ["brackwell_square"],
    mobs: [],
    service: "quests",
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
    links: ["mossgate_drowned_mill", "thornwood_bramble_edge"],
    mobs: ["burrow_mole", "tusked_digger", "burrow_hulk"],
  },
  thornwood_bramble_edge: {
    id: "thornwood_bramble_edge",
    name: "Bramble Edge",
    zone: "thornwood_hollow",
    kind: "hunt",
    description: "Where the fields end and the thorns begin. A cart track runs back to Brackwell.",
    links: ["brackwell_square", "mossgate_burrows", "thornwood_spider_dell"],
    mobs: ["briar_boar", "thicket_wolf", "roadside_cutpurse"],
  },
  thornwood_spider_dell: {
    id: "thornwood_spider_dell",
    name: "Spider Dell",
    zone: "thornwood_hollow",
    kind: "hunt",
    description: "A sunken hollow strung with webs as thick as rope.",
    links: ["thornwood_bramble_edge", "thornwood_hermits_rise"],
    mobs: ["dell_spider", "web_lurker", "fungal_shambler", "brood_matron"],
  },
  thornwood_hermits_rise: {
    id: "thornwood_hermits_rise",
    name: "Hermit's Rise",
    zone: "thornwood_hollow",
    kind: "hunt",
    description: "A rocky hill with a lamp in a window near the top. Brigands hold the path.",
    links: ["thornwood_spider_dell", "cinder_ash_gate"],
    mobs: ["crag_lynx", "hollow_stag", "toll_brigand", "brigand_captain"],
  },
  cinder_ash_gate: {
    id: "cinder_ash_gate",
    name: "Ash Gate",
    zone: "cinder_barrows",
    kind: "hunt",
    description: "A broken arch over grey ground. Nothing grows past it.",
    links: ["thornwood_hermits_rise", "cinder_bone_gallery"],
    mobs: ["cinder_hound", "ashbound_sentry", "restless_bones"],
  },
  cinder_bone_gallery: {
    id: "cinder_bone_gallery",
    name: "Bone Gallery",
    zone: "cinder_barrows",
    kind: "hunt",
    description: "Long halls of burial niches, most of them empty now.",
    links: ["cinder_ash_gate", "cinder_wardens_crypt"],
    mobs: ["ossuary_crawler", "gallery_wight", "bone_colossus"],
  },
  cinder_wardens_crypt: {
    id: "cinder_wardens_crypt",
    name: "Warden's Crypt",
    zone: "cinder_barrows",
    kind: "hunt",
    description: "The deepest vault. A dead lantern hangs over a throne of ash.",
    links: ["cinder_bone_gallery"],
    mobs: ["crypt_keeper", "ember_revenant", "gravebound_champion"],
    boss: "ashen_warden",
  },
};

/** Level range of a hunting node, from its mobs. */
export function nodeLevels(node: MapNode): [number, number] | null {
  if (node.mobs.length === 0) return null;
  const levels = node.mobs.map((m) => MOBS[m]!.level);
  return [Math.min(...levels), Math.max(...levels)];
}

/**
 * Relative chance to meet a mob: mobs above your level show up less often,
 * and elites are always rare (weight 1).
 */
export function encounterWeight(mobLevel: number, playerLevel: number, role: MobRole = "normal"): number {
  if (role !== "normal") return 1;
  const diff = mobLevel - playerLevel;
  return diff <= 0 ? 3 : diff === 1 ? 2 : 1;
}

/** Pick the mob met when hunting on `node`; `r` is a float in [0, 1). */
export function pickEncounter(node: MapNode, playerLevel: number, r: number): MobTemplate {
  const mobs = node.mobs.map((id) => MOBS[id]!);
  if (mobs.length === 0) throw new Error(`Nothing to hunt at ${node.id}`);
  const weights = mobs.map((m) => encounterWeight(m.level, playerLevel, m.role));
  let x = r * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < mobs.length; i++) {
    x -= weights[i]!;
    if (x < 0) return mobs[i]!;
  }
  return mobs[mobs.length - 1]!;
}
