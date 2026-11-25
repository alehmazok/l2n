import { describe, expect, it } from "vitest";
import {
  ARCHETYPES,
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
    const s = characterSheet("orc", "warrior");
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
    const s = characterSheet("dawn_elf", "mage");
    expect(s.resource.kind).toBe("mana");
    expect(s.resource.startsAt).toBe(s.resource.max);
    expect(startingVitals("dawn_elf", "mage")).toEqual({ hp: s.maxHp, resource: s.resource.max });
  });

  it("works for every race and archetype at every level", () => {
    for (const r of Object.keys(RACES) as RaceId[])
      for (const a of Object.keys(ARCHETYPES) as ArchetypeId[])
        for (let l = 1; l <= 20; l++) {
          const s = characterSheet(r, a, l);
          expect(s.maxHp).toBeGreaterThan(0);
          expect(s.skills.learned.length + s.skills.upcoming.length).toBe(7);
          expect(s.xpToNext === null).toBe(l === 20);
        }
  });
});
