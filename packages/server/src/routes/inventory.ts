/**
 * Inventory operations on top of a locked character: stacking, capacity, and
 * the "belt" of charges and draughts carried into a fight.
 */
import {
  ARCHETYPES,
  BAG_SLOTS,
  WAREHOUSE_SLOTS,
  chargeId,
  isStackable,
  itemTemplate,
  type CharacterSummary,
  type DraughtId,
  type GearStats,
  type Item,
  type ItemLocation,
  type Loadout,
  type NewItem,
  type PlayerCombatant,
} from "@l2n/shared";
import type { CharacterTx } from "../store/index.js";
import { GameError } from "./act.js";

const CAPACITY: Record<ItemLocation, number> = { bag: BAG_SLOTS, warehouse: WAREHOUSE_SLOTS, equipped: Infinity };
const PLACE: Record<ItemLocation, string> = { bag: "Your bag", warehouse: "Your warehouse stall", equipped: "" };

export class Inventory {
  constructor(private readonly tx: CharacterTx) {}

  in(location: ItemLocation): Item[] {
    return this.tx.items.filter((i) => i.location === location);
  }

  find(id: number, location: ItemLocation): Item {
    const item = this.tx.items.find((i) => i.id === id && i.location === location);
    if (!item) throw new GameError(404, "no_item", location === "equipped" ? "You are not wearing that." : `That is not in ${PLACE[location].toLowerCase()}.`);
    return item;
  }

  private stackOf(templateId: string, location: ItemLocation) {
    return this.in(location).find((i) => i.templateId === templateId && i.itemLevel === null);
  }

  /** Would `item` fit into its location (merging into a stack takes no new space)? */
  fits(item: Pick<NewItem, "templateId" | "location">): boolean {
    const t = itemTemplate(item.templateId);
    if (t && isStackable(t) && this.stackOf(item.templateId, item.location)) return true;
    return this.in(item.location).length < CAPACITY[item.location];
  }

  /**
   * Put an item into its location, merging stacks. Returns false if there is
   * no room, unless `force` (used to hand back what was already the player's).
   */
  async put(item: NewItem, force = false): Promise<boolean> {
    const t = itemTemplate(item.templateId);
    const stack = t && isStackable(t) ? this.stackOf(item.templateId, item.location) : undefined;
    if (stack) {
      await this.tx.updateItem(stack.id, { quantity: stack.quantity + item.quantity });
      return true;
    }
    if (!force && !this.fits(item)) return false;
    await this.tx.addItem(item);
    return true;
  }

  /** Remove `quantity` of an item; returns what was removed as a new item description. */
  async take(item: Item, quantity: number): Promise<NewItem> {
    if (quantity > item.quantity) throw new GameError(400, "not_enough", "You do not have that many.");
    if (quantity === item.quantity) await this.tx.deleteItem(item.id);
    else await this.tx.updateItem(item.id, { quantity: item.quantity - quantity });
    const { id: _, ...rest } = item;
    return { ...rest, quantity };
  }

  /** Move some or all of an item to another place, failing if there is no room. */
  async move(item: Item, quantity: number, to: ItemLocation) {
    if (!this.fits({ templateId: item.templateId, location: to })) throw new GameError(409, "full", `${PLACE[to]} is full.`);
    if (quantity === item.quantity && !this.stackOf(item.templateId, to)) {
      await this.tx.updateItem(item.id, { location: to });
      return;
    }
    const taken = await this.take(item, quantity);
    await this.put({ ...taken, location: to }, true);
  }

  /**
   * Take charges (if auto-use is on and they match the weapon's grade) and
   * draughts out of the bag for a fight.
   */
  async packBelt(c: CharacterSummary, gear: GearStats): Promise<Loadout> {
    const loadout: Loadout = { charges: 0, draughts: {} };
    if (c.autoCharges && gear.weaponTier) {
      const id = chargeId(c.archetype, gear.weaponTier);
      const stack = this.stackOf(id, "bag");
      if (stack) {
        await this.take(stack, stack.quantity);
        loadout.charges = stack.quantity;
        loadout.chargeItem = id;
      }
    }
    const kinds: DraughtId[] = ARCHETYPES[c.archetype].resource === "mana" ? ["healing_draught", "mana_draught"] : ["healing_draught"];
    for (const id of kinds) {
      const stack = this.stackOf(id, "bag");
      if (!stack) continue;
      await this.take(stack, stack.quantity);
      loadout.draughts![id] = stack.quantity;
    }
    return loadout;
  }

  /** Hand unused charges and draughts back to the bag after a fight. */
  async unpackBelt(p: PlayerCombatant) {
    const back = (templateId: string, quantity: number) =>
      quantity > 0 ? this.put({ templateId, itemLevel: null, rarity: null, bonus: null, quantity, location: "bag" }, true) : undefined;
    if (p.chargeItem) await back(p.chargeItem, p.charges);
    for (const [id, n] of Object.entries(p.draughts ?? {})) await back(id, n ?? 0);
  }
}
