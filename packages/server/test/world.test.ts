import { CHAT_MAX_LENGTH, CHAT_PER_MINUTE, FALLEN_WINDOW_MS, PRESENCE_WINDOW_MS, createRng } from "@l2n/shared";
import { describe, expect, it } from "vitest";
import { fightToEnd, fixedRandom, setup, stack, type App } from "./helpers.js";

/** A clock the test moves by hand. */
function clock(start = Date.UTC(2026, 10, 25, 12, 0)) {
  let t = start;
  return { now: () => new Date(t), tick: (ms: number) => (t += ms) };
}

/** A second player on the same server. */
async function joinAs(app: App, email: string, name: string) {
  const res = await app.inject({ method: "POST", url: "/api/auth/signup", payload: { email, password: "long enough" } });
  const cookie = `l2n_session=${res.cookies.find((x) => x.name === "l2n_session")!.value}`;
  const id = (await app.inject({ method: "POST", url: "/api/characters", headers: { cookie }, payload: { name, race: "dwarf", archetype: "mage" } })).json().character.id as number;
  const post = (path: string, payload?: object) =>
    app.inject({ method: "POST", url: `/api/characters/${id}${path}`, headers: { cookie }, ...(payload ? { payload } : {}) });
  const world = (query = "") => app.inject({ method: "GET", url: `/api/characters/${id}/world${query}`, headers: { cookie } });
  return { id, cookie, post, world };
}

async function world() {
  const c = clock();
  const t = await setup({ now: c.now });
  const get = (query = "") => t.app.inject({ method: "GET", url: `/api/characters/${t.id}/world${query}`, headers: { cookie: t.cookie } });
  const say = (channel: string, text: string) => t.post("/chat", { channel, text });
  return { ...t, clock: c, world: get, say };
}

describe("presence", () => {
  it("counts players seen in the last minutes on each node", async () => {
    const t = await world();
    expect((await t.world()).json()).toEqual({ online: { brackwell_square: 1 }, chat: [], chronicle: [], fallen: [], now: t.clock.now().toISOString() });
    const b = await joinAs(t.app, "b@example.com", "Yrsa");
    await b.post("/move", { to: "brackwell_market" });
    await b.world();
    expect((await t.world()).json().online).toEqual({ brackwell_square: 1, brackwell_market: 1 });
    t.clock.tick(PRESENCE_WINDOW_MS + 1);
    expect((await t.world()).json().online).toEqual({ brackwell_square: 1 });
  });

  it("only for your own character, with valid cursors", async () => {
    const t = await world();
    const b = await joinAs(t.app, "b@example.com", "Yrsa");
    const other = await t.app.inject({ method: "GET", url: `/api/characters/${b.id}/world`, headers: { cookie: t.cookie } });
    expect(other.statusCode).toBe(404);
    expect((await t.world("?chat=abc")).statusCode).toBe(400);
    expect((await t.app.inject({ method: "GET", url: `/api/characters/${t.id}/world` })).statusCode).toBe(401);
  });
});

describe("chat", () => {
  it("zone chat is heard in the zone, global chat everywhere", async () => {
    const t = await world();
    await t.force({ level: 2 });
    const b = await joinAs(t.app, "b@example.com", "Yrsa");
    await b.post("/move", { to: "mossgate_old_road" });
    const zone = await t.say("zone", "  anyone   at the\tmarket?​ ");
    expect(zone.statusCode).toBe(201);
    expect(zone.json().message).toMatchObject({ channel: "brackwell", name: "Grosh", race: "orc", text: "anyone at the market?" });
    t.clock.tick(3000);
    expect((await t.say("global", "<script>alert(1)</script>")).json().message.channel).toBe("global");
    // Yrsa in Mossgate hears only the global line; text comes back as typed, the client escapes it.
    expect((await b.world()).json().chat.map((m: { text: string }) => m.text)).toEqual(["<script>alert(1)</script>"]);
    const mine = (await t.world()).json().chat;
    expect(mine).toHaveLength(2);
    expect((await t.world(`?chat=${mine[0].id}`)).json().chat).toHaveLength(1);
    expect((await t.world(`?chat=${mine[1].id}`)).json().chat).toEqual([]);
  });

  it("global chat opens at level 2", async () => {
    const t = await world();
    expect((await t.say("global", "hi")).json().error).toBe("level_too_low");
    expect((await t.say("zone", "hi")).statusCode).toBe(201);
  });

  it("refuses empty, long and unknown lines", async () => {
    const t = await world();
    expect((await t.say("zone", " \n\t ")).json().message).toBe("Say something first.");
    expect((await t.say("zone", "x".repeat(CHAT_MAX_LENGTH + 1))).json().error).toBe("invalid");
    expect((await t.say("zone", "x".repeat(1001))).statusCode).toBe(400);
    expect((await t.say("trade", "wts sword")).statusCode).toBe(400);
    expect((await t.say("zone", "x".repeat(CHAT_MAX_LENGTH))).statusCode).toBe(201);
  });

  it("is rate limited per account", async () => {
    const t = await world();
    expect((await t.say("zone", "one")).statusCode).toBe(201);
    expect((await t.say("zone", "two")).json().error).toBe("too_fast");
    for (let i = 1; i < CHAT_PER_MINUTE; i++) {
      t.clock.tick(2000);
      expect((await t.say("zone", `line ${i}`)).statusCode).toBe(201);
    }
    t.clock.tick(2000);
    expect((await t.say("zone", "over the limit")).json().error).toBe("too_fast");
    t.clock.tick(60_000);
    expect((await t.say("zone", "calm again")).statusCode).toBe(201);
  });

  it("muted accounts cannot speak and their lines are gone", async () => {
    const t = await world();
    await t.say("zone", "buy gold cheap");
    await t.store.muteByCharacterName("grosh", new Date(t.clock.now().getTime() + 3_600_000));
    t.clock.tick(5000);
    expect((await t.say("zone", "again")).json().error).toBe("muted");
    expect((await t.world()).json().chat).toEqual([]);
    t.clock.tick(3_600_000);
    expect((await t.say("zone", "sorry")).statusCode).toBe(201);
  });

  it("needs your own character standing somewhere", async () => {
    const t = await world();
    const b = await joinAs(t.app, "b@example.com", "Yrsa");
    expect((await t.app.inject({ method: "POST", url: `/api/characters/${b.id}/chat`, headers: { cookie: t.cookie }, payload: { channel: "zone", text: "hi" } })).statusCode).toBe(404);
    await t.force({ location: "nowhere" });
    expect((await t.say("zone", "hello?")).json().error).toBe("lost");
  });
});

describe("fallen markers", () => {
  it("a death leaves a marker on the node for half an hour", async () => {
    const c = clock();
    const t = await setup({ random: fixedRandom(0.99, 0.5), now: c.now });
    await t.force({ hp: 1, location: "mossgate_burrows" });
    await t.post("/hunt");
    const end = await fightToEnd(t.post);
    expect(end.result.outcome).toBe("lost");
    const b = await joinAs(t.app, "b@example.com", "Yrsa");
    const seen = (await b.world()).json().fallen;
    expect(seen).toEqual([{ id: seen[0].id, nodeId: "mossgate_burrows", name: "Grosh", race: "orc", mobId: end.ended.mobId, at: c.now().toISOString() }]);
    c.tick(FALLEN_WINDOW_MS);
    expect((await b.world()).json().fallen).toEqual([]);
  });
});

describe("chronicle", () => {
  it("records the Ashen Warden's defeat, first ever and after", async () => {
    const c = clock();
    const t = await setup({ random: fixedRandom(0, 0.5), now: c.now });
    for (let k = 0; k < 2; k++) {
      await t.force({ level: 20, location: "cinder_wardens_crypt", hp: 99999 });
      await t.post("/challenge");
      await t.store.withCharacter(1, t.id, async (tx) => {
        const s = tx.fight!.state;
        await tx.saveFight({ ...s, enemy: { ...s.enemy, hp: 1 } });
      });
      expect((await fightToEnd(t.post)).result.outcome).toBe("won");
    }
    const entries = (await t.app.inject({ method: "GET", url: `/api/characters/${t.id}/world`, headers: { cookie: t.cookie } })).json().chronicle;
    expect(entries.map((e: { event: unknown; first: boolean; name: string }) => [e.event, e.first, e.name])).toEqual([
      [{ kind: "boss", mobId: "ashen_warden" }, true, "Grosh"],
      [{ kind: "boss", mobId: "ashen_warden" }, false, "Grosh"],
    ]);
    // Ordinary kills are not news.
    await t.force({ level: 1, location: "mossgate_old_road", hp: 99999 });
    await t.post("/hunt");
    await fightToEnd(t.post);
    expect(await t.store.listChronicle(undefined, 10)).toHaveLength(2);
  });

  it("records a profession change", async () => {
    const t = await setup();
    await t.force({ level: 20, location: "brackwell_notice_board", quests: { unlit_path: { status: "done", progress: [0, 1] }, wardens_crypt: { status: "active", progress: [1, 0] } } });
    await t.give(stack("lantern_ward_charm", 1));
    expect((await t.post("/quests/complete", { questId: "wardens_crypt", profession: "reaver" })).statusCode).toBe(200);
    expect((await t.store.listChronicle(undefined, 10)).map((e) => [e.event, e.first])).toEqual([[{ kind: "profession", profession: "reaver" }, true]]);
  });

  it("records rare crafts only", async () => {
    // A seed whose first draw passes the 70% recipe roll and whose second rolls Rare (under 5%).
    const roll = (want: (a: number, b: number) => boolean) => {
      for (let k = 0; k < 100_000; k++) {
        const rng = createRng(Math.floor((k / 100_000) * 2 ** 32));
        if (want(rng.next(), rng.next())) return k / 100_000;
      }
      throw new Error("no such roll");
    };
    const t = await setup({ random: fixedRandom(roll((a, b) => a < 0.7 && b > 0.25), roll((a, b) => a < 0.7 && b < 0.05)) });
    await t.force({ silver: 1000, recipes: ["ironbound_sword"], location: "brackwell_smithy" });
    const inputs = [stack("iron_scrap", 12), stack("bone_shard", 4), stack("rough_hide", 4)];
    await t.give(...inputs);
    const plain = (await t.post("/craft", { recipeId: "ironbound_sword" })).json();
    expect(plain.craft.made[0].rarity).not.toBe("rare");
    const rare = (await t.post("/craft", { recipeId: "ironbound_sword" })).json();
    expect(rare.craft.made[0].rarity).toBe("rare");
    expect((await t.store.listChronicle(undefined, 10)).map((e) => [e.event, e.first])).toEqual([
      [{ kind: "rare_craft", templateId: "ironbound_warrior_weapon", itemLevel: rare.craft.made[0].itemLevel }, true],
    ]);
  });
});
