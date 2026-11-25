import { ARCHETYPES, RACES, type CharacterSheet, type StatName } from "@l2n/shared";
import { skillIcon } from "./icons.js";

/** Escape text for safe use inside HTML. Use for every value that came from a user or the server. */
export const esc = (v: unknown) =>
  String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel)!;

export const STAT_LABELS: Record<StatName, string> = {
  might: "Might",
  agility: "Agility",
  vitality: "Vitality",
  intellect: "Intellect",
  spirit: "Spirit",
};

/** Placeholder portrait until real art exists: the first letter on a tinted tile. */
export function portrait(race: keyof typeof RACES, label: string) {
  return `<span class="portrait portrait-${race}" aria-hidden="true">${esc(label.charAt(0))}</span>`;
}

export const raceName = (id: keyof typeof RACES) => RACES[id].name;
export const archetypeName = (id: keyof typeof ARCHETYPES) => ARCHETYPES[id].name;

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/** The numbers part of a character sheet, shared by the create preview and the sheet screen. */
export function sheetHtml(s: CharacterSheet) {
  const stats = (Object.keys(STAT_LABELS) as StatName[])
    .map((k) => `<tr><th>${STAT_LABELS[k]}</th><td>${s.stats[k]}</td></tr>`)
    .join("");
  const res = s.resource.kind === "mana" ? "Mana" : "Focus";
  const skill = (k: CharacterSheet["skills"]["learned"][number], learned: boolean) =>
    `<li class="${learned ? "" : "muted"}">${skillIcon(k.id)}<b>${esc(k.name)}</b> <span class="muted">L${k.level} · ${k.cost} ${res}</span></li>`;
  return `
    <div class="sheet">
      <table class="stats">${stats}</table>
      <table class="stats">
        <tr><th>HP</th><td>${s.maxHp}</td></tr>
        <tr><th>${res}</th><td>${s.resource.max}${s.resource.kind === "focus" ? " (builds in fight)" : ""}</td></tr>
        <tr><th>Attack</th><td>${s.attack}</td></tr>
        <tr><th>Defence</th><td>${s.defence}</td></tr>
        <tr><th>Crit</th><td>${pct(s.critChance)}</td></tr>
      </table>
    </div>
    <p><b>${esc(s.passive.name)}</b>: ${esc(s.passive.description)}</p>
    ${s.professionPassive ? `<p><b>${esc(s.professionPassive.name)}</b>: ${esc(s.professionPassive.description)}</p>` : ""}
    <ul class="skills">${s.skills.learned.map((k) => skill(k, true)).join("")}${s.skills.upcoming.map((k) => skill(k, false)).join("")}</ul>`;
}
