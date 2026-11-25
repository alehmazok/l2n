import { describe, expect, it } from "vitest";
import { CHAT_MAX_LENGTH, chatProblem, chronicleKey, chronicleText, fallenText, isChatChannel, normalizeChatText, timeAgo } from "../src/index.js";

describe("chat text", () => {
  it("drops control and invisible characters and collapses whitespace", () => {
    expect(normalizeChatText("  hi\u0000 \tthere​‮ friend \n")).toBe("hi there friend");
    expect(normalizeChatText("<b>bold</b>")).toBe("<b>bold</b>");
    expect(normalizeChatText("é")).toBe("é");
  });

  it("needs something to say, within the limit counted in characters", () => {
    expect(chatProblem("")).toMatch(/Say something/);
    expect(chatProblem("x".repeat(CHAT_MAX_LENGTH))).toBeNull();
    expect(chatProblem("x".repeat(CHAT_MAX_LENGTH + 1))).toMatch(/under 200/);
    expect(chatProblem("🜂".repeat(CHAT_MAX_LENGTH))).toBeNull();
  });

  it("knows its channels", () => {
    expect(["global", "brackwell", "cinder_barrows", "trade", "constructor"].map(isChatChannel)).toEqual([true, true, true, false, false]);
  });
});

describe("chronicle lines", () => {
  const who = { name: "Yrsa", race: "dwarf" as const };
  it("reads like a herald's notice", () => {
    expect(chronicleText({ ...who, first: true, event: { kind: "boss", mobId: "ashen_warden" } })).toBe("Yrsa the Dwarf is the first to defeat the Ashen Warden!");
    expect(chronicleText({ ...who, first: false, event: { kind: "boss", mobId: "ashen_warden" } })).toBe("Yrsa the Dwarf defeated the Ashen Warden.");
    expect(chronicleText({ ...who, first: true, event: { kind: "profession", profession: "hexbinder" } })).toBe("Yrsa the Dwarf is the first Hexbinder of Hollowreach!");
    expect(chronicleText({ ...who, first: false, event: { kind: "profession", profession: "reaver" } })).toBe("Yrsa the Dwarf became a Reaver.");
    expect(chronicleText({ ...who, first: false, event: { kind: "profession", profession: "vanguard" } })).toBe("Yrsa the Dwarf became a Vanguard.");
    expect(chronicleText({ ...who, first: true, event: { kind: "rare_craft", templateId: "ironbound_warrior_weapon", itemLevel: 8 } })).toMatch(/^Yrsa the Dwarf forged the first Rare .+ ever made!$/);
    expect(chronicleText({ ...who, first: false, event: { kind: "rare_craft", templateId: "ironbound_warrior_weapon", itemLevel: 8 } })).toMatch(/^Yrsa the Dwarf forged a Rare /);
  });

  it("survives data that no longer exists", () => {
    expect(chronicleText({ name: "Old", race: "gnome" as never, first: false, event: { kind: "boss", mobId: "gone" } })).toBe("Old the Wanderer defeated the Nameless One.");
    expect(chronicleText({ ...who, first: false, event: { kind: "profession", profession: "gone" as never } })).toBe("Yrsa the Dwarf became a Wayfarer.");
    expect(chronicleText({ ...who, first: false, event: { kind: "rare_craft", templateId: "gone", itemLevel: null } })).toBe("Yrsa the Dwarf forged a Rare wonder.");
  });

  it("groups the same deed by its key", () => {
    expect(chronicleKey({ kind: "boss", mobId: "ashen_warden" })).toBe("ashen_warden");
    expect(chronicleKey({ kind: "profession", profession: "reaver" })).toBe("reaver");
    expect(chronicleKey({ kind: "rare_craft", templateId: "x", itemLevel: 8 })).toBe("x");
  });
});

describe("fallen markers and times", () => {
  it("names the killer", () => {
    expect(fallenText({ name: "Yrsa", mobId: "thicket_wolf" })).toBe("Yrsa fell here to a Thicket Wolf.");
    expect(fallenText({ name: "Yrsa", mobId: "ashen_warden" })).toBe("Yrsa fell here to an Ashen Warden.");
    expect(fallenText({ name: "Yrsa", mobId: "gone" })).toBe("Yrsa fell here to something in the dark.");
  });

  it("says how long ago", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const ago = (s: number) => timeAgo(new Date(now.getTime() - s * 1000).toISOString(), now);
    expect([ago(-5), ago(30), ago(60 * 4), ago(3600 * 2), ago(86400 * 3)]).toEqual(["just now", "just now", "4 min ago", "2 h ago", "3 d ago"]);
  });
});
