import { describe, expect, it } from "vitest";
import {
  MOBS,
  NODES,
  RESPAWN_NODE,
  START_NODE,
  applyXp,
  autoResolve,
  buildMob,
  buildPlayer,
  canAutoBattle,
  characterMaxHp,
  characterMaxMana,
  deathXpLoss,
  killXp,
  mobXp,
  pickEncounter,
  playerInputFor,
  settleFight,
  startFight,
  xpToNext,
  type CharacterVitals,
} from "../src/index.js";

const hero = (extra: Partial<CharacterVitals> = {}): CharacterVitals => ({
  name: "Tester",
  race: "dwarf",
  archetype: "mage",
  level: 3,
  xp: 100,
  hp: 40,
  resource: 20,
  ...extra,
});

describe("experience", () => {
  it("carries leftovers across levels and stops at the cap", () => {
    expect(applyXp(1, 150, 20)).toEqual({ level: 2, xp: 10, levelsGained: 1 });
    expect(applyXp(1, 0, xpToNext(1) + xpToNext(2))).toEqual({ level: 3, xp: 0, levelsGained: 2 });
    expect(applyXp(19, 0, 1_000_000)).toEqual({ level: 20, xp: 0, levelsGained: 1 });
    expect(applyXp(20, 0, 500)).toEqual({ level: 20, xp: 0, levelsGained: 0 });
  });

  it("gives humans 5% more XP", () => {
    expect(killXp("dwarf", 5, 5)).toBe(mobXp(5, 5));
    expect(killXp("human", 5, 5)).toBe(Math.round(mobXp(5, 5) * 1.05));
  });

  it("loses 4% of the bar on death but never a level", () => {
    expect(deathXpLoss(5, 1000)).toBe(Math.floor(xpToNext(5) * 0.04));
    expect(deathXpLoss(5, 3)).toBe(3);
    expect(deathXpLoss(20, 0)).toBe(0);
  });

  it("allows auto-battle only against mobs 4+ levels below", () => {
    expect(canAutoBattle(5, 1)).toBe(true);
    expect(canAutoBattle(5, 2)).toBe(false);
  });
});

describe("settling a fight", () => {
  const fightAs = (c: CharacterVitals, mobLevel: number, seed = 1) =>
    autoResolve(startFight(buildPlayer(playerInputFor(c)), buildMob("Mob", mobLevel), seed));

  it("a win grants XP and keeps current HP and mana", () => {
    const c = hero({ hp: 999, resource: 999 });
    const end = fightAs(c, 1);
    expect(end.outcome).toBe("won");
    const { patch, result } = settleFight(c, end);
    expect(result.xpGained).toBe(killXp("dwarf", 1, 3));
    expect(patch).toMatchObject({ level: 3, xp: 100 + result.xpGained, hp: end.player.hp, resource: end.player.resource });
    expect(patch.location).toBeUndefined();
  });

  it("a level-up refills HP and mana", () => {
    const c = hero({ level: 1, xp: xpToNext(1) - 1, hp: 999, resource: 999 });
    const { patch, result } = settleFight(c, fightAs(c, 1));
    expect(result.levelsGained).toBe(1);
    expect(patch).toMatchObject({ level: 2, hp: characterMaxHp("dwarf", "mage", 2), resource: characterMaxMana("dwarf", "mage", 2) });
  });

  it("a death costs XP and respawns in Brackwell at 30%", () => {
    const c = hero({ hp: 5, resource: 0 });
    const end = fightAs(c, 9);
    expect(end.outcome).toBe("lost");
    const { patch, result } = settleFight(c, end);
    expect(result.xpLost).toBe(deathXpLoss(3, 100));
    expect(patch).toEqual({
      level: 3,
      xp: 100 - result.xpLost,
      hp: Math.round(characterMaxHp("dwarf", "mage", 3) * 0.3),
      resource: Math.round(characterMaxMana("dwarf", "mage", 3) * 0.3),
      location: RESPAWN_NODE,
    });
  });
});

describe("world map", () => {
  it("links nodes both ways and only to nodes that exist", () => {
    for (const n of Object.values(NODES)) {
      for (const l of n.links) {
        expect(NODES[l], `${n.id} -> ${l}`).toBeDefined();
        expect(NODES[l]!.links, `${l} -> ${n.id}`).toContain(n.id);
      }
      for (const m of n.mobs) expect(MOBS[m], m).toBeDefined();
      expect(n.kind === "hunt").toBe(n.mobs.length > 0);
    }
    expect(NODES[START_NODE]?.kind).toBe("town");
    expect(NODES[RESPAWN_NODE]?.kind).toBe("town");
  });

  it("meets mobs above your level less often", () => {
    const road = NODES.mossgate_old_road!; // L1, L2, L3 with weights 3, 2, 1 for a level 1 player
    const count = (level: number) => {
      const seen: Record<string, number> = {};
      for (let i = 0; i < 600; i++) {
        const m = pickEncounter(road, level, i / 600);
        seen[m.id] = (seen[m.id] ?? 0) + 1;
      }
      return seen;
    };
    expect(count(1)).toEqual({ mire_rat: 300, hedge_crow: 200, mangy_cur: 100 });
    expect(count(5)).toEqual({ mire_rat: 200, hedge_crow: 200, mangy_cur: 200 });
  });

  it("every node is reachable from the village square", () => {
    const seen = new Set([START_NODE]);
    const queue = [START_NODE];
    while (queue.length) for (const l of NODES[queue.shift()!]!.links) if (!seen.has(l) && seen.add(l)) queue.push(l);
    expect([...seen].sort()).toEqual(Object.keys(NODES).sort());
  });
});
