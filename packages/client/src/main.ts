import { ARCHETYPES, RACES, type FightState, type LogEntry } from "@l2n/shared";
import "./style.css";

const app = document.querySelector<HTMLElement>("#app")!;

const options = (rec: Record<string, { id: string; name: string }>) =>
  Object.values(rec)
    .map((r) => `<option value="${r.id}">${r.name}</option>`)
    .join("");

app.innerHTML = `
  <h1>Lost to Nostalgia</h1>
  <p class="sub">A turn-based adventure. Prototype build.</p>
  <section class="panel">
    <div class="row">
      <select id="race">${options(RACES)}</select>
      <select id="archetype">${options(ARCHETYPES)}</select>
      <select id="level">${Array.from({ length: 20 }, (_, i) => `<option>${i + 1}</option>`).join("")}</select>
      <button id="fight">Demo fight</button>
    </div>
    <p id="passive" class="muted"></p>
  </section>
  <section class="panel" id="result"><span class="muted">Pick a race and archetype, then start a demo fight.</span></section>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const race = $<HTMLSelectElement>("race");
const showPassive = () => {
  const r = RACES[race.value as keyof typeof RACES];
  $("passive").textContent = `${r.passive.name}: ${r.passive.description}`;
};
race.addEventListener("change", showPassive);
showPassive();

function describe(e: LogEntry, s: FightState): string {
  switch (e.t) {
    case "hit": {
      const [a, b] = e.who === "player" ? ["You", s.enemy.name] : [s.enemy.name, "you"];
      const how = e.source === "attack" ? "hit" : `use ${e.source.replace(/_/g, " ")} on`;
      return `${a} ${how} ${b} for <b>${e.amount}</b>${e.crit ? " (critical!)" : ""}.`;
    }
    case "miss":
      return e.who === "player" ? "You miss." : `${s.enemy.name} misses.`;
    case "heal":
      return `You recover <b class="good">${e.amount}</b> HP.`;
    case "flee":
      return e.success ? "You escape." : "You fail to escape.";
  }
}

$("fight").addEventListener("click", async () => {
  const q = new URLSearchParams({ race: race.value, archetype: $<HTMLSelectElement>("archetype").value, level: $<HTMLSelectElement>("level").value });
  const out = $("result");
  try {
    const res = await fetch(`/api/demo-fight?${q}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = (await res.json()) as FightState;
    const verdict = s.outcome === "won" ? `<b class="good">Victory</b>` : `<b class="bad">${s.outcome}</b>`;
    out.innerHTML = `
      <p>${verdict} in ${s.round - 1} rounds. HP ${s.player.hp}/${s.player.maxHp}.</p>
      <ol class="log">${s.log.map((e) => `<li>${describe(e, s)}</li>`).join("")}</ol>`;
  } catch (err) {
    out.innerHTML = `<span class="bad">Server unreachable (${String(err)}). Is <code>pnpm dev</code> running?</span>`;
  }
});
