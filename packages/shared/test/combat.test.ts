import { describe, expect, it } from "vitest";
import {
  ARCHETYPES,
  RACES,
  autoResolve,
  buildMob,
  buildPlayer,
  characterMaxHp,
  playerInputFor,
  publicFight,
  resolveRound,
  startFight,
  type ArchetypeId,
  type FightState,
  type RaceId,
} from "../src/index.js";

/** A full-health character of this race, archetype and level, as the server builds them. */
function player(race: RaceId, archetype: ArchetypeId, level: number, extra: { mana?: number; hp?: number } = {}) {
  const input = playerInputFor({ name: "Tester", race, archetype, level, xp: 0, hp: extra.hp ?? 9999, resource: extra.mana ?? 9999 });
  return buildPlayer(input);
}

/** Replace the enemy with a punching bag that never dies quickly and never hits hard. */
function sandbag(state: FightState): FightState {
  return { ...state, enemy: { ...state.enemy, hp: 10_000, maxHp: 10_000, atk: 1 } };
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

  it("rejects unaffordable and unknown skills", () => {
    const s = startFight(player("human", "warrior", 1), buildMob("Bog Rat", 1), 1);
    expect(() => resolveRound(s, { type: "skill", skillId: "heavy_blow" })).toThrow();
    expect(() => resolveRound(s, { type: "skill", skillId: "falling_star" })).toThrow();
  });

  it("carries current HP and mana into the fight", () => {
    const p = player("dawn_elf", "mage", 3, { hp: 10, mana: 4 });
    expect(p.hp).toBe(10);
    expect(p.resource).toBe(4);
    expect(player("orc", "warrior", 3, { mana: 99 }).resource).toBe(0);
  });

  it("applies racial passives", () => {
    expect(player("orc", "warrior", 1).maxHp).toBe(characterMaxHp("orc", "warrior", 1));
    expect(player("orc", "warrior", 1).maxHp).toBe(Math.round(72 * 1.08));
    expect(player("dawn_elf", "mage", 1).critBonus).toBe(0.03);
    expect(player("dusk_elf", "mage", 1).damageBonus).toBe(0.05);
  });

  it("hides the RNG state from the client", () => {
    const s = publicFight(startFight(player("human", "mage", 1), buildMob("Bog Rat", 1), 5));
    expect("rngState" in s).toBe(false);
  });

  it("stuns: the enemy loses its next action", () => {
    // Find a seed where Shield Bash lands its stun.
    for (let seed = 1; seed < 100; seed++) {
      let s = sandbag(startFight(player("orc", "warrior", 4), buildMob("Rat", 4), seed));
      s = { ...s, player: { ...s.player, resource: 2 } };
      const after = resolveRound(s, { type: "skill", skillId: "shield_bash" });
      const fresh = after.log.slice(s.log.length);
      if (fresh.some((e) => e.t === "stun")) {
        expect(fresh.at(-1)).toEqual({ t: "stunned" });
        expect(after.enemy.effects).toEqual([]);
        return;
      }
    }
    throw new Error("no stun in 100 seeds");
  });

  it("War Cry raises attack for 3 more rounds", () => {
    let s = sandbag(startFight(player("orc", "warrior", 7), buildMob("Rat", 7), 3));
    s = { ...s, player: { ...s.player, resource: 1 } };
    s = resolveRound(s, { type: "skill", skillId: "war_cry" });
    expect(s.player.effects).toMatchObject([{ kind: "attack_up", turns: 3 }]);
    for (const left of [2, 1]) {
      s = resolveRound(s, { type: "attack" });
      expect(s.player.effects).toMatchObject([{ kind: "attack_up", turns: left }]);
    }
    s = resolveRound(s, { type: "attack" });
    expect(s.player.effects).toEqual([]);
    expect(s.log.at(-1)).toEqual({ t: "fade", kind: "attack_up" });
  });

  it("bleed and burn tick at the end of each round", () => {
    for (const [race, arch, skill, ticks, cost] of [
      ["orc", "warrior", "rending_cut", 3, 3],
      ["dusk_elf", "mage", "searing_brand", 4, 16],
    ] as const) {
      for (let seed = 1; seed < 50; seed++) {
        let s = sandbag(startFight(player(race, arch, 10), buildMob("Rat", 10), seed));
        s = { ...s, player: { ...s.player, resource: Math.max(s.player.resource, cost) } };
        s = resolveRound(s, { type: "skill", skillId: skill });
        if (!s.enemy.effects.length) continue; // missed, try another seed
        for (let i = 1; i < ticks; i++) s = resolveRound(s, { type: "attack" });
        expect(s.log.filter((e) => e.t === "dot")).toHaveLength(ticks);
        expect(s.enemy.effects).toEqual([]);
        break;
      }
    }
  });

  it("Arcane Ward absorbs damage and Iron Stance reduces it", () => {
    const enemyHit = (st: FightState) => {
      const e = st.log.find((x) => x.t === "hit" && x.who === "enemy");
      if (e?.t !== "hit") throw new Error("expected an enemy hit");
      return e;
    };
    // Heals and buffs use no randomness, so with the same seed the enemy's roll is identical.
    const brute = { ...buildMob("Brute", 16), hp: 10_000, maxHp: 10_000 };
    for (let seed = 1; seed < 30; seed++) {
      const w = startFight(player("orc", "warrior", 16, { hp: 100 }), brute, seed);
      const ww = { ...w, player: { ...w.player, resource: 4 } };
      const plain = resolveRound(ww, { type: "skill", skillId: "second_wind" });
      if (!plain.log.some((x) => x.t === "hit" && x.who === "enemy")) continue;
      const guarded = resolveRound(ww, { type: "skill", skillId: "iron_stance" });
      expect(enemyHit(guarded).amount).toBe(Math.max(1, Math.round(enemyHit(plain).amount * 0.65)));

      const m = startFight(player("human", "mage", 16, { hp: 50 }), brute, seed);
      const healed = resolveRound(m, { type: "skill", skillId: "mend" });
      const warded = resolveRound(m, { type: "skill", skillId: "arcane_ward" });
      const ward = Math.round(m.player.maxHp * 0.2);
      const h = enemyHit(warded);
      expect((h.absorbed ?? 0) + h.amount).toBe(enemyHit(healed).amount);
      expect(h.absorbed).toBe(Math.min(ward, enemyHit(healed).amount));
      return;
    }
    throw new Error("enemy never hit");
  });

  it("Finishing Strike hits harder on a wounded target", () => {
    const base = sandbag(startFight(player("orc", "warrior", 19), buildMob("Rat", 19), 2));
    const full = { ...base, player: { ...base.player, resource: 5 } };
    const low = { ...full, enemy: { ...full.enemy, hp: 2_000 } };
    const a = resolveRound(full, { type: "skill", skillId: "finishing_strike" }).log[0];
    const b = resolveRound(low, { type: "skill", skillId: "finishing_strike" }).log[0];
    expect(a?.t).toBe("hit");
    if (a?.t === "hit" && b?.t === "hit") expect(b.amount / a.amount).toBeCloseTo(3.5 / 2, 1);
  });

  // Balance guard from docs/design.md: an even-level normal mob should take
  // about 2-7 rounds (mages burst on a full mana bar), the player should
  // usually win and lose about 15-30% HP. Includes racial passives and the
  // provisional starter kit.
  for (const archetype of Object.keys(ARCHETYPES) as ArchetypeId[]) {
    for (const race of Object.keys(RACES) as RaceId[]) {
      for (const level of [1, 10, 20]) {
        it(`${race} ${archetype} L${level} beats an even mob in 2-7 rounds`, () => {
          let wins = 0;
          let rounds = 0;
          let hpLost = 0;
          const n = 200;
          for (let seed = 1; seed <= n; seed++) {
            const start = player(race, archetype, level);
            const end = autoResolve(startFight(start, buildMob("Mob", level), seed));
            if (end.outcome === "won") wins++;
            rounds += end.round - 1;
            hpLost += (start.maxHp - end.player.hp) / start.maxHp;
          }
          expect(wins / n).toBeGreaterThan(0.95);
          const avg = rounds / n;
          expect(avg).toBeGreaterThanOrEqual(2);
          expect(avg).toBeLessThanOrEqual(7);
          expect(hpLost / n).toBeLessThan(0.4);
        });
      }
    }
  }
});
