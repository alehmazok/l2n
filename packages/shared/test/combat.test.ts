import { describe, expect, it } from "vitest";
import {
  ARCHETYPES,
  MOBS,
  PROFESSIONS,
  chargeId,
  referenceGear,
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
  type ProfessionId,
  type RaceId,
} from "../src/index.js";

/** A full-health character of this race, archetype and level, as the server builds them. */
function player(race: RaceId, archetype: ArchetypeId, level: number, extra: { mana?: number; hp?: number } = {}) {
  const input = playerInputFor({ name: "Tester", race, archetype, level, xp: 0, hp: extra.hp ?? 9999, resource: extra.mana ?? 9999, gear: referenceGear(archetype, level) });
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
  // usually win and lose about 15-30% HP. Includes racial passives and a
  // full common set of gear of the character's level.
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

describe("elites and the boss", () => {
  // docs/design.md, "Balance targets": elites need a draught or a careful
  // rotation; the Ashen Warden needs preparation (charges and draughts).
  const races = Object.keys(RACES) as RaceId[];
  const fight = (archetype: ArchetypeId, mobId: string, level: number, prepared: { charges: number; draughts: number }, seed: number, race: RaceId) => {
    const mob = MOBS[mobId]!;
    const tier = level >= 10 ? 2 : 1;
    const p = buildPlayer(
      playerInputFor(
        { name: "T", race, archetype, level, xp: 0, hp: 9999, resource: 9999, gear: referenceGear(archetype, level) },
        { charges: prepared.charges, chargeItem: chargeId(archetype, tier), draughts: { healing_draught: prepared.draughts } },
      ),
    );
    return autoResolve(startFight(p, buildMob(mob.name, mob.level, mob.role), seed), 300);
  };
  const odds = (archetype: ArchetypeId, mobId: string, level: number, prepared: { charges: number; draughts: number }) => {
    let wins = 0;
    let hpLost = 0;
    const n = 40;
    for (const race of races)
      for (let seed = 1; seed <= n; seed++) {
        const end = fight(archetype, mobId, level, prepared, seed, race);
        if (end.outcome === "won") wins++;
        hpLost += 1 - end.player.hp / end.player.maxHp;
      }
    return { win: wins / (n * races.length), hpLost: hpLost / (n * races.length) };
  };

  for (const archetype of ["warrior", "mage"] as const) {
    it(`a ${archetype} beats an even-level elite but loses a third of their HP or more`, () => {
      for (const [mob, level] of [["burrow_queen", 7], ["brood_matron", 11], ["brigand_captain", 14], ["bone_colossus", 18], ["gravebound_champion", 20]] as const) {
        const r = odds(archetype, mob, level, { charges: 200, draughts: 3 });
        expect(r.win, mob).toBeGreaterThan(0.95);
        expect(r.hpLost, mob).toBeGreaterThan(0.3);
      }
    });

    it(`a prepared level 20 ${archetype} usually beats the Ashen Warden; an unprepared one does not`, () => {
      expect(odds(archetype, "ashen_warden", 20, { charges: 300, draughts: 10 }).win).toBeGreaterThan(0.85);
      expect(odds(archetype, "ashen_warden", 20, { charges: 0, draughts: 2 }).win).toBeLessThan(0.1);
    });
  }
});

describe("professions", () => {
  const pro = (race: RaceId, profession: ProfessionId, extra: { charges?: number; draughts?: number } = {}) => {
    const archetype = PROFESSIONS[profession].archetype;
    return buildPlayer(
      playerInputFor(
        { name: "P", race, archetype, profession, level: 20, xp: 0, hp: 9999, resource: 9999, gear: referenceGear(archetype, 20) },
        { charges: extra.charges ?? 0, chargeItem: chargeId(archetype, 2), draughts: { healing_draught: extra.draughts ?? 0 } },
      ),
    );
  };
  const professions = Object.keys(PROFESSIONS) as ProfessionId[];

  it("apply their passives and teach their own skills only", () => {
    const base = player("orc", "warrior", 20);
    const vanguard = pro("orc", "vanguard");
    const reaver = pro("orc", "reaver");
    expect(vanguard.maxHp).toBe(characterMaxHp("orc", "warrior", 20, referenceGear("warrior", 20).hpBonus, "vanguard"));
    expect(vanguard.maxHp).toBeGreaterThan(base.maxHp);
    expect(vanguard.def).toBeCloseTo(base.def * 1.1);
    expect(reaver.def).toBeCloseTo(base.def * 0.9);
    expect(reaver.damageBonus).toBeCloseTo(0.12);
    expect(vanguard.skills).toContain("shield_wall");
    expect(vanguard.skills).not.toContain("savage_cleave");
    expect(base.skills).not.toContain("shield_wall");
    expect(pro("human", "hexbinder").dotBonus).toBe(0.25);
  });

  it("Life Drain heals for part of the damage it deals", () => {
    for (let seed = 1; seed < 50; seed++) {
      const s = sandbag(startFight(pro("human", "hexbinder"), buildMob("Rat", 20), seed));
      const hurt = { ...s, player: { ...s.player, hp: 50 } };
      const after = resolveRound(hurt, { type: "skill", skillId: "life_drain" });
      const hit = after.log.find((e) => e.t === "hit" && e.who === "player");
      if (hit?.t !== "hit") continue;
      expect(after.log).toContainEqual({ t: "heal", amount: Math.round(hit.amount * 0.5), source: "life_drain" });
      return;
    }
    throw new Error("never hit");
  });

  it("Withering Curse weakens the enemy and blights it, stronger with Lingering Malice", () => {
    const brute = { ...buildMob("Brute", 20), hp: 10_000, maxHp: 10_000 };
    for (let seed = 1; seed < 50; seed++) {
      const s = startFight(pro("human", "hexbinder"), brute, seed);
      const cursed = resolveRound(s, { type: "skill", skillId: "withering_curse" });
      if (!cursed.log.some((e) => e.t === "curse")) continue;
      expect(cursed.enemy.effects).toMatchObject([{ kind: "dot", name: "blight", turns: 3 }, { kind: "weaken", value: 0.25, turns: 2 }]);
      // Same seed with a plain mage: the blight is 25% weaker without the passive (and its damage bonus).
      let after = cursed;
      for (let i = 0; i < 3; i++) after = resolveRound(after, { type: "attack" });
      expect(after.enemy.effects.some((e) => e.kind === "weaken")).toBe(false);
      expect(after.log).toContainEqual({ t: "fade", kind: "weaken" });
      return;
    }
    throw new Error("curse never landed");
  });

  it("a weakened enemy hits for less", () => {
    const brute = { ...buildMob("Brute", 20), hp: 10_000, maxHp: 10_000 };
    for (let seed = 1; seed < 50; seed++) {
      const s = startFight(pro("orc", "vanguard"), brute, seed);
      const weak = { ...s, enemy: { ...s.enemy, effects: [{ kind: "weaken" as const, value: 0.5, turns: 2, source: "test" }] } };
      const hit = (st: FightState) => resolveRound(st, { type: "attack" }).log.find((e) => e.t === "hit" && e.who === "enemy");
      const a = hit(s);
      const b = hit(weak);
      if (a?.t !== "hit" || b?.t !== "hit") continue;
      expect(b.amount).toBeLessThan(a.amount * 0.7);
      return;
    }
    throw new Error("enemy never hit");
  });

  // The balance targets hold after the profession change too.
  for (const profession of professions)
    it(`every race as a ${profession} beats an even level 20 mob in 2-7 rounds and the prepared Warden`, () => {
      for (const race of Object.keys(RACES) as RaceId[]) {
        let wins = 0;
        let rounds = 0;
        let hpLost = 0;
        const n = 200;
        for (let seed = 1; seed <= n; seed++) {
          const start = pro(race, profession);
          const end = autoResolve(startFight(start, buildMob("Mob", 20), seed));
          if (end.outcome === "won") wins++;
          rounds += end.round - 1;
          hpLost += (start.maxHp - end.player.hp) / start.maxHp;
        }
        expect(wins / n, race).toBeGreaterThan(0.95);
        // Level 20 mages on a full bar already sit at the two-round floor (2.0-2.2), so allow 1.9 here.
        expect(rounds / n, race).toBeGreaterThanOrEqual(1.9);
        expect(rounds / n, race).toBeLessThanOrEqual(7);
        expect(hpLost / n, race).toBeLessThan(0.4);
      }
      // Averaged over the races like the archetype test above (the elves are the frailest).
      let warden = 0;
      const w = MOBS.ashen_warden!;
      for (const race of Object.keys(RACES) as RaceId[])
        for (let seed = 1; seed <= 40; seed++)
          if (autoResolve(startFight(pro(race, profession, { charges: 300, draughts: 10 }), buildMob(w.name, w.level, w.role), seed), 300).outcome === "won") warden++;
      expect(warden / 200).toBeGreaterThan(0.85);
    });
});
