import { describe, expect, it } from "vitest";
import {
  ARCHETYPES,
  RACES,
  SKILLS,
  armourFor,
  autoResolve,
  buildMob,
  buildPlayer,
  characterStats,
  resolveRound,
  startFight,
  weaponPowerFor,
  type ArchetypeId,
  type RaceId,
} from "../src/index.js";

function player(race: RaceId, archetype: ArchetypeId, level: number) {
  const tier = level >= 10 ? 2 : 1;
  return buildPlayer({
    name: "Tester",
    archetype,
    level,
    stats: characterStats(race, archetype),
    weaponPower: weaponPowerFor(tier, level),
    armour: armourFor(tier, level),
    skills: SKILLS.filter((s) => s.archetype === archetype && s.level <= level).map((s) => s.id),
    charges: 0,
  });
}

describe("combat", () => {
  it("is deterministic for the same seed", () => {
    const a = autoResolve(startFight(player("human", "warrior", 5), buildMob("Bog Rat", 5), 42));
    const b = autoResolve(startFight(player("human", "warrior", 5), buildMob("Bog Rat", 5), 42));
    expect(a).toEqual(b);
  });

  it("rejects actions after the fight ends", () => {
    const done = autoResolve(startFight(player("orc", "warrior", 5), buildMob("Bog Rat", 1), 1));
    expect(done.outcome).toBe("won");
    expect(() => resolveRound(done, { type: "attack" })).toThrow();
  });

  it("rejects unaffordable skills", () => {
    const s = startFight(player("human", "warrior", 1), buildMob("Bog Rat", 1), 1);
    expect(() => resolveRound(s, { type: "skill", skillId: "heavy_blow" })).toThrow();
  });

  // Balance guard from docs/design.md: an even-level normal mob should take
  // about 2-7 rounds (mages burst on a full mana bar) and the player should usually win.
  for (const archetype of Object.keys(ARCHETYPES) as ArchetypeId[]) {
    for (const race of Object.keys(RACES) as RaceId[]) {
      for (const level of [1, 10, 20]) {
        it(`${race} ${archetype} L${level} beats an even mob in 2-7 rounds`, () => {
          let wins = 0;
          let rounds = 0;
          const n = 200;
          for (let seed = 1; seed <= n; seed++) {
            const end = autoResolve(startFight(player(race, archetype, level), buildMob("Mob", level), seed));
            if (end.outcome === "won") wins++;
            rounds += end.round - 1;
          }
          expect(wins / n).toBeGreaterThan(0.95);
          const avg = rounds / n;
          expect(avg).toBeGreaterThanOrEqual(2);
          expect(avg).toBeLessThanOrEqual(7);
        });
      }
    }
  }
});
