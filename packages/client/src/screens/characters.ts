import { PROFESSIONS } from "@l2n/shared";
import { api } from "../api.js";
import { archetypeName, esc, raceName } from "../ui.js";
import { portrait } from "../art.js";

export async function renderCharacters(root: HTMLElement) {
  root.innerHTML = `<p class="muted">Loading characters…</p>`;
  const { characters, maxCharacters } = await api.characters();
  const cards = characters
    .map(
      (c) => `
      <a class="card" href="#/c/${c.id}">
        ${portrait(c.race, c.archetype, c.name)}
        <span><b>${esc(c.name)}</b><br />
        <span class="muted">Level ${c.level} ${esc(raceName(c.race))} ${esc(c.profession ? PROFESSIONS[c.profession].name : archetypeName(c.archetype))}</span></span>
      </a>`,
    )
    .join("");
  root.innerHTML = `
    <section class="panel">
      <h2>Your wayfarers</h2>
      ${characters.length ? `<div class="cards">${cards}</div>` : `<p class="muted">No characters yet. Every road starts in Brackwell.</p>`}
      ${
        characters.length < maxCharacters
          ? `<p><a class="button" href="#/new">Create a character</a></p>`
          : `<p class="muted small">All ${maxCharacters} character slots are used.</p>`
      }
    </section>`;
}
