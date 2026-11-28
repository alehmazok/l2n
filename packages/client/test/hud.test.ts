import { describe, expect, it } from "vitest";
import { DOCK, hotkey } from "../src/hud.js";

describe("hotkeys", () => {
  it("opens each dock window by its key, in either case", () => {
    expect(hotkey({ key: "b" })).toEqual({ kind: "open", window: "bag" });
    expect(hotkey({ key: "M" })).toEqual({ kind: "open", window: "map" });
    for (const d of DOCK) if (d.key) expect(hotkey({ key: d.key })).toEqual({ kind: "open", window: d.id });
    expect(new Set(DOCK.map((d) => d.key).filter(Boolean)).size).toBe(DOCK.filter((d) => d.key).length);
  });

  it("maps digits to fight actions, Space to the main button and Enter to chat", () => {
    expect(hotkey({ key: "1" })).toEqual({ kind: "slot", index: 0 });
    expect(hotkey({ key: "9" })).toEqual({ kind: "slot", index: 8 });
    expect(hotkey({ key: "0" })).toBeNull();
    expect(hotkey({ key: " " })).toEqual({ kind: "primary" });
    expect(hotkey({ key: "Enter" })).toEqual({ kind: "chat" });
    expect(hotkey({ key: "x" })).toBeNull();
  });

  it("leaves typing and browser shortcuts alone, but Escape always closes", () => {
    expect(hotkey({ key: "b", typing: true })).toBeNull();
    expect(hotkey({ key: "1", typing: true })).toBeNull();
    expect(hotkey({ key: "Enter", typing: true })).toBeNull();
    expect(hotkey({ key: "b", ctrlKey: true })).toBeNull();
    expect(hotkey({ key: "m", metaKey: true })).toBeNull();
    expect(hotkey({ key: "Escape", typing: true })).toEqual({ kind: "close" });
  });
});
