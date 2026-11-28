/**
 * Item panels of the game screen: the bag window, the market, the warehouse
 * and the smithy. Buttons carry `data-item` attributes; game.ts wires them up.
 */
import {
  ARCHETYPES,
  BAG_SLOTS,
  RARE_BONUSES,
  SHOP_STOCK,
  SLOTS,
  TIERS,
  WAREHOUSE_FEE,
  WAREHOUSE_SLOTS,
  RECIPES,
  SMITHY_STOCK,
  craftProblem,
  bagCount,
  equipProblem,
  isSellable,
  recipeChance,
  equipmentStats,
  isEquipment,
  itemName,
  itemTemplate,
  itemValue,
  requiredLevel,
  sellPrice,
  stockItem,
  type CharacterSummary,
  type Recipe,
  type Item,
  type NewItem,
  type Slot,
  type StockEntry,
} from "@l2n/shared";
import { esc } from "../ui.js";
import { itemIcon, recipeIcon } from "../icons.js";

export { itemIcon };

const SLOT_NAMES: Record<Slot, string> = { weapon: "Weapon", head: "Head", chest: "Chest", legs: "Legs", gloves: "Gloves", boots: "Boots" };

/** One line of item facts: stats, level needed, rare bonus. */
export function itemFacts(i: Pick<NewItem, "templateId" | "itemLevel" | "rarity" | "bonus">) {
  const t = itemTemplate(i.templateId);
  if (!t) return "";
  if (!isEquipment(t) || i.itemLevel === null) return esc(t.description);
  const s = equipmentStats(t, i.itemLevel, i.rarity ?? "common");
  const parts = [
    `${TIERS[t.tier].name} · item level ${i.itemLevel}`,
    s.weaponPower ? `+${s.weaponPower} attack` : `+${s.armour} armour`,
    `needs level ${requiredLevel(t, i.itemLevel)}`,
  ];
  if (i.bonus) parts.push(RARE_BONUSES[i.bonus].label);
  return esc(parts.join(" · "));
}

const line = (i: Pick<NewItem, "templateId" | "itemLevel" | "rarity" | "bonus" | "quantity">, actions: string, extra = "") =>
  `<li class="item">${itemIcon(i)}<div class="grow"><span class="rarity-text-${i.rarity ?? "common"}">${esc(itemName(i))}</span>${i.quantity > 1 ? ` <span class="muted">×${i.quantity}</span>` : ""}${extra}
    <div class="small muted">${itemFacts(i)}</div></div><div class="row">${actions}</div></li>`;

const btn = (label: string, attrs: Record<string, string | number>, disabled = false, title = "") =>
  `<button class="quiet small" ${Object.entries(attrs)
    .map(([k, v]) => `data-${k}="${esc(v)}"`)
    .join(" ")}${disabled ? " disabled" : ""}${title ? ` title="${esc(title)}"` : ""}>${esc(label)}</button>`;

const byPlace = (items: Item[], location: Item["location"]) => items.filter((i) => i.location === location);

const slotOf = (i: Item) => (itemTemplate(i.templateId) as { slot?: Slot } | undefined)?.slot;

/** One square of the bag window: an item to pick, or an empty place. */
const cell = (i: Item | undefined, picked: number | null, empty = "") =>
  i
    ? `<button class="cell rarity-${i.rarity ?? "common"}${i.id === picked ? " picked" : ""}" data-pick="${i.id}" title="${esc(itemName(i))}" aria-pressed="${i.id === picked}">${itemIcon(i)}${i.quantity > 1 ? `<em>${i.quantity}</em>` : ""}</button>`
    : `<span class="cell cell-empty">${esc(empty)}</span>`;

/** What can be done with a bag or worn item, and why not when it cannot. */
function itemActions(c: CharacterSummary, i: Item): { buttons: string; problem: string } {
  const t = itemTemplate(i.templateId);
  if (i.location === "equipped") return { buttons: btn("Take off", { item: "unequip", slot: slotOf(i) ?? "" }), problem: "" };
  if (isEquipment(t)) {
    const problem = equipProblem(i, c.archetype, c.level);
    return { buttons: btn("Wear", { item: "equip", id: i.id }, problem !== null), problem: problem ?? "" };
  }
  if (t?.kind === "draught") {
    const usable = t.restores === "hp" || ARCHETYPES[c.archetype].resource === "mana";
    return { buttons: btn("Drink", { item: "use", id: i.id }, !usable), problem: usable ? "" : "Only mages use mana." };
  }
  if (t?.kind === "recipe") {
    const known = c.recipes.includes(t.recipe);
    return { buttons: btn(known ? "Known" : "Learn", { item: "use", id: i.id }, known), problem: "" };
  }
  return { buttons: "", problem: "" };
}

/**
 * The bag window: worn gear and the bag as squares, the picked item's card
 * with what can be done with it, and the charge setting. `picked` is the id
 * of the item whose card is shown.
 */
export function bagHtml(c: CharacterSummary, items: Item[], picked: number | null) {
  const worn = byPlace(items, "equipped");
  const order = { equipment: 0, draught: 1, charge: 2, quest: 3, recipe: 4, resource: 5 } as const;
  const rank = (i: Item) => order[itemTemplate(i.templateId)?.kind ?? "resource"];
  const bag = byPlace(items, "bag").sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  const slots = SLOTS.map((slot) => cell(worn.find((w) => slotOf(w) === slot), picked, SLOT_NAMES[slot])).join("");
  const cells = [...bag.map((i) => cell(i, picked)), ...Array.from({ length: Math.max(0, BAG_SLOTS - bag.length) }, () => cell(undefined, picked))].join("");
  const it = [...worn, ...bag].find((i) => i.id === picked);
  let card = `<p class="muted small item-card">Pick an item to see what it is.</p>`;
  if (it) {
    const { buttons, problem } = itemActions(c, it);
    const slot = it.location === "equipped" ? slotOf(it) : undefined;
    card = `<div class="item-card">${itemIcon(it)}<div class="grow"><b class="rarity-text-${it.rarity ?? "common"}">${esc(itemName(it))}</b>${it.quantity > 1 ? ` <span class="muted">×${it.quantity}</span>` : ""}${slot ? ` <span class="muted small">worn · ${SLOT_NAMES[slot]}</span>` : ""}
      <div class="small muted">${itemFacts(it)}</div>${problem ? `<div class="small bad">${esc(problem)}</div>` : ""}</div>${buttons ? `<div class="row">${buttons}</div>` : ""}</div>`;
  }
  return `
    ${card}
    <h4>Worn</h4><div class="cells">${slots}</div>
    <h4>Bag <span class="muted">${bag.length} / ${BAG_SLOTS}</span></h4><div class="cells">${cells}</div>
    <label class="row small"><input type="checkbox" data-item="charges" ${c.autoCharges ? "checked" : ""} />
      Use charges automatically (they must match your weapon's grade)</label>`;
}

const stockLabel = (s: StockEntry) => itemName({ templateId: s.templateId, rarity: null });

/** Buying from the stock and selling from the bag. */
export function marketHtml(c: CharacterSummary, items: Item[]) {
  const mine = (s: StockEntry) => {
    const t = itemTemplate(s.templateId)!;
    if (t.kind === "draught") return t.restores === "hp" || ARCHETYPES[c.archetype].resource === "mana";
    return !("archetype" in t) || t.archetype === c.archetype;
  };
  const offer = (s: StockEntry) => {
    const price = itemValue(stockItem(s, 1));
    const actions =
      s.itemLevel === null
        ? [1, 10, 100].map((n) => btn(`×${n} · ${price * n}s`, { item: "buy", stock: s.id, qty: n }, c.silver < price * n)).join("")
        : btn(`${price}s`, { item: "buy", stock: s.id, qty: 1 }, c.silver < price);
    return line(stockItem(s, 1), actions);
  };
  const supplies = SHOP_STOCK.filter((s) => s.itemLevel === null && mine(s));
  const gear = SHOP_STOCK.filter((s) => s.itemLevel !== null && mine(s));
  const sellable = byPlace(items, "bag")
    .map((i) => {
      if (!isSellable(itemTemplate(i.templateId))) return "";
      const each = sellPrice(i);
      const actions = [
        i.quantity > 1 ? btn(`Sell 1 · ${each}s`, { item: "sell", id: i.id, qty: 1 }) : "",
        btn(`Sell${i.quantity > 1 ? " all" : ""} · ${sellPrice(i, i.quantity)}s`, { item: "sell", id: i.id, qty: i.quantity }),
      ].join("");
      return line(i, actions);
    })
    .join("");
  return `
    <section class="panel"><h3>Market <span class="muted small">${c.silver} silver</span></h3>
      <p class="small muted">Charges and draughts</p><ul class="items">${supplies.map(offer).join("")}</ul>
      <details><summary class="small">Gear for a ${esc(ARCHETYPES[c.archetype].name.toLowerCase())}</summary>
        <ul class="items">${gear.map(offer).join("")}</ul></details>
    </section>
    <section class="panel"><h3>Sell</h3>
      <p class="small muted">The trader pays 30% of an item's value. Worn gear must be taken off first.</p>
      ${sellable ? `<ul class="items">${sellable}</ul>` : `<p class="muted small">Your bag is empty.</p>`}
    </section>`;
}

/** Moving things between the bag and the warehouse stall. */
export function warehouseHtml(c: CharacterSummary, items: Item[]) {
  const stored = byPlace(items, "warehouse");
  const bag = byPlace(items, "bag");
  const store = bag
    .map((i) =>
      line(
        i,
        [
          i.quantity > 1 ? btn("Store 1", { item: "deposit", id: i.id, qty: 1 }, c.silver < WAREHOUSE_FEE) : "",
          btn(i.quantity > 1 ? "Store all" : "Store", { item: "deposit", id: i.id, qty: i.quantity }, c.silver < WAREHOUSE_FEE),
        ].join(""),
      ),
    )
    .join("");
  const take = stored
    .map((i) =>
      line(
        i,
        [
          i.quantity > 1 ? btn("Take 1", { item: "withdraw", id: i.id, qty: 1 }) : "",
          btn(i.quantity > 1 ? "Take all" : "Take", { item: "withdraw", id: i.id, qty: i.quantity }),
        ].join(""),
      ),
    )
    .join("");
  return `
    <section class="panel"><h3>Your stall <span class="muted small">${stored.length} / ${WAREHOUSE_SLOTS}</span></h3>
      ${take ? `<ul class="items">${take}</ul>` : `<p class="muted small">Nothing stored yet.</p>`}
    </section>
    <section class="panel"><h3>Store from your bag</h3>
      <p class="small muted">The keeper charges ${WAREHOUSE_FEE} silver for each thing you store. Taking things out is free.</p>
      ${store ? `<ul class="items">${store}</ul>` : `<p class="muted small">Your bag is empty.</p>`}
    </section>`;
}

const own = (c: CharacterSummary, r: Recipe) => !r.archetype || r.archetype === c.archetype;

/** One recipe in the book: what it needs (have / need), the fee and the chance, and a Craft button. */
function recipeLine(c: CharacterSummary, items: Item[], r: Recipe) {
  const needs = r.inputs
    .map((i) => {
      const have = bagCount(items, i.item);
      return `<span class="${have >= i.quantity ? "" : "bad"}">${esc(itemTemplate(i.item)?.name ?? i.item)} ${have}/${i.quantity}</span>`;
    })
    .join(", ");
  const problem = craftProblem(r, c, items);
  const made = r.makes.length > 1 ? `${r.makes.length} pieces` : `${r.makes[0]!.quantity > 1 ? `${r.makes[0]!.quantity} × ` : ""}${esc(itemTemplate(r.makes[0]!.item)?.name ?? "")}`;
  const level = r.itemLevel !== null ? ` · item level ${r.itemLevel}` : "";
  return `<li class="item">${recipeIcon()}<div class="grow">${esc(r.name)}
    <div class="small muted">Makes ${made}${level} · ${Math.round(recipeChance(r, c.race) * 100)}% · fee ${r.fee}s</div>
    <div class="small">${needs}</div></div>
    <div class="row">${btn("Craft", { item: "craft", recipe: r.id }, problem !== null, problem ?? "")}</div></li>`;
}

/** The smithy: the recipe book, crafting, and recipes for sale. */
export function smithyHtml(c: CharacterSummary, items: Item[]) {
  const known = c.recipes.map((id) => RECIPES[id]).filter((r): r is Recipe => r !== undefined);
  const forSale = SMITHY_STOCK.filter((s) => {
    const t = itemTemplate(s.templateId);
    return t?.kind === "recipe" && own(c, RECIPES[t.recipe]!) && !c.recipes.includes(t.recipe);
  });
  const offer = (s: StockEntry) => {
    const price = itemValue(stockItem(s, 1));
    return line(stockItem(s, 1), btn(`${price}s`, { item: "buy", stock: s.id, qty: 1 }, c.silver < price));
  };
  return `
    <section class="panel"><h3>Recipe book</h3>
      <p class="small muted">Resources must be in your bag. On a failure the smith keeps the fee and half of each resource; you keep the recipe.</p>
      ${known.length ? `<ul class="items">${known.map((r) => recipeLine(c, items, r)).join("")}</ul>` : `<p class="muted small">You know no recipes yet. Buy one below and learn it from your bag.</p>`}
    </section>
    <section class="panel"><h3>Recipes for sale <span class="muted small">${c.silver} silver</span></h3>
      ${forSale.length ? `<ul class="items">${forSale.map(offer).join("")}</ul>` : `<p class="muted small">You know everything the smith sells.</p>`}
      <p class="small muted">Steelsworn gear recipes are not sold. Elites and the Ashen Warden carry them.</p>
    </section>`;
}
