import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

type App = ReturnType<typeof buildApp>;

/** Signs up and returns the session cookie header for later requests. */
async function signup(app: App, email = "hero@example.com", password = "correct horse") {
  const res = await app.inject({ method: "POST", url: "/api/auth/signup", payload: { email, password } });
  expect(res.statusCode).toBe(201);
  const c = res.cookies.find((x) => x.name === "l2n_session")!;
  return { cookie: `l2n_session=${c.value}`, raw: c };
}

describe("auth", () => {
  it("signs up, reports the session, and logs out", async () => {
    const app = buildApp();
    const { cookie, raw } = await signup(app, "  Hero@Example.com ");
    expect(raw.httpOnly).toBe(true);
    expect(raw.sameSite).toBe("Lax");

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.json()).toEqual({ account: { id: expect.any(Number), email: "hero@example.com" } });

    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    const after = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it("rejects bad signups", async () => {
    const app = buildApp();
    const bad = async (payload: object) =>
      (await app.inject({ method: "POST", url: "/api/auth/signup", payload })).statusCode;
    expect(await bad({ email: "nope", password: "long enough" })).toBe(400);
    expect(await bad({ email: "a@example.com", password: "short" })).toBe(400);
    expect(await bad({ email: "a@example.com" })).toBe(400);
    await signup(app, "a@example.com");
    expect(await bad({ email: "A@example.com", password: "long enough" })).toBe(409);
  });

  it("logs in with the right password only", async () => {
    const app = buildApp();
    await signup(app);
    const login = (password: string, email = "hero@example.com") =>
      app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
    expect((await login("wrong password")).statusCode).toBe(401);
    expect((await login("correct horse", "ghost@example.com")).statusCode).toBe(401);
    const ok = await login("correct horse");
    expect(ok.statusCode).toBe(200);
    expect(ok.cookies.some((c) => c.name === "l2n_session")).toBe(true);
  });

  it("locks an email after repeated failed logins", async () => {
    const app = buildApp();
    await signup(app);
    const login = (password: string) =>
      app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "hero@example.com", password } });
    for (let i = 0; i < 10; i++) expect((await login("wrong password")).statusCode).toBe(401);
    expect((await login("correct horse")).statusCode).toBe(429);
  });

  it("expires sessions", async () => {
    let t = new Date("2026-01-01T00:00:00Z").getTime();
    const app = buildApp({ now: () => new Date(t) });
    const { cookie } = await signup(app);
    expect((await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } })).statusCode).toBe(200);
    t += 31 * 24 * 60 * 60 * 1000;
    expect((await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } })).statusCode).toBe(401);
  });

  it("ignores forged cookies", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/api/auth/me", headers: { cookie: "l2n_session=forged" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("characters", () => {
  it("requires a login", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/api/characters" });
    expect(res.statusCode).toBe(401);
  });

  it("creates, lists and shows characters with a sheet", async () => {
    const app = buildApp();
    const { cookie } = await signup(app);
    const create = await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { cookie },
      payload: { name: "grOSH", race: "orc", archetype: "warrior" },
    });
    expect(create.statusCode).toBe(201);
    const { character, sheet } = create.json();
    expect(character).toMatchObject({ name: "Grosh", level: 1, hp: 72, resource: 0, location: "brackwell" });
    expect(sheet.maxHp).toBe(72);

    const list = (await app.inject({ method: "GET", url: "/api/characters", headers: { cookie } })).json();
    expect(list).toEqual({ characters: [character], maxCharacters: 4 });

    const one = await app.inject({ method: "GET", url: `/api/characters/${character.id}`, headers: { cookie } });
    expect(one.json().sheet.passive.name).toBe("Thick Hide");
  });

  it("validates names, races and archetypes", async () => {
    const app = buildApp();
    const { cookie } = await signup(app);
    const create = (payload: object) =>
      app.inject({ method: "POST", url: "/api/characters", headers: { cookie }, payload });
    expect((await create({ name: "Al", race: "orc", archetype: "warrior" })).statusCode).toBe(400);
    expect((await create({ name: "Al dric", race: "orc", archetype: "warrior" })).statusCode).toBe(400);
    expect((await create({ name: "Aldric", race: "goblin", archetype: "warrior" })).statusCode).toBe(400);
    expect((await create({ name: "Aldric", race: "orc", archetype: "rogue" })).statusCode).toBe(400);
    // Unknown fields are dropped, so a client cannot pick its own level.
    const ok = await create({ name: "Aldric", race: "human", archetype: "mage", level: 20 });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().character.level).toBe(1);
    expect(ok.json().character.resource).toBe(ok.json().sheet.resource.max);
  });

  it("keeps names unique across accounts and limits characters per account", async () => {
    const app = buildApp();
    const a = await signup(app, "a@example.com");
    const b = await signup(app, "b@example.com");
    const create = (cookie: string, name: string) =>
      app.inject({ method: "POST", url: "/api/characters", headers: { cookie }, payload: { name, race: "dwarf", archetype: "warrior" } });
    expect((await create(a.cookie, "Brannoc")).statusCode).toBe(201);
    const taken = await create(b.cookie, "brannoc");
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error).toBe("name_taken");
    for (const n of ["Dorra", "Kettil", "Hrun"]) expect((await create(a.cookie, n)).statusCode).toBe(201);
    const full = await create(a.cookie, "Fifth");
    expect(full.json().error).toBe("limit_reached");
  });

  it("hides other accounts' characters", async () => {
    const app = buildApp();
    const a = await signup(app, "a@example.com");
    const b = await signup(app, "b@example.com");
    const made = await app.inject({
      method: "POST",
      url: "/api/characters",
      headers: { cookie: a.cookie },
      payload: { name: "Secret", race: "dusk_elf", archetype: "mage" },
    });
    const id = made.json().character.id;
    expect((await app.inject({ method: "GET", url: `/api/characters/${id}`, headers: { cookie: b.cookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/characters/abc`, headers: { cookie: a.cookie } })).statusCode).toBe(404);
  });
});
