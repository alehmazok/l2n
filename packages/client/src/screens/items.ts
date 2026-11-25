/**
 * Item panels of the game screen: worn gear and bag, the market and the
 * warehouse. Buttons carry `data-item` attributes; game.ts wires them up.
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

const SLOT_NAMES: Record<Slot, string> = { weapon: "Weapon", head: "Head", chest: "Chest", legs: "Legs", gloves: "Gloves", boots: "Boots" };

/** Placeholder icon until real art exists: a letter for the kind of item, edged by rarity. */
export function itemIcon(i: Pick<NewItem, "templateId" | "rarity">) {
  const t = itemTemplate(i.templateId);
  const letter = !t
    ? "?"
    : t.kind === "equipment"
      ? SLOT_NAMES[t.slot].charAt(0)
      : { charge: "✦", draught: "⚗", resource: "◆", recipe: "§", quest: "★" }[t.kind];
  return `<span class="icon icon-${t?.kind ?? "unknown"} rarity-${i.rarity ?? "common"}" aria-hidden="true">${letter}</span>`;
}

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

/** Worn gear, the bag, silver and the charge setting. */
export function inventoryHtml(c: CharacterSummary, items: Item[]) {
  const worn = byPlace(items, "equipped");
  const slots = SLOTS.map((slot) => {
    const i = worn.find((w) => (itemTemplate(w.templateId) as { slot?: Slot } | undefined)?.slot === slot);
    return i
      ? line(i, btn("Take off", { item: "unequip", slot }), ` <span class="muted small">${SLOT_NAMES[slot]}</span>`)
      : `<li class="item"><span class="icon icon-empty" aria-hidden="true"></span><div class="grow muted">${SLOT_NAMES[slot]}: nothing</div></li>`;
  }).join("");
  const order = { equipment: 0, draught: 1, charge: 2, quest: 3, recipe: 4, resource: 5 } as const;
  const rank = (i: Item) => order[itemTemplate(i.templateId)?.kind ?? "resource"];
  const bag = byPlace(items, "bag").sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  const bagLines = bag
    .map((i) => {
      const t = itemTemplate(i.templateId);
      let actions = "";
      if (isEquipment(t)) {
        const problem = equipProblem(i, c.archetype, c.level);
        actions = btn("Wear", { item: "equip", id: i.id }, problem !== null, problem ?? "");
      } else if (t?.kind === "draught") {
        const usable = t.restores === "hp" || ARCHETYPES[c.archetype].resource === "mana";
        actions = btn("Drink", { item: "use", id: i.id }, !usable);
      } else if (t?.kind === "recipe") {
        const known = c.recipes.includes(t.recipe);
        actions = btn(known ? "Known" : "Learn", { item: "use", id: i.id }, known);
      }
      return line(i, actions);
    })
    .join("");
  return `
    <details class="panel" open><summary>Gear and bag</summary>
      <h3>Worn</h3><ul class="items">${slots}</ul>
      <h3>Bag <span class="muted small">${bag.length} / ${BAG_SLOTS}</span></h3>
      ${bag.length ? `<ul class="items">${bagLines}</ul>` : `<p class="muted small">Empty.</p>`}
      <label class="row small"><input type="checkbox" data-item="charges" ${c.autoCharges ? "checked" : ""} />
        Use charges automatically (they must match your weapon's grade)</label>
    </details>`;
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
  return `<li class="item"><span class="icon icon-recipe" aria-hidden="true">§</span><div class="grow">${esc(r.name)}
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
