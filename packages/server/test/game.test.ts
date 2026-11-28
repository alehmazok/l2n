import {
  MOBS,
  NODES,
  characterMaxHp,
  characterMaxMana,
  deathXpLoss,
  killXp,
  xpToNext,
} from "@l2n/shared";
import { describe, expect, it } from "vitest";
import { fightToEnd, fixedRandom, setup } from "./helpers.js";

describe("map", () => {
  it("starts in Brackwell Square and moves only along links", async () => {
    const { post, get } = await setup();
    expect((await get()).json()).toMatchObject({ character: { location: "brackwell_square" }, fight: null });
    expect((await post("/move", { to: "mossgate_drowned_mill" })).json().error).toBe("not_adjacent");
    expect((await post("/move", { to: "atlantis" })).json().error).toBe("unknown_node");
    const moved = await post("/move", { to: "mossgate_old_road" });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().character.location).toBe("mossgate_old_road");
  });

  it("rests only in town, refilling HP and mana", async () => {
    const { post, force } = await setup({ race: "dawn_elf", archetype: "mage" });
    await force({ hp: 3, resource: 1 });
    const rested = (await post("/rest")).json().character;
    expect(rested).toMatchObject({ hp: characterMaxHp("dawn_elf", "mage", 1), resource: characterMaxMana("dawn_elf", "mage", 1) });
    await post("/move", { to: "mossgate_old_road" });
    expect((await post("/rest")).json().error).toBe("not_in_town");
  });

  it("rests on walking into town, but not on the roads outside it", async () => {
    const { post, force } = await setup({ race: "dawn_elf", archetype: "mage" });
    const full = { hp: characterMaxHp("dawn_elf", "mage", 1), resource: characterMaxMana("dawn_elf", "mage", 1) };
    await force({ location: "mossgate_old_road", hp: 3, resource: 1 });
    expect((await post("/move", { to: "mossgate_drowned_mill" })).json().character).toMatchObject({ hp: 3, resource: 1 });
    await post("/move", { to: "mossgate_old_road" });
    expect((await post("/move", { to: "brackwell_square" })).json().character).toMatchObject({ location: "brackwell_square", ...full });
    // Moving between the places of the town rests too, e.g. after a respawn at 30%.
    await force({ hp: 3, resource: 1 });
    expect((await post("/move", { to: "brackwell_market" })).json().character).toMatchObject(full);
  });

  it("returns 404 for someone else's character", async () => {
    const a = await setup();
    const res = await a.app.inject({ method: "POST", url: `/api/characters/${a.id + 999}/rest`, headers: { cookie: a.cookie } });
    expect(res.statusCode).toBe(404);
  });
});

describe("fights", () => {
  it("hunts only on hunting grounds and only one fight at a time", async () => {
    const { post } = await setup();
    expect((await post("/hunt")).json().error).toBe("not_hunting_ground");
    await post("/move", { to: "mossgate_old_road" });
    const hunt = await post("/hunt");
    expect(hunt.statusCode).toBe(200);
    const fight = hunt.json().fight;
    expect(fight.mobId).toBe(NODES.mossgate_old_road!.mobs[0]); // random() = 0 picks the first mob
    expect(fight.state.enemy.name).toBe(MOBS.mire_rat!.name);
    expect(fight.state.rngState).toBeUndefined();
    expect((await post("/hunt")).json().error).toBe("in_fight");
    expect((await post("/move", { to: "brackwell_square" })).json().error).toBe("in_fight");
  });

  it("persists the fight between rounds and rejects bad actions", async () => {
    const { post, get } = await setup();
    await post("/move", { to: "mossgate_old_road" });
    await post("/hunt");
    const r1 = (await post("/fight", { action: { type: "attack" } })).json();
    expect(r1.fight.state.round).toBe(2);
    expect((await get()).json().fight.state).toEqual(r1.fight.state);
    expect((await post("/fight", { action: { type: "skill", skillId: "falling_star" } })).json().error).toBe("invalid_action");
    expect((await post("/fight", { action: { type: "dance" } })).statusCode).toBe(400);
    expect((await post("/fight", { action: { type: "auto" } })).json().error).toBe("auto_not_allowed");
    expect((await get()).json().fight.state.round).toBe(2);
  });

  it("a win grants XP and keeps the damage taken", async () => {
    const { post } = await setup();
    await post("/move", { to: "mossgate_old_road" });
    await post("/hunt");
    const end = await fightToEnd(post);
    expect(end.result).toMatchObject({ outcome: "won", xpGained: killXp("orc", 1, 1), xpLost: 0, levelsGained: 0 });
    expect(end.fight).toBeNull();
    expect(end.ended.state.outcome).toBe("won");
    expect(end.ended.state.rngState).toBeUndefined();
    expect(end.character.xp).toBe(killXp("orc", 1, 1));
    expect(end.character.hp).toBeLessThanOrEqual(characterMaxHp("orc", "warrior", 1));
    expect(end.character.location).toBe("mossgate_old_road");
  });

  it("levels up on enough XP and refills HP", async () => {
    const { post, force } = await setup();
    await force({ xp: xpToNext(1) - 1, hp: 40 });
    await post("/move", { to: "mossgate_old_road" });
    await post("/hunt");
    const end = await fightToEnd(post);
    expect(end.result).toMatchObject({ outcome: "won", levelsGained: 1, level: 2 });
    expect(end.character).toMatchObject({ level: 2, hp: characterMaxHp("orc", "warrior", 2) });
    expect(end.sheet.skills.learned.map((s: { id: string }) => s.id)).toEqual(["heavy_blow"]);
  });

  it("death costs XP and respawns in Brackwell", async () => {
    // Pick the strongest mob of the Burrows and arrive with 1 HP.
    const { post, force } = await setup({ random: fixedRandom(0.99, 0.5) });
    await force({ xp: 100, hp: 1, location: "mossgate_burrows" });
    await post("/hunt");
    const end = await fightToEnd(post);
    expect(end.result).toMatchObject({ outcome: "lost", xpLost: deathXpLoss(1, 100) });
    expect(end.character).toMatchObject({
      location: "brackwell_square",
      xp: 100 - deathXpLoss(1, 100),
      hp: Math.round(characterMaxHp("orc", "warrior", 1) * 0.3),
    });
  });

  it("auto-battles mobs 4+ levels below in one request", async () => {
    const { post, force } = await setup();
    await force({ level: 6, hp: characterMaxHp("orc", "warrior", 6), location: "mossgate_old_road" });
    const hunt = (await post("/hunt")).json();
    expect(hunt.fight.canAuto).toBe(true);
    const end = (await post("/fight", { action: { type: "auto" } })).json();
    expect(end.result).toMatchObject({ outcome: "won", xpGained: killXp("orc", 1, 6) });
    expect(end.fight).toBeNull();
  });

  it("fleeing ends the fight without XP", async () => {
    const { post } = await setup();
    await post("/move", { to: "mossgate_old_road" });
    await post("/hunt");
    for (let i = 0; i < 30; i++) {
      const res = (await post("/fight", { action: { type: "flee" } })).json();
      if (res.result) {
        expect(res.result).toMatchObject({ xpGained: 0 });
        expect(["fled", "lost"]).toContain(res.result.outcome);
        return;
      }
    }
    throw new Error("never escaped");
  });
});
