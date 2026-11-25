import { describe, expect, it } from "vitest";
import { ARCHETYPES, MOBS, NODES, RACES } from "@l2n/shared";
import manifest from "../src/assets/art/manifest.json";

const PROMPTS = { mob: manifest.style.mobPrompt, scene: manifest.style.scenePrompt, portrait: manifest.style.portraitPrompt };
const FOLDERS = { mob: "mobs", scene: "scenes", portrait: "portraits" };

describe("art manifest", () => {
  it("builds every prompt from the shared style and names files by id", () => {
    const ids = manifest.images.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of manifest.images) {
      const kind = i.kind as keyof typeof PROMPTS;
      expect(i.prompt).toBe(PROMPTS[kind].replace("{subject}", i.subject));
      expect(i.prompt.length).toBeLessThanOrEqual(manifest.model.promptCharacterLimit);
      expect(i.file).toBe(`${FOLDERS[kind]}/${i.id}.webp`);
      expect(Number.isInteger(i.parameters.seed)).toBe(true);
    }
  });

  it("only describes mobs, nodes and race and archetype pairs that exist", () => {
    const portraits = Object.keys(RACES).flatMap((r) => Object.keys(ARCHETYPES).map((a) => `${r}_${a}`));
    for (const i of manifest.images) {
      if (i.kind === "mob") expect(MOBS[i.id]).toBeDefined();
      if (i.kind === "scene") expect(NODES[i.id]).toBeDefined();
      if (i.kind === "portrait") expect(portraits).toContain(i.id);
    }
  });
});
