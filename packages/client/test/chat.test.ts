import { describe, expect, it } from "vitest";
import { IgnoreList, parseChatInput } from "../src/chat.js";

describe("chat input", () => {
  it("says things on the picked channel or the one a command names", () => {
    expect(parseChatInput("  hello ", "zone")).toEqual({ kind: "say", channel: "zone", text: "hello" });
    expect(parseChatInput("/g wts sword", "zone")).toEqual({ kind: "say", channel: "global", text: "wts sword" });
    expect(parseChatInput("/Z  rats here", "global")).toEqual({ kind: "say", channel: "zone", text: "rats here" });
    expect(parseChatInput("/global", "zone")).toEqual({ kind: "none" });
    expect(parseChatInput("/zone", "zone")).toEqual({ kind: "none" });
    expect(parseChatInput("   ", "zone")).toEqual({ kind: "none" });
  });

  it("manages the ignore list and explains itself", () => {
    expect(parseChatInput("/ignore yRSA", "zone")).toEqual({ kind: "ignore", name: "Yrsa" });
    expect(parseChatInput("/unignore Yrsa", "zone")).toEqual({ kind: "unignore", name: "Yrsa" });
    expect(parseChatInput("/ignore <b>", "zone")).toEqual({ kind: "help" });
    expect(parseChatInput("/dance", "zone")).toEqual({ kind: "help" });
  });
});

describe("ignore list", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it("remembers names regardless of case", () => {
    const storage = memory();
    const list = new IgnoreList(storage);
    list.set("yrsa", true);
    expect(list.has("YRSA")).toBe(true);
    expect(new IgnoreList(storage).has("Yrsa")).toBe(true);
    list.set("Yrsa", false);
    expect(new IgnoreList(storage).size).toBe(0);
  });

  it("works without storage or with broken data", () => {
    const list = new IgnoreList(null);
    list.set("Yrsa", true);
    expect(list.has("yrsa")).toBe(true);
    expect(new IgnoreList({ getItem: () => "{oops", setItem: () => {} }).size).toBe(0);
    expect(new IgnoreList({ getItem: () => '{"a":1}', setItem: () => {} }).size).toBe(0);
    const full = new IgnoreList({ getItem: () => null, setItem: () => { throw new Error("full"); } });
    full.set("Yrsa", true);
    expect(full.has("Yrsa")).toBe(true);
    expect(new IgnoreList().size).toBe(0);
  });
});
