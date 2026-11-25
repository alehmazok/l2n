import { describe, expect, it } from "vitest";
import { MOBS, NODES, RESPAWN_NODE, START_NODE, ZONES, encounterWeight, nodeLevels, pickEncounter } from "../src/index.js";

describe("world data", () => {
  it("start and respawn nodes exist and are towns", () => {
    expect(NODES[START_NODE]?.kind).toBe("town");
    expect(NODES[RESPAWN_NODE]?.kind).toBe("town");
  });

  it("every node is keyed by its id, sits in a known zone and links to known nodes", () => {
    for (const [key, node] of Object.entries(NODES)) {
      expect(node.id).toBe(key);
      expect(ZONES[node.zone]).toBeDefined();
      for (const link of node.links) expect(NODES[link], `${key} -> ${link}`).toBeDefined();
    }
  });

  it("links go both ways", () => {
    for (const node of Object.values(NODES)) {
      for (const link of node.links) expect(NODES[link]!.links, `${link} -> ${node.id}`).toContain(node.id);
    }
  });

  it("every node is reachable from the start", () => {
    const seen = new Set([START_NODE]);
    const queue = [START_NODE];
    while (queue.length) for (const l of NODES[queue.shift()!]!.links) if (!seen.has(l)) seen.add(l), queue.push(l);
    expect([...seen].sort()).toEqual(Object.keys(NODES).sort());
  });

  it("towns have no mobs, hunting nodes have known mobs inside their zone's level range", () => {
    for (const node of Object.values(NODES)) {
      if (node.kind === "town") {
        expect(node.mobs).toEqual([]);
        continue;
      }
      expect(node.mobs.length).toBeGreaterThan(0);
      const [min, max] = ZONES[node.zone].levels!;
      for (const id of node.mobs) {
        const mob = MOBS[id];
        expect(mob, id).toBeDefined();
        expect(mob!.level).toBeGreaterThanOrEqual(min);
        expect(mob!.level).toBeLessThanOrEqual(max);
      }
    }
  });

  it("every mob is keyed by its id and lives somewhere", () => {
    const placed = new Set(Object.values(NODES).flatMap((n) => n.mobs));
    for (const [key, mob] of Object.entries(MOBS)) {
      expect(mob.id).toBe(key);
      expect(placed.has(key), key).toBe(true);
    }
  });
});

describe("nodeLevels", () => {
  it("is null for towns and the min/max mob level for hunting nodes", () => {
    expect(nodeLevels(NODES[START_NODE]!)).toBeNull();
    expect(nodeLevels(NODES.mossgate_burrows!)).toEqual([5, 7]);
  });
});

describe("encounters", () => {
  it("weights mobs above the player's level lower", () => {
    expect(encounterWeight(3, 5)).toBe(3);
    expect(encounterWeight(5, 5)).toBe(3);
    expect(encounterWeight(6, 5)).toBe(2);
    expect(encounterWeight(7, 5)).toBe(1);
    expect(encounterWeight(12, 5)).toBe(1);
  });

  it("maps r across the weighted mobs in order", () => {
    // Burrows at level 5: mole (5) weight 3, digger (6) weight 2, hulk (7) weight 1, total 6.
    const node = NODES.mossgate_burrows!;
    const pick = (r: number) => pickEncounter(node, 5, r).id;
    expect(pick(0)).toBe("burrow_mole");
    expect(pick(2.99 / 6)).toBe("burrow_mole");
    expect(pick(3 / 6)).toBe("tusked_digger");
    expect(pick(4.99 / 6)).toBe("tusked_digger");
    expect(pick(5 / 6)).toBe("burrow_hulk");
    expect(pick(0.999999)).toBe("burrow_hulk");
  });

  it("refuses to hunt where there are no mobs", () => {
    expect(() => pickEncounter(NODES[START_NODE]!, 1, 0.5)).toThrow(/Nothing to hunt/);
  });
});
