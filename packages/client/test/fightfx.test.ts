import { describe, expect, it } from "vitest";
import type { LogEntry, PublicFightState } from "@l2n/shared";
import { MAX_STEPS, plan, playable } from "../src/fightfx.js";

const state = (playerHp: number, enemyHp: number, log: LogEntry[]) =>
  ({ player: { hp: playerHp, maxHp: 100 }, enemy: { hp: enemyHp, maxHp: 80 }, log }) as unknown as PublicFightState;

describe("fight animation plan", () => {
  it("turns a round into steps and walks the bars from where they stood", () => {
    const { steps, start } = plan(
      state(88, 50, [
        { t: "hit", who: "player", amount: 20, crit: false, source: "attack" },
        { t: "hit", who: "enemy", amount: 12, crit: true, source: "attack" },
        { t: "dot", name: "bleed", amount: 10 },
      ]),
      0,
    );
    expect(start).toEqual({ player: 100, enemy: 80 });
    expect(steps).toEqual([
      { target: "enemy", kind: "hit", text: "−20", hp: 60, lunge: true },
      { target: "player", kind: "crit", text: "−12", hp: 88, lunge: true },
      { target: "enemy", kind: "dot", text: "−10", hp: 50, lunge: false },
    ]);
  });

  it("plays only the entries that are new", () => {
    const log: LogEntry[] = [
      { t: "hit", who: "player", amount: 20, crit: false, source: "attack" },
      { t: "miss", who: "enemy", source: "attack" },
      { t: "heal", amount: 30, source: "mend" },
    ];
    const { steps, start } = plan(state(100, 60, log), 1);
    expect(steps.map((s) => [s.target, s.kind, s.text, s.hp])).toEqual([
      ["player", "miss", "miss", 70],
      ["player", "heal", "+30", 100],
    ]);
    expect(start).toEqual({ player: 70, enemy: 60 });
    expect(plan(state(100, 60, log), 3).steps).toEqual([]);
  });

  it("ends every bar on the real number, even when healing was capped", () => {
    // 95 HP, healed for 30 but capped at 100: the walk back cannot know, the last step still lands on 100.
    const { steps } = plan(state(100, 80, [{ t: "draught", item: "healing_draught", amount: 30 }]), 0);
    expect(steps.at(-1)!.hp).toBe(100);
    const mana = plan(state(40, 80, [{ t: "draught", item: "mana_draught", amount: 25 }]), 0);
    expect(mana.steps).toEqual([{ target: "player", kind: "mana", text: "+25", hp: 40, lunge: false }]);
    expect(mana.start.player).toBe(40);
  });

  it("gives words to effects and nothing to lines that only belong in the log", () => {
    const { steps } = plan(
      state(100, 80, [
        { t: "stun", source: "shield_bash" },
        { t: "stunned" },
        { t: "buff", kind: "shield", source: "arcane_ward", amount: 20 },
        { t: "buff", kind: "guard", source: "iron_stance" },
        { t: "buff", kind: "attack_up", source: "war_cry" },
        { t: "curse", kind: "weaken", source: "withering_curse" },
        { t: "fade", kind: "guard" },
        { t: "flee", success: false },
      ]),
      0,
    );
    expect(steps.map((s) => `${s.target}:${s.text}`)).toEqual(["enemy:stunned", "player:ward", "player:guard", "player:attack up", "enemy:weakened"]);
  });

  it("does not play a fight resolved in one go", () => {
    const hit: LogEntry = { t: "hit", who: "player", amount: 1, crit: false, source: "attack" };
    expect(playable(plan(state(100, 0, Array(MAX_STEPS + 1).fill(hit)), 0).steps)).toBe(false);
    expect(playable(plan(state(100, 79, [hit]), 0).steps)).toBe(true);
    expect(playable([])).toBe(false);
  });
});
