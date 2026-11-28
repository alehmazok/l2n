import {
  ARCHETYPES,
  ITEMS,
  PROFESSIONS,
  QUESTS,
  challengeAt,
  MOBS,
  NODES,
  OPEN_SERVICES,
  RECIPES,
  ZONES,
  draughtsLeft,
  itemName,
  itemTemplate,
  manaRegen,
  nodeLevels,
  skillById,
  type Effect,
  type FightResult,
  type LogEntry,
  type ProfessionId,
  type PublicFightState,
  type Slot,
} from "@l2n/shared";
import { api, ApiError, type CraftResult, type FightAction, type FightView, type GameView, type QuestResult } from "../api.js";
import { archetypeName, esc, raceName, sheetHtml } from "../ui.js";
import { mobArt, portrait, sceneArt } from "../art.js";
import { mapHtml, miniMapHtml } from "../map.js";
import { plan, play, playable, type Side } from "../fightfx.js";
import { DOCK, GLYPHS, hotkey, type WindowId } from "../hud.js";
import { skillIcon } from "../icons.js";
import { bagHtml, itemIcon, marketHtml, smithyHtml, warehouseHtml } from "./items.js";
import { boardHtml, journalHtml, questResultHtml, readyQuests, trackerHtml } from "./quests.js";
import { startWorld } from "./world.js";

let leave: (() => void) | null = null;

/** Put the page back as it was for the other screens: no key handler, no full-screen stage. */
export function leaveGame() {
  leave?.();
  leave = null;
}

/** The service of the town node the character stands on, if it is open. */
const serviceAt = (location: string) => {
  const service = NODES[location]?.service;
  return service && OPEN_SERVICES.includes(service) ? service : undefined;
};

/**
 * The main game screen for one character. The place's picture fills the
 * screen (the stage) and everything else floats over it: the hero's frame, the
 * place or the foe, the minimap, the chat window, the action bar and the dock,
 * whose buttons open windows (bag, quests, map and so on) over the scene.
 * Held upright, a phone gets the same pieces stacked in a column (style.css).
 */
export async function renderGame(screen: HTMLElement, id: number) {
  leaveGame();
  screen.innerHTML = `<p class="muted">Loading…</p>`;
  let view: GameView;
  try {
    view = await api.character(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      screen.innerHTML = `<section class="panel"><p>Character not found.</p><a href="#/">Back</a></section>`;
      return;
    }
    throw err;
  }
  // The HUD redraws after every action; the chat window lives beside it and keeps its own state.
  screen.innerHTML = `<div class="stage"><div class="game-main"></div><aside class="game-world hud frame"></aside></div>`;
  const stage = screen.querySelector<HTMLElement>(".stage")!;
  const root = screen.querySelector<HTMLElement>(".game-main")!;
  const world = startWorld(screen.querySelector<HTMLElement>(".game-world")!, root, id, () => view.character.location);
  document.body.classList.add("in-game");

  let last: { result: FightResult; fight: FightView } | null = null;
  // How much of which fight's log has been shown, so only new entries are animated; a fight found on arrival is not replayed.
  let seen: { id: number; len: number } | null = view.fight ? { id: view.fight.id, len: view.fight.state.log.length } : null;
  /** The fight whose log the combat tab was last turned to. */
  let logged: number | null = null;
  let stop = () => {};
  let crafted: CraftResult | null = null;
  let quested: QuestResult | null = null;
  let busy = false;
  let error = "";
  let open: WindowId | null = !view.fight && serviceAt(view.character.location) ? "place" : null;
  /** The item whose card the bag window shows. */
  let picked: number | null = null;

  const ACTIONS = "[data-go], [data-act], [data-item], [data-quest], #hunt, #challenge, #rest";

  const run = async (fn: () => Promise<GameView>) => {
    if (busy) return;
    busy = true;
    root.querySelectorAll<HTMLButtonElement | HTMLInputElement>(ACTIONS).forEach((b) => (b.disabled = true));
    const from = view.character.location;
    try {
      const next = await fn();
      error = "";
      // Keep the final state of a fight that just ended so it stays on the scene until the player moves on.
      last = next.result && next.ended ? { result: next.result, fight: next.ended } : null;
      crafted = next.craft ?? null;
      quested = next.quest ?? null;
      view = next;
      if (view.fight) open = null;
      else if (view.character.location !== from) open = serviceAt(view.character.location) ? "place" : null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (err instanceof ApiError && err.status === 409) view = await api.character(id).catch(() => view);
    }
    busy = false;
    draw();
  };

  /** Opens a window, or closes it if it is the one already open. */
  const toggle = (w: WindowId | null) => {
    // A fight leaves no hands free for the bag or the road.
    if (view.fight && (w === "bag" || w === "map" || w === "place")) return;
    if (w === "place" && !serviceAt(view.character.location)) return;
    open = open === w ? null : w;
    draw();
  };

  const windowHtml = (notices: string) => {
    if (!open) return "";
    const c = view.character;
    const node = NODES[c.location];
    const service = serviceAt(c.location);
    let title = "";
    let body = "";
    if (open === "hero") {
      title = c.name;
      body = `<div class="row head">${portrait(c.race, c.archetype, c.name, "portrait-large")}
          <div class="grow">Level ${c.level} ${esc(raceName(c.race))} ${esc(c.profession ? PROFESSIONS[c.profession].name : archetypeName(c.archetype))}
          <div class="muted small">${view.sheet.xpToNext === null ? "Maximum level" : `${c.xp} / ${view.sheet.xpToNext} XP`} · ${c.silver} silver</div></div></div>
        ${sheetHtml(view.sheet)}<p class="muted small">Attack and defence include your worn gear.</p>`;
    } else if (open === "bag") {
      title = "Bag";
      body = bagHtml(c, view.items, picked);
    } else if (open === "quests") {
      title = service === "quests" ? "Notice Board" : "Quests";
      body = service === "quests" ? boardHtml(c, view.items) : journalHtml(c, view.items);
    } else if (open === "map") {
      title = "Hollowreach";
      body = `${mapHtml(c.location)}<p class="muted small">Tap a lit place to travel there.</p>`;
    } else if (open === "place" && service && node) {
      title = node.name;
      body =
        service === "shop" ? marketHtml(c, view.items) : service === "warehouse" ? warehouseHtml(c, view.items) : service === "crafting" ? smithyHtml(c, view.items) : boardHtml(c, view.items);
    } else if (open === "menu") {
      title = "Menu";
      body = `<div class="stack">
          ${document.fullscreenEnabled ? `<button class="quiet" id="fullscreen">${document.fullscreenElement ? "Leave full screen" : "Full screen"}</button>` : ""}
          <a class="button" href="#/">All characters</a>
          <p class="muted small">Keys: Space for the main action, 1–9 in a fight, C, B, J and M for the windows, Enter to chat, Esc to close.</p></div>`;
    } else return "";
    return `<section class="hud frame window window-${open}" role="dialog" aria-label="${esc(title)}">
      <header><h3>${esc(title)}</h3><button class="quiet window-close" data-close aria-label="Close">✕</button></header>
      <div class="window-body">${notices}${body}</div></section>`;
  };

  const draw = () => {
    const { character: c, sheet, fight } = view;
    // The fight on the scene: the one in progress, or the one that just ended.
    const shown = fight ?? last?.fight;
    const node = NODES[c.location];
    const art = sceneArt(shown ? shown.nodeId : c.location);
    // Build-time URL from Vite, never user input.
    stage.style.setProperty("--scene-art", art ? `url('${art}')` : "none");
    stage.dataset.mode = fight ? "fight" : last ? "after" : "place";
    if (open === "place" && !serviceAt(c.location)) open = null;
    if (!view.items.some((i) => i.id === picked && i.location !== "warehouse")) picked = null;

    const p = fight?.state.player;
    const res = sheet.resource.kind === "mana" ? "Mana" : "Focus";
    const notices = `${error ? `<p class="bad notice" role="alert">${esc(error)}</p>` : ""}${crafted && !fight ? craftHtml(crafted) : ""}${quested && !fight ? questResultHtml(quested) : ""}`;
    const ready = readyQuests(c, view.items);

    // A window keeps its place when it is redrawn: how far it was scrolled and which folds were open.
    const was = root.querySelector<HTMLElement>(".window");
    const kept = was?.classList.contains(`window-${open}`)
      ? { top: was.querySelector(".window-body")!.scrollTop, folds: [...was.querySelectorAll("details")].map((d) => d.open) }
      : null;

    root.innerHTML = `
      <section class="hud frame unit">
        <div class="face">${portrait(c.race, c.archetype, c.name)}<span class="lvl" title="Level ${c.level}">${c.level}</span></div>
        <div class="who"><h2>${esc(c.name)}</h2>
          ${bar("HP", p ? p.hp : c.hp, sheet.maxHp, "hp", shown ? "player" : undefined)}
          ${bar(res, p ? p.resource : sheet.resource.kind === "mana" ? c.resource : 0, p ? p.maxResource : sheet.resource.max, sheet.resource.kind)}
          ${sheet.xpToNext === null ? bar("XP", 1, 1, "xp") : bar("XP", c.xp, sheet.xpToNext, "xp")}
          ${p ? effectsHtml(p.effects) : ""}
        </div>
      </section>
      ${shown ? targetHtml(shown) : plateHtml(view)}
      ${miniMapHtml(c.location)}
      <div class="hud frame purse" title="Silver">${c.silver} silver</div>
      ${trackerHtml(c, view.items)}
      ${shown ? sceneHtml(shown, view, last?.result.outcome) : placeSceneHtml(view)}
      ${last ? resultHtml(last.result, last.fight) : ""}
      ${notices && !open ? `<div class="hud notices">${notices}</div>` : ""}
      ${fight ? `<p class="hud round">Round ${fight.state.round}${fightNote(fight)}</p>` : ""}
      <div class="hud frame actions">${fight ? fightActions(view) : last ? afterActions(view, last.fight) : placeActions(view)}</div>
      <nav class="hud frame dock">${DOCK.map((d) => {
        const off = fight && (d.id === "bag" || d.id === "map");
        return `<button class="${open === d.id || (d.id === "quests" && open === "place" && node?.service === "quests") ? "on" : ""}" data-open="${d.id}" title="${d.label}${d.key ? ` (${d.key.toUpperCase()})` : ""}" ${off ? "disabled" : ""}>${d.icon}<span>${d.label}</span>${d.id === "quests" && ready ? `<span class="badge">${ready}</span>` : ""}</button>`;
      }).join("")}</nav>
      ${windowHtml(notices)}`;

    const now = root.querySelector<HTMLElement>(".window");
    if (kept && now) {
      now.querySelectorAll("details").forEach((d, i) => (d.open = kept.folds[i] ?? d.open));
      now.querySelector(".window-body")!.scrollTop = kept.top;
    }

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
    root.querySelectorAll<HTMLButtonElement>("button[data-quest]").forEach((b) =>
      b.addEventListener("click", () => {
        const { quest, id: questId, profession } = b.dataset;
        if (quest === "accept") void run(() => api.acceptQuest(id, questId!));
        if (quest === "abandon") void run(() => api.abandonQuest(id, questId!));
        if (quest === "complete") void run(() => api.completeQuest(id, questId!, profession as ProfessionId | undefined));
      }),
    );
    root.querySelector<HTMLInputElement>("input[data-item=charges]")?.addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      void run(() => api.settings(id, on));
    });
    root.querySelector("#hunt")?.addEventListener("click", () => run(() => api.hunt(id)));
    root.querySelector("#challenge")?.addEventListener("click", () => run(() => api.challenge(id)));
    root.querySelector("#rest")?.addEventListener("click", () => run(() => api.rest(id)));
    root.querySelector("#continue")?.addEventListener("click", () => {
      last = null;
      draw();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) => b.addEventListener("click", () => toggle(b.dataset.open as WindowId)));
    root.querySelector("[data-close]")?.addEventListener("click", () => toggle(open));
    root.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((b) =>
      b.addEventListener("click", () => {
        picked = Number(b.dataset.pick);
        draw();
      }),
    );
    root.querySelector("#fullscreen")?.addEventListener("click", () => {
      void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
      open = null;
      draw();
    });
    if (shown) {
      world.combat(logHtml(shown.state), logged !== shown.id);
      logged = shown.id;
    }
    animate();
    world.decorate();
  };

  /** Plays what is new in the fight on screen (the one in progress, or the one that just ended) on its scene. */
  const animate = () => {
    stop();
    stop = () => {};
    const shown = view.fight ?? last?.fight;
    const scene = root.querySelector<HTMLElement>(".scene-fight");
    if (!shown || !scene) return;
    const from = seen?.id === shown.id ? seen.len : 0;
    seen = { id: shown.id, len: shown.state.log.length };
    const over = () => scene.classList.add("scene-settled");
    const { steps, start } = plan(shown.state, from);
    if (!playable(steps)) return over();
    const setHp = (side: Side, hp: number) =>
      root.querySelectorAll<HTMLElement>(`.bar[data-hp="${side}"]`).forEach((b) => setBar(b, hp));
    setHp("player", start.player);
    setHp("enemy", start.enemy);
    stop = play(scene, steps, setHp, over);
  };

  const onKey = (e: KeyboardEvent) => {
    const typing = e.target instanceof HTMLElement && e.target.matches("input, select, textarea");
    const hot = hotkey({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, typing });
    if (!hot) return;
    if (hot.kind === "close") {
      if (typing) (e.target as HTMLElement).blur();
      if (open) toggle(open);
      else world.shrink();
      return;
    }
    e.preventDefault();
    if (hot.kind === "chat") return world.focus();
    if (hot.kind === "open") return toggle(hot.window);
    const button =
      hot.kind === "primary" ? root.querySelector<HTMLButtonElement>(".actions .primary") : root.querySelectorAll<HTMLButtonElement>(".actions [data-key]")[hot.index];
    if (button && !button.disabled) button.click();
  };
  document.addEventListener("keydown", onKey);
  leave = () => {
    stop();
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("in-game");
  };
  draw();
}

/** Redraws a bar made by `bar` at another value. */
function setBar(el: HTMLElement, value: number) {
  const max = Number(el.getAttribute("aria-valuemax"));
  el.setAttribute("aria-valuenow", String(value));
  el.querySelector<HTMLElement>(".fill")!.style.width = `${(max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0).toFixed(1)}%`;
  el.querySelector<HTMLElement>(".label")!.textContent = `${el.getAttribute("aria-label")} ${value} / ${max}`;
}

function bar(label: string, value: number, max: number, kind: string, side?: Side) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="bar bar-${kind}" ${side ? `data-hp="${side}"` : ""} role="meter" aria-label="${label}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${max}" title="${label} ${value} / ${max}">
    <span class="fill" style="width:${pct.toFixed(1)}%"></span><span class="label">${label} ${value} / ${max}</span></div>`;
}

/** The plate at the top of the screen: where the character is. */
function plateHtml(view: GameView) {
  const node = NODES[view.character.location];
  if (!node) return `<section class="hud frame plate"><h2>Lost</h2><p class="small">You are lost. <button data-go="brackwell_square">Return to Brackwell</button></p></section>`;
  const levels = nodeLevels(node);
  return `<section class="hud frame plate">
      <p class="over">${esc(ZONES[node.zone].name)}${levels ? ` · levels ${levels[0]}–${levels[1]}` : " · safe"}</p>
      <h2>${esc(node.name)}</h2>
      <p class="small online-here" data-online="${esc(node.id)}"></p>
    </section>`;
}

/** The same plate in a fight: the foe, its health and what ails it. */
function targetHtml(f: FightView) {
  const e = f.state.enemy;
  const mob = MOBS[f.mobId];
  return `<section class="hud frame plate target role-${mob?.role ?? "normal"}" ${mob ? `title="${esc(mob.description)}"` : ""}>
      <p class="over">Level ${e.level}${mob && mob.role !== "normal" ? ` · ${mob.role}` : ""}</p>
      <h2>${esc(e.name)}</h2>
      ${bar("HP", e.hp, e.maxHp, "enemy", "enemy")}
      ${effectsHtml(e.effects)}
    </section>`;
}

/**
 * The fighters on the stage: the hero on the left and the mob on the right,
 * over the picture of the node the fight is at. `outcome` is set once the
 * fight is over.
 */
function sceneHtml(f: FightView, view: GameView, outcome?: FightResult["outcome"]) {
  const c = view.character;
  const mob = MOBS[f.mobId];
  const art = mobArt(f.mobId);
  // Build-time URLs from Vite, never user input, so they need no escaping.
  return `
    <div class="scene scene-fight role-${mob?.role ?? "normal"}${outcome ? ` scene-${outcome}` : ""}" aria-hidden="true">
      <div class="fighter fighter-player">${portrait(c.race, c.archetype, c.name)}</div>
      <div class="fighter fighter-enemy"><span class="mob-card">${art ? `<img src="${art}" alt="" decoding="async" />` : esc(f.state.enemy.name.charAt(0))}</span></div>
    </div>`;
}

/** The place on the stage: who lives there standing in the picture, and a few words about it. */
function placeSceneHtml(view: GameView) {
  const c = view.character;
  const node = NODES[c.location];
  if (!node) return "";
  const boss = challengeAt(node, c.quests);
  const dweller = (m: (typeof MOBS)[string]) =>
    `<figure class="dweller role-${m.role}" title="${esc(m.description)}">${mobArt(m.id) ? `<img src="${mobArt(m.id)}" alt="" loading="lazy" decoding="async" />` : `<span class="mob-card">${esc(m.name.charAt(0))}</span>`}
      <figcaption>${esc(m.name)} <span class="muted">L${m.level}${m.role !== "normal" ? ` · ${m.role}` : ""}</span></figcaption></figure>`;
  const dwellers = [...node.mobs.map((m) => MOBS[m]!), ...(boss ? [boss] : [])].map(dweller).join("");
  return `
    <div class="scene scene-place">${dwellers ? `<div class="dwellers">${dwellers}</div>` : ""}</div>
    <div class="hud caption">
      <p>${esc(node.description)}</p>
      ${node.service && !OPEN_SERVICES.includes(node.service) ? `<p class="muted small">${esc(SERVICE_NAMES[node.service])}: opens in a later update.</p>` : ""}
      ${boss ? `<p class="small">${esc(boss.description)} Come prepared: charges, draughts and a full bar.</p>` : ""}
      ${node.questFoe && !boss ? `<p class="small muted">Fresh earth is heaped by a tunnel far larger than the rest.</p>` : ""}
      <ul class="small fallen" id="fallen-here" hidden></ul>
    </div>`;
}

/** The action bar away from a fight: hunt or rest, and the doors of the town. */
function placeActions(view: GameView) {
  const c = view.character;
  const node = NODES[c.location];
  if (!node) return "";
  const full = c.hp >= view.sheet.maxHp && (view.sheet.resource.kind !== "mana" || c.resource >= view.sheet.resource.max);
  const boss = challengeAt(node, c.quests);
  const service = serviceAt(c.location);
  // Roads to other zones are on the map; the bar has the places inside the town.
  const roads = node.links
    .map((l) => NODES[l]!)
    .filter((n) => n.zone === node.zone && node.kind === "town")
    .map(
      (n) =>
        `<button class="big quiet" data-go="${esc(n.id)}">${esc(n.name)}<span class="small fallen-mark" data-fallen="${esc(n.id)}"></span><span class="small online" data-online="${esc(n.id)}" data-short></span></button>`,
    )
    .join("");
  return `
    ${node.kind === "hunt" ? `<button id="hunt" class="big primary">Hunt</button>` : ""}
    ${boss ? `<button id="challenge" class="big danger${node.kind === "hunt" ? "" : " primary"}" title="${esc(boss.description)}">Challenge ${esc(boss.name)}</button>` : ""}
    ${service ? `<button class="big primary" data-open="place">${esc(node.name)}</button>` : ""}
    ${node.kind === "town" ? `<button id="rest" class="big${service ? " quiet" : " primary"}" ${full ? "disabled" : ""}>${full ? "Rested" : "Rest"}</button>` : ""}
    ${roads}
    ${node.kind === "hunt" ? `<button class="big quiet" data-open="map">Travel</button>` : ""}`;
}

/** The action bar once a fight is over: on with the hunt, or a look around. */
function afterActions(view: GameView, f: FightView) {
  const c = view.character;
  const again = c.location === f.nodeId && NODES[c.location]?.kind === "hunt";
  return `${again ? `<button id="hunt" class="big primary">Hunt again</button>` : ""}<button id="continue" class="big${again ? " quiet" : " primary"}">Continue</button>`;
}

/** One square of the action bar in a fight. */
function slot(attrs: string, art: string, name: string, o: { badge?: string; disabled?: boolean; title?: string; cls?: string; key?: number } = {}) {
  return `<button class="slot ${o.cls ?? ""}" ${attrs} ${o.key ? `data-key="${o.key}"` : ""} title="${esc(o.title ?? name)}" ${o.disabled ? "disabled" : ""}>
    <span class="slot-art">${art}${o.key ? `<kbd>${o.key}</kbd>` : ""}${o.badge ? `<span class="slot-badge">${esc(o.badge)}</span>` : ""}</span><span class="slot-name">${esc(name)}</span></button>`;
}

/** The action bar in a fight: attack, skills and draughts under the keys 1–9, then flee and auto-battle. */
function fightActions(view: GameView) {
  const f = view.fight!;
  const p = f.state.player;
  const isMage = ARCHETYPES[p.archetype].resource === "mana";
  // Mages regenerate mana before acting, so a skill is usable if it fits after regen.
  const available = isMage ? Math.min(p.maxResource, p.resource + manaRegen(p.maxResource)) : p.resource;
  const weapon = view.items.find((i) => i.location === "equipped" && (itemTemplate(i.templateId) as { slot?: Slot } | undefined)?.slot === "weapon");
  let key = 0;
  const skills = p.skills
    .map((sid) => skillById(sid)!)
    .map((k) =>
      slot(`data-act="skill" data-skill="${esc(k.id)}"`, skillIcon(k.id), k.name, {
        badge: String(k.cost),
        disabled: k.cost > available,
        title: `${k.name} (${k.cost} ${isMage ? "Mana" : "Focus"}): ${k.description}`,
        key: ++key + 1,
      }),
    )
    .join("");
  const draughts = (["healing_draught", "mana_draught"] as const)
    .filter((d) => draughtsLeft(p, d) > 0)
    .map((d) =>
      slot(`data-act="item" data-draught="${d}"`, itemIcon({ templateId: d, rarity: null }), d === "healing_draught" ? "Healing" : "Mana", {
        badge: `×${draughtsLeft(p, d)}`,
        title: `${ITEMS[d]!.name}: ${ITEMS[d]!.description}`,
        key: ++key + 1,
      }),
    )
    .join("");
  return `
    ${slot(`data-act="attack"`, weapon ? itemIcon(weapon) : GLYPHS.attack, "Attack", { cls: "primary", key: 1 })}
    ${skills}
    ${draughts ? `<span class="sep"></span>${draughts}` : ""}
    <span class="sep"></span>
    ${slot(`data-act="flee"`, GLYPHS.flee, "Flee", { cls: "slot-plain" })}
    ${f.canAuto ? slot(`data-act="auto"`, GLYPHS.auto, "Auto", { cls: "slot-plain", title: "Auto-battle: resolve the whole fight at once" }) : ""}`;
}

/** The small print of a fight, after the round number. */
function fightNote(f: FightView) {
  const p = f.state.player;
  const isMage = ARCHETYPES[p.archetype].resource === "mana";
  const charges = p.charges > 0 && p.chargeItem ? ` · ${esc(ITEMS[p.chargeItem]?.name ?? "Charges")}: ${p.charges} left` : "";
  return `${isMage ? ` · Mana +${manaRegen(p.maxResource)} per turn` : ""}${charges}`;
}

/** How a fight ended and what it gave or cost, shown over the scene once the last blow has been played. */
function resultHtml(r: FightResult, f: FightView) {
  const s = f.state;
  const lines: string[] = [];
  if (r.outcome === "won") lines.push(`${esc(s.enemy.name)} is defeated. +${r.xpGained} XP.`);
  if (r.outcome === "fled") lines.push(`You got away from ${esc(s.enemy.name)}.`);
  if (r.outcome === "lost") lines.push(`You have fallen to ${esc(s.enemy.name)}.${r.xpLost ? ` You lose ${r.xpLost} XP.` : ""} You wake up in Brackwell Square, bruised.`);
  if (r.levelsGained) lines.push(`<b class="good">Level up!</b> You are now level ${r.level}. HP and Mana are restored.`);
  if (r.quests?.length)
    lines.push(
      r.outcome === "lost"
        ? `<span class="bad">Quest set back: ${r.quests.map((q) => esc(QUESTS[q]?.name ?? q)).join(", ")}.</span>`
        : `Quest progress: ${r.quests.map((q) => esc(QUESTS[q]?.name ?? q)).join(", ")}.`,
    );
  if (r.loot) {
    const got = r.loot.items.map((i) => `${itemIcon(i)} ${esc(itemName(i))}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`);
    lines.push(`Loot: ${[`${r.loot.silver} silver`, ...got].join(", ")}.`);
    if (r.loot.lost.length)
      lines.push(`<span class="bad">Your bag is full. Left behind: ${r.loot.lost.map((i) => esc(itemName(i))).join(", ")}.</span>`);
  }
  const title = { won: "Victory", lost: "Defeat", fled: "Escaped" }[r.outcome as "won" | "lost" | "fled"] ?? "";
  return `<section class="hud frame banner result banner-${r.outcome}" role="status"><h2>${title}</h2>${lines.map((l) => `<p>${l}</p>`).join("")}</section>`;
}

const SERVICE_NAMES = { shop: "Shop", warehouse: "Warehouse", crafting: "Crafting", quests: "Quests" } as const;

const effectLabel = (e: Effect) => {
  switch (e.kind) {
    case "stun":
      return "stunned";
    case "dot":
      return `${e.name} ${e.turns}`;
    case "weaken":
      return `weakened −${Math.round(e.value * 100)}% (${e.turns})`;
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
      return `${enemy} takes <b>${e.amount}</b> from ${e.name === "bleed" ? "bleeding" : e.name === "burn" ? "the burn" : "the blight"}.`;
    case "curse":
      return `${esc(skillName(e.source))}: ${enemy} is weakened.`;
    case "buff":
      return `${esc(skillName(e.source))}: ${e.kind === "shield" ? `a ward absorbs the next ${e.amount} damage` : e.kind === "guard" ? "you brace yourself" : "your attacks grow stronger"}.`;
    case "fade":
      return `<span class="muted">${
        e.kind === "shield" ? "Your ward fades." : e.kind === "guard" ? "Your guard drops." : e.kind === "weaken" ? `${enemy} shakes off the curse.` : "Your attack bonus fades."
      }</span>`;
  }
}

function logHtml(s: PublicFightState) {
  if (!s.log.length) return `<p class="muted small">${esc(s.enemy.name)} notices you.</p>`;
  return `<ol class="log">${s.log.map((e) => `<li>${describe(e, s)}</li>`).join("")}</ol>`;
}
