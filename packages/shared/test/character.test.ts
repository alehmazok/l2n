import { describe, expect, it } from "vitest";
import {
  ARCHETYPES,
  PROFESSIONS,
  isProfessionId,
  professionBonuses,
  referenceGear,
  starterGear,
  RACES,
  characterSheet,
  normalizeCharacterName,
  normalizeEmail,
  startingVitals,
  validateCharacterName,
  validateEmail,
  validatePassword,
  type ArchetypeId,
  type RaceId,
} from "../src/index.js";

describe("character creation rules", () => {
  it("accepts letter-only names of 3 to 16 characters", () => {
    expect(validateCharacterName("Aldric")).toBeNull();
    expect(validateCharacterName("Bo")).not.toBeNull();
    expect(validateCharacterName("A".repeat(17))).not.toBeNull();
    expect(validateCharacterName("Al dric")).not.toBeNull();
    expect(validateCharacterName("Aldr1c")).not.toBeNull();
    expect(validateCharacterName("Ældric")).not.toBeNull();
  });

  it("normalizes names and emails", () => {
    expect(normalizeCharacterName("  aLDRIC ")).toBe("Aldric");
    expect(normalizeEmail(" Me@Example.COM ")).toBe("me@example.com");
  });

  it("validates email and password", () => {
    expect(validateEmail("me@example.com")).toBeNull();
    expect(validateEmail("me@example")).not.toBeNull();
    expect(validatePassword("short")).not.toBeNull();
    expect(validatePassword("long enough")).toBeNull();
  });
});

describe("character sheet", () => {
  it("matches the design doc for a level 1 orc warrior", () => {
    const s = characterSheet("orc", "warrior", 1, starterGear("warrior"));
    expect(s.stats).toEqual({ might: 17, agility: 9, vitality: 15, intellect: 9, spirit: 10 });
    expect(s.maxHp).toBe(78); // 60 * (1 + 0.04 * 5) = 72, +8% Thick Hide
    expect(s.resource).toEqual({ kind: "focus", max: 5, startsAt: 0 });
    expect(s.attack).toBe(13); // 6 * 1.28 = 7.68, + 5 starter weapon
    expect(s.xpToNext).toBe(160);
    expect(s.passive.name).toBe("Thick Hide");
    expect(s.skills.learned.map((k) => k.id)).toEqual(["heavy_blow"]);
    expect(s.skills.upcoming).toHaveLength(6);
  });

  it("gives mages a full mana bar at creation", () => {
    const s = characterSheet("dawn_elf", "mage", 1, starterGear("mage"));
    expect(s.resource.kind).toBe("mana");
    expect(s.resource.startsAt).toBe(s.resource.max);
    expect(startingVitals("dawn_elf", "mage")).toEqual({ hp: s.maxHp, resource: s.resource.max });
  });

  it("works for every race and archetype at every level", () => {
    for (const r of Object.keys(RACES) as RaceId[])
      for (const a of Object.keys(ARCHETYPES) as ArchetypeId[])
        for (let l = 1; l <= 20; l++) {
          const s = characterSheet(r, a, l, referenceGear(a, l));
          expect(s.maxHp).toBeGreaterThan(0);
          expect(s.skills.learned.length + s.skills.upcoming.length).toBe(7);
          expect(s.xpToNext === null).toBe(l === 20);
        }
  });

  it("adds a profession's passive and skills on top", () => {
    const gear = referenceGear("warrior", 20);
    const plain = characterSheet("orc", "warrior", 20, gear);
    const vanguard = characterSheet("orc", "warrior", 20, gear, "vanguard");
    const reaver = characterSheet("orc", "warrior", 20, gear, "reaver");
    expect(plain.professionPassive).toBeNull();
    expect(vanguard.professionPassive?.name).toBe("Bulwark");
    expect(vanguard.maxHp).toBeGreaterThan(plain.maxHp);
    expect(vanguard.defence).toBe(Math.round(plain.defence * 1.1));
    expect(reaver.defence).toBeLessThan(plain.defence);
    expect(reaver.damageBonus).toBeCloseTo(0.12);
    expect(vanguard.skills.learned.map((k) => k.id).slice(-2)).toEqual(["bulwark_strike", "shield_wall"]);
    expect(plain.skills.learned).toHaveLength(7);
  });

  it("has two professions per archetype, each with a passive", () => {
    for (const a of Object.values(ARCHETYPES)) for (const p of a.professions) expect(PROFESSIONS[p.id]).toMatchObject({ archetype: a.id, name: p.name });
    expect(Object.keys(PROFESSIONS)).toHaveLength(4);
    expect(isProfessionId("hexbinder")).toBe(true);
    expect(isProfessionId("toString")).toBe(false);
    expect(professionBonuses(null)).toEqual({ hp: 0, damage: 0, defence: 0, dot: 0 });
    expect(professionBonuses("hexbinder")).toEqual({ hp: 0.05, damage: 0, defence: 0, dot: 0.25 });
  });
});
