import type { ArchetypeId, NewItem, RaceId } from "@l2n/shared";
import { expect } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore, type CharacterPatch } from "../src/store/index.js";

export type App = ReturnType<typeof buildApp>;

/** Deterministic "random": cycles through the given values. */
export const fixedRandom = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

export async function setup(opts: { race?: RaceId; archetype?: ArchetypeId; random?: () => number } = {}) {
  const store = new MemoryStore();
  const app = buildApp({ store, random: opts.random ?? fixedRandom(0, 0.5) });
  const res = await app.inject({ method: "POST", url: "/api/auth/signup", payload: { email: "g@example.com", password: "long enough" } });
  const c = res.cookies.find((x) => x.name === "l2n_session")!;
  const cookie = `l2n_session=${c.value}`;
  const created = await app.inject({
    method: "POST",
    url: "/api/characters",
    headers: { cookie },
    payload: { name: "Grosh", race: opts.race ?? "orc", archetype: opts.archetype ?? "warrior" },
  });
  const id = created.json().character.id as number;
  const accountId = (await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } })).json().account.id as number;
  const post = (path: string, payload?: object) =>
    app.inject({ method: "POST", url: `/api/characters/${id}${path}`, headers: { cookie }, ...(payload ? { payload } : {}) });
  const get = () => app.inject({ method: "GET", url: `/api/characters/${id}`, headers: { cookie } });
  /** Set character fields directly, for scenarios like "already level 9". */
  const force = (patch: CharacterPatch) =>
    store.withCharacter(accountId, id, (tx) => tx.updateCharacter(patch));
  /** Put items straight into the character's possession. */
  const give = (...items: NewItem[]) =>
    store.withCharacter(accountId, id, async (tx) => {
      for (const i of items) await tx.addItem(i);
    });
  const items = () => store.listItems(id);
  return { app, store, cookie, id, post, get, force, give, items };
}

export async function fightToEnd(post: (p: string, b?: object) => Promise<Awaited<ReturnType<App["inject"]>>>) {
  for (let i = 0; i < 60; i++) {
    const res = await post("/fight", { action: { type: "attack" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    if (body.result) return body;
  }
  throw new Error("fight did not end");
}


/** A stack of something, in the bag unless told otherwise. */
export const stack = (templateId: string, quantity: number, location: NewItem["location"] = "bag"): NewItem => ({
  templateId,
  itemLevel: null,
  rarity: null,
  bonus: null,
  quantity,
  location,
});

export const gear = (templateId: string, itemLevel: number, extra: Partial<NewItem> = {}): NewItem => ({
  templateId,
  itemLevel,
  rarity: "common",
  bonus: null,
  quantity: 1,
  location: "bag",
  ...extra,
});
