import { describe, expect, it } from "vitest";
import { ITEMS, SKILLS } from "@l2n/shared";
import { ICONS, itemIcon, itemIconId, skillIcon } from "../src/icons.js";
import manifest from "../src/assets/icons/manifest.json";

describe("icons", () => {
  it("has an icon for every item template and every skill", () => {
    const missing = [...Object.keys(ITEMS).map(itemIconId), ...SKILLS.map((s) => s.id)].filter((id) => !ICONS[id]);
    expect(missing).toEqual([]);
  });

  it("records how every icon was made, and only icons that exist", () => {
    const ids = manifest.icons.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(ICONS).sort());
    for (const i of manifest.icons) {
      expect(i.file).toBe(`${i.id}.webp`);
      expect(i.prompt.length).toBeGreaterThan(40);
      expect(i.prompt.length).toBeLessThanOrEqual(manifest.model.promptCharacterLimit);
      expect(i.prompt).toBe(manifest.style[i.kind === "skill" ? "skillPrompt" : "itemPrompt"].replace("{subject}", i.subject));
      expect(Number.isInteger(i.parameters.seed)).toBe(true);
    }
  });

  it("renders images, recipes sharing the scroll", () => {
    expect(itemIconId("recipe_whetstones_1")).toBe("recipe");
    expect(itemIcon({ templateId: "healing_draught", rarity: null })).toContain(`src="${ICONS.healing_draught}"`);
    expect(itemIcon({ templateId: "ironbound_warrior_weapon", rarity: "rare" })).toContain("rarity-rare");
    expect(skillIcon("heavy_blow")).toContain(`src="${ICONS.heavy_blow}"`);
    expect(itemIcon({ templateId: "no_such_thing", rarity: null })).toContain("?");
  });
});
