import type { FightState, LogEntry } from "@l2n/shared";
import { api, ApiError } from "../api.js";
import { $, archetypeName, esc, portrait, raceName, sheetHtml } from "../ui.js";

export async function renderSheet(root: HTMLElement, id: number) {
  root.innerHTML = `<p class="muted">Loading…</p>`;
  let data;
  try {
    data = await api.character(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      root.innerHTML = `<section class="panel"><p>Character not found.</p><a href="#/">Back</a></section>`;
      return;
    }
    throw err;
  }
  const { character: c, sheet } = data;
  const xp = sheet.xpToNext === null ? "max level" : `${c.xp} / ${sheet.xpToNext}`;
  root.innerHTML = `
    <section class="panel">
      <div class="row head">
        ${portrait(c.race, c.name)}
        <div><h2>${esc(c.name)}</h2>
        <span class="muted">Level ${c.level} ${esc(raceName(c.race))} ${esc(archetypeName(c.archetype))}</span></div>
      </div>
      <p class="small">HP ${c.hp} / ${sheet.maxHp} · XP ${xp} · ${c.silver} silver · Brackwell</p>
      ${sheetHtml(sheet)}
      <p class="muted small">Racial passives are shown here but start applying with real fights (next stage).</p>
    </section>
    <section class="panel">
      <h3>Practice fight</h3>
      <p class="muted small">An auto-battle against a training mob of your level. Nothing is saved yet.</p>
      <button id="fight">Fight</button>
      <div id="result"></div>
    </section>
    <p><a href="#/">← All characters</a></p>`;

  $("#fight", root).addEventListener("click", async () => {
    const out = $("#result", root);
    try {
      const s = await api.demoFight(c.race, c.archetype, c.level);
      const verdict = s.outcome === "won" ? `<b class="good">Victory</b>` : `<b class="bad">${esc(s.outcome)}</b>`;
      out.innerHTML = `
        <p>${verdict} in ${s.round - 1} rounds. HP ${s.player.hp}/${s.player.maxHp}.</p>
        <ol class="log">${s.log.map((e) => `<li>${describe(e, s)}</li>`).join("")}</ol>`;
    } catch (err) {
      out.innerHTML = `<p class="bad">${esc(err instanceof Error ? err.message : err)}</p>`;
    }
  });
}

function describe(e: LogEntry, s: FightState): string {
  const enemy = esc(s.enemy.name);
  switch (e.t) {
    case "hit": {
      const [a, b] = e.who === "player" ? ["You", enemy] : [enemy, "you"];
      const how = e.source === "attack" ? "hit" : `use ${esc(e.source.replace(/_/g, " "))} on`;
      return `${a} ${how} ${b} for <b>${e.amount}</b>${e.crit ? " (critical!)" : ""}.`;
    }
    case "miss":
      return e.who === "player" ? "You miss." : `${enemy} misses.`;
    case "heal":
      return `You recover <b class="good">${e.amount}</b> HP.`;
    case "flee":
      return e.success ? "You escape." : "You fail to escape.";
  }
}
