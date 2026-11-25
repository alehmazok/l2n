import { describe, expect, it } from "vitest";
import { characterStats, critChance, hitChance, maxHp, mobXp, xpToNext } from "../src/index.js";

describe("formulas", () => {
  it("xp curve grows and stops at max level", () => {
    expect(xpToNext(1)).toBe(160);
    expect(xpToNext(19)).toBe(5704);
    expect(xpToNext(20)).toBe(Infinity);
    for (let l = 1; l < 19; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });

  it("mob xp scales with level difference within bounds", () => {
    expect(mobXp(5, 5)).toBe(40);
    expect(mobXp(1, 20)).toBe(2);
    expect(mobXp(10, 5)).toBe(91);
  });

  it("race and archetype stats sum on top of base 10", () => {
    expect(characterStats("orc", "warrior")).toEqual({ might: 17, agility: 9, vitality: 15, intellect: 9, spirit: 10 });
  });

  it("chances are clamped", () => {
    expect(hitChance(100, 0, 10)).toBe(0.99);
    expect(hitChance(0, 100, -10)).toBe(0.6);
    expect(critChance(1000)).toBe(0.3);
  });

  it("warriors have more HP than mages", () => {
    expect(maxHp("warrior", 10, 10)).toBeGreaterThan(maxHp("mage", 10, 10));
  });
});
