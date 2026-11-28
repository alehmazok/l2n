/**
 * Quest panels of the game screen: the notice board, the tracker over the
 * scene, the quests window, and what a notice board action did. Buttons carry
 * `data-quest` attributes; game.ts wires them up.
 */
import {
  ARCHETYPES,
  PROFESSIONS,
  QUEST_LIST,
  QUESTS,
  RECIPES,
  isQuestComplete,
  itemName,
  objectiveProgress,
  questItemsFor,
  questProblem,
  questRecipesFor,
  skillsFor,
  type CharacterSummary,
  type Item,
  type Quest,
} from "@l2n/shared";
import type { QuestResult } from "../api.js";
import { esc } from "../ui.js";
import { itemIcon } from "./items.js";
import { skillIcon } from "../icons.js";

const btn = (label: string, attrs: Record<string, string>, extra = "") =>
  `<button class="small${extra ? ` ${extra}` : ""}" ${Object.entries(attrs)
    .map(([k, v]) => `data-${k}="${esc(v)}"`)
    .join(" ")}>${esc(label)}</button>`;

function rewardText(q: Quest, c: CharacterSummary) {
  const parts = [q.reward.xp ? `${q.reward.xp} XP` : "", `${q.reward.silver} silver`, ...questItemsFor(q.reward.items, c.archetype).map((i) => `${itemName(i)} ×${i.quantity}`)];
  if (q.profession) parts.push("your profession");
  return parts.filter(Boolean).join(" · ");
}

function objectivesHtml(q: Quest, c: CharacterSummary, items: Item[]) {
  const e = c.quests[q.id]!;
  const progress = objectiveProgress(q, e, items);
  return `<ul class="objectives small">${q.objectives
    .map((o, i) => {
      const p = progress[i]!;
      const done = p.have >= p.need;
      return `<li class="${done ? "good" : ""}">${done ? "✓" : "○"} ${esc(o.label)}${p.need > 1 || o.kind === "deliver" ? ` ${p.have}/${p.need}` : ""}</li>`;
    })
    .join("")}</ul>`;
}

/** The two professions of the character's archetype, each with a button to take it. */
function professionChoice(c: CharacterSummary) {
  return `<div class="professions">${ARCHETYPES[c.archetype].professions
    .map((p) => {
      const skills = skillsFor(c.archetype, p.id).filter((s) => s.profession === p.id);
      return `<div class="profession"><h4>${esc(p.name)}</h4><p class="small muted">${esc(p.role)}</p>
        <p class="small"><b>${esc(p.passive.name)}</b>: ${esc(p.passive.description)}</p>
        <ul class="small">${skills.map((s) => `<li>${skillIcon(s.id)}<b>${esc(s.name)}</b>: ${esc(s.description)}</li>`).join("")}</ul>
        ${btn(`Become a ${p.name}`, { quest: "complete", id: "wardens_crypt", profession: p.id })}</div>`;
    })
    .join("")}</div><p class="small muted">The choice is for good.</p>`;
}

function activeHtml(q: Quest, c: CharacterSummary, items: Item[]) {
  const e = c.quests[q.id]!;
  const ready = isQuestComplete(q, e, items);
  const turnIn = ready ? (q.profession ? professionChoice(c) : btn("Turn in", { quest: "complete", id: q.id })) : "";
  return `<li class="quest"><b>${esc(q.name)}</b> <span class="muted small">L${q.level}</span>${ready ? ` <span class="good small">ready</span>` : ""}
    <details><summary class="small">The notice</summary><p class="small">${esc(q.story)}</p></details>
    ${objectivesHtml(q, c, items)}
    <p class="small muted">Reward: ${esc(rewardText(q, c))}</p>
    <div class="row">${turnIn}${btn("Abandon", { quest: "abandon", id: q.id }, "quiet")}</div></li>`;
}

function offerHtml(q: Quest, c: CharacterSummary) {
  const gifts = [
    ...questRecipesFor(q, c.archetype).map((r) => `Recipe: ${RECIPES[r]?.name ?? r}`),
    ...questItemsFor(q.onAccept?.items, c.archetype).map((i) => `${itemName(i)} ×${i.quantity}`),
  ];
  return `<li class="quest"><b>${esc(q.name)}</b> <span class="muted small">L${q.level}</span>
    <p class="small">${esc(q.summary)}</p>
    <details><summary class="small">The notice</summary><p class="small">${esc(q.story)}</p></details>
    ${gifts.length ? `<p class="small muted">You get: ${esc(gifts.join(", "))}</p>` : ""}
    <p class="small muted">Reward: ${esc(rewardText(q, c))}</p>
    <div class="row">${btn("Take it", { quest: "accept", id: q.id })}</div></li>`;
}

/** The notice board: quests on, quests on offer, a peek at the next ones, and the ones done. */
export function boardHtml(c: CharacterSummary, items: Item[]) {
  const active = QUEST_LIST.filter((q) => c.quests[q.id]?.status === "active");
  const offered = QUEST_LIST.filter((q) => questProblem(q, c) === null);
  const later = QUEST_LIST.filter((q) => !c.quests[q.id] && questProblem(q, c) !== null).slice(0, 2);
  const done = QUEST_LIST.filter((q) => c.quests[q.id]?.status === "done");
  return `
    <section class="panel"><h3>Your quests</h3>
      ${active.length ? `<ul class="quests">${active.map((q) => activeHtml(q, c, items)).join("")}</ul>` : `<p class="muted small">You are on no quest.</p>`}
    </section>
    <section class="panel"><h3>On the board</h3>
      ${offered.length ? `<ul class="quests">${offered.map((q) => offerHtml(q, c)).join("")}</ul>` : `<p class="muted small">Nothing new for you right now.</p>`}
      ${later.length ? `<p class="small muted">Later: ${later.map((q) => `${esc(q.name)} (level ${q.level})`).join(", ")}</p>` : ""}
      ${done.length ? `<details><summary class="small">Done (${done.length})</summary><ul class="small">${done.map((q) => `<li>${esc(q.name)}</li>`).join("")}</ul></details>` : ""}
    </section>`;
}

const activeQuests = (c: CharacterSummary) => QUEST_LIST.filter((q) => c.quests[q.id]?.status === "active");

/** How many active quests are ready to be turned in. */
export const readyQuests = (c: CharacterSummary, items: Item[]) => activeQuests(c).filter((q) => isQuestComplete(q, c.quests[q.id]!, items)).length;

/** Active quests and their progress, as a few lines over the scene. */
export function trackerHtml(c: CharacterSummary, items: Item[]) {
  const active = activeQuests(c);
  if (!active.length) return "";
  return `<div class="hud tracker">${active
    .map((q) => {
      const ready = isQuestComplete(q, c.quests[q.id]!, items);
      return `<div class="tracked"><b>${esc(q.name)}</b>${ready ? `<div class="good small">Ready to turn in at the Notice Board</div>` : objectivesHtml(q, c, items)}</div>`;
    })
    .join("")}</div>`;
}

/** The quests window away from the notice board: what the character is on, to read. */
export function journalHtml(c: CharacterSummary, items: Item[]) {
  const active = activeQuests(c);
  const entry = (q: Quest) => {
    const ready = isQuestComplete(q, c.quests[q.id]!, items);
    return `<li class="quest"><b>${esc(q.name)}</b> <span class="muted small">L${q.level}</span>${ready ? ` <span class="good small">ready</span>` : ""}
      <p class="small">${esc(q.story)}</p>
      ${objectivesHtml(q, c, items)}
      <p class="small muted">Reward: ${esc(rewardText(q, c))}</p></li>`;
  };
  return `${active.length ? `<ul class="quests">${active.map(entry).join("")}</ul>` : `<p class="muted small">You are on no quest.</p>`}
    <p class="small muted">Quests are taken and turned in at the Notice Board in Brackwell.</p>`;
}

/** What taking, abandoning or turning in a quest did. */
export function questResultHtml(r: QuestResult) {
  const q = QUESTS[r.questId];
  const name = esc(q?.name ?? r.questId);
  const got = r.items.map((i) => `${itemIcon(i)} ${esc(itemName(i))}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`);
  const lines: string[] = [];
  if (r.action === "accepted") {
    lines.push(`You take <b>${name}</b>.`);
    if (got.length) lines.push(`You are given ${got.join(", ")}.`);
  }
  if (r.action === "abandoned") lines.push(`You give up on <b>${name}</b>.`);
  if (r.action === "completed") {
    lines.push(`<b class="good">${name} done.</b> ${esc(q?.done ?? "")}`);
    lines.push(`Reward: ${[r.xp ? `+${r.xp} XP` : "", `${r.silver} silver`, ...got].filter(Boolean).join(", ")}.`);
    if (r.levelsGained) lines.push(`<b class="good">Level up!</b> HP and Mana are restored.`);
    if (r.profession) {
      lines.push(`<b class="good">You are now a ${esc(PROFESSIONS[r.profession].name)}.</b> New skills are in your character sheet.`);
    }
  }
  return `<section class="panel result">${lines.map((l) => `<p>${l}</p>`).join("")}</section>`;
}
