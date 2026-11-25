import {
  ARCHETYPES,
  CHARACTER_NAME_MAX,
  RACES,
  characterSheet,
  starterGear,
  normalizeCharacterName,
  validateCharacterName,
  type ArchetypeId,
  type RaceId,
} from "@l2n/shared";
import { api, ApiError } from "../api.js";
import { $, STAT_LABELS, esc, portrait, sheetHtml } from "../ui.js";

const mods = (m: Partial<Record<keyof typeof STAT_LABELS, number>>) =>
  Object.entries(m)
    .map(([k, v]) => `${STAT_LABELS[k as keyof typeof STAT_LABELS].slice(0, 3)} ${v! > 0 ? "+" : "−"}${Math.abs(v!)}`)
    .join(", ");

export function renderCreate(root: HTMLElement, onCreated: (id: number) => void) {
  let race: RaceId = "human";
  let archetype: ArchetypeId = "warrior";

  const raceCards = Object.values(RACES)
    .map(
      (r) => `
      <label class="choice">
        <input type="radio" name="race" value="${r.id}" ${r.id === race ? "checked" : ""} />
        ${portrait(r.id, r.name)}
        <span><b>${esc(r.name)}</b> <span class="muted small">${mods(r.statMods)}</span><br />
        <span class="small">${esc(r.blurb)}</span></span>
      </label>`,
    )
    .join("");
  const archetypeCards = Object.values(ARCHETYPES)
    .map(
      (a) => `
      <label class="choice">
        <input type="radio" name="archetype" value="${a.id}" ${a.id === archetype ? "checked" : ""} />
        <span><b>${esc(a.name)}</b> <span class="muted small">${mods(a.statMods)}</span><br />
        <span class="small">Uses ${a.resource === "mana" ? "Mana" : "Focus"}. At level 20: ${a.professions.map((p) => esc(p.name)).join(" or ")}.</span></span>
      </label>`,
    )
    .join("");

  root.innerHTML = `
    <form id="create" class="stack">
      <section class="panel">
        <h2>New character</h2>
        <label>Name <input name="name" maxlength="${CHARACTER_NAME_MAX}" autocomplete="off" required placeholder="Letters only, 3–16" /></label>
        <p class="bad small" id="name-error" role="alert"></p>
      </section>
      <section class="panel"><h3>Race</h3><div class="choices">${raceCards}</div></section>
      <section class="panel"><h3>Archetype</h3><div class="choices">${archetypeCards}</div></section>
      <section class="panel"><h3>Level 1 preview</h3><div id="preview"></div></section>
      <p class="bad" id="error" role="alert"></p>
      <div class="row"><button type="submit">Begin in Brackwell</button><a href="#/">Cancel</a></div>
    </form>`;

  const form = $<HTMLFormElement>("#create", root);
  const nameInput = $<HTMLInputElement>("input[name=name]", form);
  const preview = () => ($("#preview", root).innerHTML = sheetHtml(characterSheet(race, archetype, 1, starterGear(archetype))));
  form.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "race") race = t.value as RaceId;
    if (t.name === "archetype") archetype = t.value as ArchetypeId;
    preview();
  });
  nameInput.addEventListener("input", () => {
    const v = nameInput.value.trim();
    $("#name-error", root).textContent = v ? (validateCharacterName(normalizeCharacterName(v)) ?? "") : "";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = normalizeCharacterName(nameInput.value);
    const problem = validateCharacterName(name);
    if (problem) {
      $("#name-error", root).textContent = problem;
      return;
    }
    const btn = $<HTMLButtonElement>("button[type=submit]", form);
    btn.disabled = true;
    try {
      const { character } = await api.createCharacter(name, race, archetype);
      onCreated(character.id);
    } catch (err) {
      $("#error", root).textContent = err instanceof ApiError ? err.message : String(err);
      btn.disabled = false;
    }
  });
  preview();
}
