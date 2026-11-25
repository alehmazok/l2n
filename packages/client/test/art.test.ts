import { describe, expect, it } from "vitest";
import { ARCHETYPES, MOBS, NODES, RACES } from "@l2n/shared";
import { ART, mobArt, portrait, portraitArt, sceneArt } from "../src/art.js";
import manifest from "../src/assets/art/manifest.json";

const PROMPTS = { mob: manifest.style.mobPrompt, scene: manifest.style.scenePrompt, portrait: manifest.style.portraitPrompt, map: manifest.style.mapPrompt };
const FOLDERS = { mob: "mobs", scene: "scenes", portrait: "portraits", map: "maps" };

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

  it("plans a picture for every mob, every node, every race and archetype pair, and the map", () => {
    const ids = (kind: string) => manifest.images.filter((i) => i.kind === kind).map((i) => i.id).sort();
    expect(ids("mob")).toEqual(Object.keys(MOBS).sort());
    expect(ids("scene")).toEqual(Object.keys(NODES).sort());
    expect(ids("map")).toEqual(["hollowreach"]);
    expect(ids("portrait")).toEqual(Object.keys(RACES).flatMap((r) => Object.keys(ARCHETYPES).map((a) => `${r}_${a}`)).sort());
  });

  it("bundles only pictures the manifest describes, and every picture marked as made", () => {
    const files = Object.entries(ART).flatMap(([folder, byId]) => Object.keys(byId).map((id) => `${folder}/${id}.webp`));
    const described = manifest.images.map((i) => i.file);
    expect(files.filter((f) => !described.includes(f))).toEqual([]);
    expect(manifest.images.filter((i) => i.generated && !files.includes(i.file)).map((i) => i.id)).toEqual([]);
  });

  it("finds art by id and falls back to a letter", () => {
    expect(mobArt("dell_spider")).toBe(ART.mobs!.dell_spider);
    expect(sceneArt("mossgate_old_road")).toBeTruthy();
    expect(mobArt("no_such_mob")).toBeUndefined();
    expect(portrait("orc", "warrior", "Grok")).toContain(`src="${portraitArt("orc", "warrior")}"`);
    const missing = Object.keys(RACES).flatMap((r) => Object.keys(ARCHETYPES).map((a) => [r, a] as const)).find(([r, a]) => !portraitArt(r as never, a as never));
    if (missing) expect(portrait(missing[0] as never, missing[1] as never, "<Yrsa")).toContain(">&lt;</span>");
  });
});
