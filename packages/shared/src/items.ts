/**
 * Item copies owned by characters: stats, requirements, prices, the shop,
 * the starter kit and mob loot. Source: docs/design.md, sections "Items" and
 * "Economy".
 */
import {
  ARMOUR_SHARE,
  ITEMS,
  RARE_BONUSES,
  TIERS,
  chargeId,
  equipmentId,
  itemTemplate,
  tierForItemLevel,
  SLOTS,
  type ArmourSlot,
  type EquipmentTemplate,
  type ItemTemplate,
  type RareBonus,
  type Rarity,
  type Slot,
  type Tier,
} from "./data/items.js";
import type { MobTemplate } from "./data/world.js";
import { RARITY_MULTIPLIER, armourFor, weaponPowerFor, type MobRole } from "./formulas.js";
import { between, roll, type Rng } from "./rng.js";
import type { ArchetypeId, RaceId } from "./types.js";
import { racialBonuses } from "./progression.js";

export type ItemLocation = "bag" | "equipped" | "warehouse";

/** One copy (equipment) or stack (everything else) owned by a character. */
export interface Item {
  id: number;
  templateId: string;
  /** Equipment only. */
  itemLevel: number | null;
  rarity: Rarity | null;
  bonus: RareBonus | null;
  quantity: number;
  location: ItemLocation;
}
export type NewItem = Omit<Item, "id">;

/** Distinct stacks or pieces a bag and a warehouse hold. Equipped items do not count. */
export const BAG_SLOTS = 40;
export const WAREHOUSE_SLOTS = 60;
/** Silver paid per stack or piece put into the warehouse. */
export const WAREHOUSE_FEE = 2;
/** NPCs buy items at this share of their value. */
export const SELL_SHARE = 0.3;
/** Largest stack bought, sold or moved in one action. */
export const MAX_QUANTITY = 999;

const round1 = (v: number) => Math.round(v * 10) / 10;

export const isEquipment = (t: ItemTemplate | undefined): t is EquipmentTemplate => t?.kind === "equipment";

/** Weapon power or armour of one piece of equipment. */
export function equipmentStats(t: EquipmentTemplate, itemLevel: number, rarity: Rarity = "common") {
  const mult = RARITY_MULTIPLIER[rarity];
  if (t.slot === "weapon") return { weaponPower: round1(weaponPowerFor(t.tier, itemLevel) * mult), armour: 0 };
  return { weaponPower: 0, armour: round1(armourFor(t.tier, itemLevel) * ARMOUR_SHARE[t.slot as ArmourSlot] * mult) };
}

/** Character level needed to wear a piece: its item level, and at least the grade's level. */
export const requiredLevel = (t: EquipmentTemplate, itemLevel: number) => Math.max(TIERS[t.tier].level, itemLevel);

/** Why a character cannot wear an item, or null if they can. */
export function equipProblem(item: Pick<Item, "templateId" | "itemLevel">, archetype: ArchetypeId, level: number): string | null {
  const t = itemTemplate(item.templateId);
  if (!isEquipment(t) || item.itemLevel === null) return "That cannot be worn.";
  if (t.archetype !== archetype) return `Only a ${t.archetype} can use ${t.name}.`;
  const need = requiredLevel(t, item.itemLevel);
  if (level < need) return `${t.name} needs level ${need}.`;
  return null;
}

/** What worn gear adds to a character. */
export interface GearStats {
  weaponPower: number;
  armour: number;
  critBonus: number;
  hpBonus: number;
  /** Grade of the weapon, which decides the charges it takes; null with no weapon. */
  weaponTier: Tier | null;
}
export const NO_GEAR: GearStats = { weaponPower: 0, armour: 0, critBonus: 0, hpBonus: 0, weaponTier: null };

export function gearStats(items: Pick<Item, "templateId" | "itemLevel" | "rarity" | "bonus" | "location">[]): GearStats {
  const g = { ...NO_GEAR };
  for (const i of items) {
    const t = itemTemplate(i.templateId);
    if (i.location !== "equipped" || !isEquipment(t) || i.itemLevel === null) continue;
    const s = equipmentStats(t, i.itemLevel, i.rarity ?? "common");
    g.weaponPower += s.weaponPower;
    g.armour += s.armour;
    if (t.slot === "weapon") g.weaponTier = t.tier;
    if (i.bonus === "crit") g.critBonus += RARE_BONUSES.crit.value;
    if (i.bonus === "hp") g.hpBonus += RARE_BONUSES.hp.value;
  }
  g.weaponPower = round1(g.weaponPower);
  g.armour = round1(g.armour);
  return g;
}

/** A full common set of equipment at one item level. */
export function fullSet(archetype: ArchetypeId, itemLevel: number, location: ItemLocation = "equipped"): NewItem[] {
  const tier = tierForItemLevel(itemLevel);
  return SLOTS.map((slot) => ({
    templateId: equipmentId(tier, archetype, slot),
    itemLevel,
    rarity: "common",
    bonus: null,
    quantity: 1,
    location,
  }));
}

/**
 * Gear the balance simulation assumes: a full common set of the character's
 * own level (Steelsworn from level 10).
 */
export const referenceGear = (archetype: ArchetypeId, level: number) => gearStats(fullSet(archetype, level));

/** What a new character starts with: a worn Ironbound set and a few draughts. */
export function starterItems(archetype: ArchetypeId): NewItem[] {
  const stack = (templateId: string, quantity: number): NewItem => ({
    templateId,
    itemLevel: null,
    rarity: null,
    bonus: null,
    quantity,
    location: "bag",
  });
  return [
    ...fullSet(archetype, 1),
    stack("healing_draught", 3),
    ...(archetype === "mage" ? [stack("mana_draught", 3)] : []),
    stack(chargeId(archetype, 1), 50),
  ];
}

/** Value of a whole set of a grade and item level; a weapon costs the same as the armour set. */
const setValue = (tier: Tier, itemLevel: number) => Math.round((4 * itemLevel * itemLevel + 30) * (tier === 2 ? 1.5 : 1));
const RARITY_VALUE: Record<Rarity, number> = { common: 1, uncommon: 1.5, rare: 2.5 };

/** Value of one item in silver: what the shop asks for it. */
export function itemValue(i: Pick<Item, "templateId" | "itemLevel" | "rarity">): number {
  const t = itemTemplate(i.templateId);
  if (!t) return 0;
  if (t.kind !== "equipment") return t.value;
  const set = setValue(t.tier, i.itemLevel ?? 1);
  const share = t.slot === "weapon" ? 1 : ARMOUR_SHARE[t.slot as ArmourSlot];
  return Math.max(1, Math.round(set * share * RARITY_VALUE[i.rarity ?? "common"]));
}

/** Silver an NPC pays for `quantity` of an item. */
export const sellPrice = (i: Pick<Item, "templateId" | "itemLevel" | "rarity">, quantity = 1) =>
  Math.max(1, Math.floor(itemValue(i) * SELL_SHARE)) * quantity;

/** What the Brackwell market sells. */
export interface StockEntry {
  id: string;
  templateId: string;
  itemLevel: number | null;
}
const gearStock = (itemLevel: number): StockEntry[] =>
  (["warrior", "mage"] as ArchetypeId[]).flatMap((a) =>
    fullSet(a, itemLevel).map((n) => ({ id: `${n.templateId}@${itemLevel}`, templateId: n.templateId, itemLevel })),
  );
const stackStock = (templateId: string): StockEntry => ({ id: templateId, templateId, itemLevel: null });

export const SHOP_STOCK: StockEntry[] = [
  stackStock("whetstone_1"),
  stackStock("whetstone_2"),
  stackStock("ember_vial_1"),
  stackStock("ember_vial_2"),
  stackStock("healing_draught"),
  stackStock("mana_draught"),
  ...[1, 5, 10, 15].flatMap(gearStock),
];
export const stockEntry = (id: string) => SHOP_STOCK.find((s) => s.id === id);

/** The item a stock entry gives when bought. */
export const stockItem = (s: StockEntry, quantity: number): NewItem => ({
  templateId: s.templateId,
  itemLevel: s.itemLevel,
  rarity: s.itemLevel === null ? null : "common",
  bonus: null,
  quantity,
  location: "bag",
});

// --- Loot -------------------------------------------------------------------

/** Silver per kill: `(4 + L) · role · rand(0.8, 1.2)`, rounded. */
const ROLE_SILVER: Record<MobRole, number> = { normal: 1, elite: 3, boss: 15 };
export const mobSilverBase = (level: number, role: MobRole = "normal") => (4 + level) * ROLE_SILVER[role];

/** Chance that a kill drops a piece of equipment. */
export const EQUIPMENT_DROP: Record<MobRole, number> = { normal: 0.03, elite: 0.2, boss: 1 };
/** Rarity of dropped equipment: 80% common, 17% uncommon, 3% rare. */
export const RARITY_ODDS: [Rarity, number][] = [
  ["rare", 0.03],
  ["uncommon", 0.17],
  ["common", 0.8],
];
/** Any kill may drop a healing draught. */
export const DRAUGHT_DROP = 0.03;

export interface Loot {
  silver: number;
  items: NewItem[];
}

export function rollRarity(rng: Rng): Rarity {
  let r = rng.next();
  for (const [rarity, p] of RARITY_ODDS) {
    if (r < p) return rarity;
    r -= p;
  }
  return "common";
}

/**
 * What a defeated mob leaves behind. Equipment is for the killer's archetype
 * and has the mob's level as its item level. Dwarves find more resources.
 */
export function rollLoot(mob: MobTemplate, killer: { race: RaceId; archetype: ArchetypeId }, rng: Rng): Loot {
  const items: NewItem[] = [];
  const stack = (templateId: string, quantity: number) =>
    items.push({ templateId, itemLevel: null, rarity: null, bonus: null, quantity, location: "bag" });
  const silver = Math.round(mobSilverBase(mob.level, mob.role) * between(rng, 0.8, 1.2));
  const resourceMult = 1 + racialBonuses(killer.race).resourceDrops;
  for (const d of mob.drops) {
    const t = ITEMS[d.item]!;
    if (!roll(rng, d.chance * (t.kind === "resource" ? resourceMult : 1))) continue;
    const max = d.max ?? 1;
    stack(d.item, 1 + Math.floor(rng.next() * max));
  }
  if (roll(rng, DRAUGHT_DROP)) stack("healing_draught", 1);
  if (roll(rng, EQUIPMENT_DROP[mob.role])) {
    const slot = SLOTS[Math.floor(rng.next() * SLOTS.length)]!;
    const rarity = rollRarity(rng);
    const bonus: RareBonus | null = rarity === "rare" ? (rng.next() < 0.5 ? "crit" : "hp") : null;
    items.push({
      templateId: equipmentId(tierForItemLevel(mob.level), killer.archetype, slot),
      itemLevel: mob.level,
      rarity,
      bonus,
      quantity: 1,
      location: "bag",
    });
  }
  return { silver, items };
}

/** Display name: "Ironbound Sword", with rarity for non-common equipment. */
export function itemName(i: Pick<Item, "templateId" | "rarity">): string {
  const t = itemTemplate(i.templateId);
  if (!t) return i.templateId;
  return i.rarity && i.rarity !== "common" ? `${t.name} (${i.rarity === "rare" ? "Rare" : "Uncommon"})` : t.name;
}

export const slotOf = (templateId: string): Slot | null => {
  const t = itemTemplate(templateId);
  return isEquipment(t) ? t.slot : null;
};
