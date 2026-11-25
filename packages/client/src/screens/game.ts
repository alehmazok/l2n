import {
  ARCHETYPES,
  ITEMS,
  MOBS,
  NODES,
  OPEN_SERVICES,
  RECIPES,
  ZONES,
  draughtsLeft,
  itemName,
  manaRegen,
  nodeLevels,
  skillById,
  type Effect,
  type FightResult,
  type LogEntry,
  type PublicFightState,
  type Slot,
} from "@l2n/shared";
import { api, ApiError, type CraftResult, type FightAction, type GameView } from "../api.js";
import { archetypeName, esc, portrait, raceName, sheetHtml } from "../ui.js";
import { inventoryHtml, itemIcon, marketHtml, smithyHtml, warehouseHtml } from "./items.js";

/**
 * The main game screen for one character: status bars, then either the
 * current place on the map (roads, hunt, rest) or the fight in progress.
 */
export async function renderGame(root: HTMLElement, id: number) {
  root.innerHTML = `<p class="muted">Loading…</p>`;
  let view: GameView;
  try {
    view = await api.character(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      root.innerHTML = `<section class="panel"><p>Character not found.</p><a href="#/">Back</a></section>`;
      return;
    }
    throw err;
  }

  let last: { result: FightResult; fight: PublicFightState } | null = null;
  let crafted: CraftResult | null = null;
  let busy = false;
  let error = "";

  const run = async (fn: () => Promise<GameView>) => {
    if (busy) return;
    busy = true;
    error = "";
    draw();
    try {
      const next = await fn();
      // Keep the final state of a fight that just ended so its log stays on screen.
      if (next.result && next.ended) last = { result: next.result, fight: next.ended.state };
      else if (next.fight) last = null;
      crafted = next.craft ?? null;
      view = next;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (err instanceof ApiError && err.status === 409) view = await api.character(id).catch(() => view);
    }
    busy = false;
    draw();
  };

  const draw = () => {
    const { character: c, sheet, fight } = view;
    root.innerHTML = `
      <section class="panel">
        <div class="row head">
          ${portrait(c.race, c.name)}
          <div class="grow"><h2>${esc(c.name)}</h2>
          <span class="muted">Level ${c.level} ${esc(raceName(c.race))} ${esc(archetypeName(c.archetype))} · ${c.silver} silver</span></div>
        </div>
        ${bar("HP", c.hp, sheet.maxHp, "hp")}
        ${sheet.resource.kind === "mana" ? bar("Mana", c.resource, sheet.resource.max, "mana") : ""}
        ${sheet.xpToNext === null ? `<p class="small muted">Maximum level.</p>` : bar("XP", c.xp, sheet.xpToNext, "xp")}
      </section>
      ${error ? `<p class="bad panel" role="alert">${esc(error)}</p>` : ""}
      ${fight ? fightHtml(view) : ""}
      ${last ? resultHtml(last.result, last.fight) : ""}
      ${crafted && !fight ? craftHtml(crafted) : ""}
      ${fight ? "" : placeHtml(view)}
      ${fight ? "" : inventoryHtml(c, view.items)}
      <details class="panel"><summary>Character sheet</summary>${sheetHtml(sheet)}
        <p class="muted small">Attack and defence include your worn gear.</p>
      </details>
      <p><a href="#/">← All characters</a></p>`;

    root.querySelectorAll<HTMLButtonElement>("button[data-go]").forEach((b) =>
      b.addEventListener("click", () => run(() => api.move(id, b.dataset.go!))),
    );
    root.querySelectorAll<HTMLButtonElement>("button[data-act]").forEach((b) =>
      b.addEventListener("click", () => {
        const t = b.dataset.act!;
        const action: FightAction =
          t === "skill"
            ? { type: "skill", skillId: b.dataset.skill! }
            : t === "item"
              ? { type: "item", itemId: b.dataset.draught as "healing_draught" | "mana_draught" }
              : { type: t as "attack" | "flee" | "auto" };
        void run(() => api.act(id, action));
      }),
    );
    root.querySelectorAll<HTMLButtonElement>("button[data-item]").forEach((b) =>
      b.addEventListener("click", () => {
        const d = b.dataset;
        const itemId = Number(d.id);
        const qty = d.qty ? Number(d.qty) : undefined;
        const calls: Record<string, () => Promise<GameView>> = {
          equip: () => api.equip(id, itemId),
          unequip: () => api.unequip(id, d.slot as Slot),
          use: () => api.use(id, itemId),
          buy: () => api.buy(id, d.stock!, qty),
          sell: () => api.sell(id, itemId, qty),
          deposit: () => api.deposit(id, itemId, qty),
          withdraw: () => api.withdraw(id, itemId, qty),
          craft: () => api.craft(id, d.recipe!),
        };
        const call = calls[d.item!];
        if (call) void run(call);
      }),
    );
    root.querySelector<HTMLInputElement>("input[data-item=charges]")?.addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      void run(() => api.settings(id, on));
    });
    root.querySelector("#hunt")?.addEventListener("click", () => run(() => api.hunt(id)));
    root.querySelector("#challenge")?.addEventListener("click", () => run(() => api.challenge(id)));
    root.querySelector("#rest")?.addEventListener("click", () => run(() => api.rest(id)));
    root.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input").forEach((b) => {
      if (busy && !b.classList.contains("link")) b.disabled = true;
    });
    const log = root.querySelector(".log");
    if (log) log.scrollTop = log.scrollHeight;
  };

  draw();
}

function bar(label: string, value: number, max: number, kind: string) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="bar bar-${kind}" role="meter" aria-label="${label}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${max}">
    <span class="fill" style="width:${pct.toFixed(1)}%"></span><span class="label">${label} ${value} / ${max}</span></div>`;
}

function placeHtml(view: GameView) {
  const c = view.character;
  const node = NODES[c.location];
  if (!node) return `<section class="panel"><p>You are lost. <button data-go="brackwell_square">Return to Brackwell</button></p></section>`;
  const zone = ZONES[node.zone];
  const levels = nodeLevels(node);
  const full = c.hp >= view.sheet.maxHp && (view.sheet.resource.kind !== "mana" || c.resource >= view.sheet.resource.max);
  const roads = node.links
    .map((l) => {
      const n = NODES[l]!;
      const lv = nodeLevels(n);
      return `<button class="road" data-go="${esc(n.id)}">${esc(n.name)}${n.zone !== node.zone ? ` <span class="small">(${esc(ZONES[n.zone].name)})</span>` : ""}${lv ? ` <span class="small">L${lv[0]}–${lv[1]}</span>` : ""}</button>`;
    })
    .join("");
  const mobs = node.mobs
    .map((m) => MOBS[m]!)
    .map((m) => `<li>${esc(m.name)} <span class="muted small">L${m.level}${m.role === "elite" ? " · elite" : ""}</span></li>`)
    .join("");
  const boss = node.boss ? MOBS[node.boss] : undefined;
  return `
    <section class="panel">
      <p class="muted small">${esc(zone.name)}${levels ? ` · levels ${levels[0]}–${levels[1]}` : " · safe"}</p>
      <h3>${esc(node.name)}</h3>
      <p>${esc(node.description)}</p>
      ${node.service && !OPEN_SERVICES.includes(node.service) ? `<p class="muted small">${esc(SERVICE_NAMES[node.service])}: opens in a later update.</p>` : ""}
      ${mobs ? `<p class="small muted">Seen here:</p><ul class="small mobs">${mobs}</ul>` : ""}
      ${boss ? `<p class="small">${esc(boss.description)} Come prepared: charges, draughts and a full bar.</p>` : ""}
      <div class="row">
        ${node.kind === "hunt" ? `<button id="hunt">Hunt</button>` : ""}
        ${boss ? `<button id="challenge" class="danger" title="${esc(boss.description)}">Challenge ${esc(boss.name)} <span class="small">L${boss.level} boss</span></button>` : ""}
        ${node.kind === "town" ? `<button id="rest" ${full ? "disabled" : ""}>${full ? "Rested" : "Rest"}</button>` : ""}
      </div>
    </section>
    ${node.service === "shop" ? marketHtml(c, view.items) : ""}
    ${node.service === "warehouse" ? warehouseHtml(c, view.items) : ""}
    ${node.service === "crafting" ? smithyHtml(c, view.items) : ""}
    <section class="panel"><h3>Roads</h3><div class="roads">${roads}</div></section>`;
}

const SERVICE_NAMES = { shop: "Shop", warehouse: "Warehouse", crafting: "Crafting", quests: "Quests" } as const;

const effectLabel = (e: Effect) => {
  switch (e.kind) {
    case "stun":
      return "stunned";
    case "dot":
      return `${e.name} ${e.turns}`;
    case "attack_up":
      return `attack +${Math.round(e.value * 100)}% (${e.turns})`;
    case "guard":
      return `guard −${Math.round(e.value * 100)}% (${e.turns})`;
    case "shield":
      return `ward ${e.amount} (${e.turns})`;
  }
};
const effectsHtml = (effects: Effect[]) =>
  effects.length ? `<p class="small effects">${effects.map((e) => `<span>${esc(effectLabel(e))}</span>`).join("")}</p>` : "";

function fightHtml(view: GameView) {
  const f = view.fight!;
  const s = f.state;
  const p = s.player;
  const isMage = ARCHETYPES[p.archetype].resource === "mana";
  const res = isMage ? "Mana" : "Focus";
  // Mages regenerate mana before acting, so a skill is usable if it fits after regen.
  const available = isMage ? Math.min(p.maxResource, p.resource + manaRegen(p.maxResource)) : p.resource;
  const skills = p.skills
    .map((sid) => skillById(sid)!)
    .map(
      (k) =>
        `<button data-act="skill" data-skill="${esc(k.id)}" title="${esc(k.description)}" ${k.cost > available ? "disabled" : ""}>${esc(k.name)} <span class="small">${k.cost}</span></button>`,
    )
    .join("");
  const draughts = (["healing_draught", "mana_draught"] as const)
    .filter((d) => draughtsLeft(p, d) > 0)
    .map(
      (d) =>
        `<button data-act="item" data-draught="${d}" class="quiet" title="${esc(ITEMS[d]!.description)}">${esc(ITEMS[d]!.name)} <span class="small">×${draughtsLeft(p, d)}</span></button>`,
    )
    .join("");
  const charges = p.charges > 0 && p.chargeItem ? ` ${esc(ITEMS[p.chargeItem]?.name ?? "Charges")}: ${p.charges} left.` : "";
  const mob = MOBS[f.mobId];
  return `
    <section class="panel fight">
      <h3>${esc(s.enemy.name)} <span class="muted small">L${s.enemy.level}</span></h3>
      ${mob ? `<p class="small muted">${esc(mob.description)}</p>` : ""}
      ${bar("HP", s.enemy.hp, s.enemy.maxHp, "enemy")}
      ${effectsHtml(s.enemy.effects)}
      <hr />
      ${bar("HP", p.hp, p.maxHp, "hp")}
      ${bar(res, p.resource, p.maxResource, isMage ? "mana" : "focus")}
      ${effectsHtml(p.effects)}
      <div class="row actions">
        <button data-act="attack">Attack</button>
        ${skills}
        ${draughts}
        <button data-act="flee" class="quiet">Flee</button>
        ${f.canAuto ? `<button data-act="auto" class="quiet" title="Resolve the whole fight at once">Auto-battle</button>` : ""}
      </div>
      <p class="muted small">Round ${s.round}.${isMage ? ` Mana regenerates ${manaRegen(p.maxResource)} per turn.` : " Focus builds with each attack and each hit taken."}${charges}</p>
      ${logHtml(s)}
    </section>`;
}

function resultHtml(r: FightResult, s: PublicFightState) {
  const lines: string[] = [];
  if (r.outcome === "won") lines.push(`<b class="good">Victory.</b> ${esc(s.enemy.name)} is defeated. +${r.xpGained} XP.`);
  if (r.outcome === "fled") lines.push(`You got away from ${esc(s.enemy.name)}.`);
  if (r.outcome === "lost")
    lines.push(`<b class="bad">You have fallen</b> to ${esc(s.enemy.name)}.${r.xpLost ? ` You lose ${r.xpLost} XP.` : ""} You wake up in Brackwell Square, bruised.`);
  if (r.levelsGained) lines.push(`<b class="good">Level up!</b> You are now level ${r.level}. HP and Mana are restored.`);
  if (r.loot) {
    const got = r.loot.items.map((i) => `${itemIcon(i)} ${esc(itemName(i))}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`);
    lines.push(`Loot: ${[`${r.loot.silver} silver`, ...got].join(", ")}.`);
    if (r.loot.lost.length)
      lines.push(`<span class="bad">Your bag is full. Left behind: ${r.loot.lost.map((i) => esc(itemName(i))).join(", ")}.</span>`);
  }
  return `<section class="panel result">${lines.map((l) => `<p>${l}</p>`).join("")}
    <details><summary class="small">Fight log</summary>${logHtml(s)}</details></section>`;
}

function craftHtml(r: CraftResult) {
  const name = RECIPES[r.recipeId]?.name ?? r.recipeId;
  const used = r.used.map((u) => `${u.quantity} ${esc(ITEMS[u.item]?.name ?? u.item)}`).join(", ");
  const made = r.made.map((i) => `${itemIcon(i)} ${esc(itemName(i))}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ");
  return `<section class="panel result">${
    r.success
      ? `<p><b class="good">Success.</b> The smith hands you ${made}.</p>`
      : `<p><b class="bad">The work fails.</b> ${esc(name)} did not come out right.</p>`
  }<p class="small muted">Used ${used} and ${r.fee} silver.</p></section>`;
}

const skillName = (id: string) => (id === "attack" ? "attack" : (skillById(id)?.name ?? id));

function describe(e: LogEntry, s: PublicFightState): string {
  const enemy = esc(s.enemy.name);
  switch (e.t) {
    case "hit": {
      if (e.who === "enemy") {
        const absorbed = e.absorbed ? ` (${e.absorbed} absorbed by your ward)` : "";
        return `${enemy} hits you for <b class="bad">${e.amount}</b>${e.crit ? " (critical!)" : ""}${absorbed}.`;
      }
      const how = e.source === "attack" ? "You hit" : `Your ${esc(skillName(e.source))} hits`;
      return `${how} ${enemy} for <b>${e.amount}</b>${e.crit ? " (critical!)" : ""}.`;
    }
    case "miss":
      return e.who === "player" ? `Your ${esc(skillName(e.source))} misses.` : `${enemy} misses.`;
    case "heal":
      return `${esc(skillName(e.source))}: you recover <b class="good">${e.amount}</b> HP.`;
    case "draught":
      return `You drink a ${esc(ITEMS[e.item]?.name ?? "draught")}: <b class="good">+${e.amount}</b> ${e.item === "healing_draught" ? "HP" : "Mana"}.`;
    case "flee":
      return e.success ? "You escape." : "You fail to escape.";
    case "stun":
      return `${enemy} is stunned.`;
    case "stunned":
      return `${enemy} is stunned and loses its turn.`;
    case "dot":
      return `${enemy} takes <b>${e.amount}</b> from ${e.name === "bleed" ? "bleeding" : "the burn"}.`;
    case "buff":
      return `${esc(skillName(e.source))}: ${e.kind === "shield" ? `a ward absorbs the next ${e.amount} damage` : e.kind === "guard" ? "you brace yourself" : "your attacks grow stronger"}.`;
    case "fade":
      return `<span class="muted">${e.kind === "shield" ? "Your ward fades." : e.kind === "guard" ? "Your guard drops." : "Your war cry fades."}</span>`;
  }
}

function logHtml(s: PublicFightState) {
  if (!s.log.length) return `<p class="muted small">${esc(s.enemy.name)} notices you.</p>`;
  return `<ol class="log">${s.log.map((e) => `<li>${describe(e, s)}</li>`).join("")}</ol>`;
}
