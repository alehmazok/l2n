import { describe, expect, it } from "vitest";
import { NODES } from "@l2n/shared";
import { MAP_PLACES, mapHtml, mapPlace, mapRoads, miniMap, miniMapHtml } from "../src/map.js";

describe("world map", () => {
  it("places every hunting node and the town square, inside the picture and apart from each other", () => {
    const hunts = Object.values(NODES).filter((n) => n.kind === "hunt").map((n) => n.id);
    expect(Object.keys(MAP_PLACES).sort()).toEqual([...hunts, "brackwell_square"].sort());
    const places = Object.entries(MAP_PLACES);
    for (const [id, p] of places) {
      expect(p.x, id).toBeGreaterThanOrEqual(8);
      expect(p.x, id).toBeLessThanOrEqual(90);
      expect(p.y, id).toBeGreaterThanOrEqual(5);
      expect(p.y, id).toBeLessThanOrEqual(82);
      // Close enough for markers and labels to overlap on a phone: less than 12% of the width apart on a 3:2 map.
      for (const [other, q] of places) if (other !== id) expect(Math.hypot(p.x - q.x, (p.y - q.y) / 1.5), `${id} and ${other}`).toBeGreaterThan(12);
    }
  });

  it("puts every town node on the square's place and every node somewhere", () => {
    expect(mapPlace("brackwell_market")).toBe("brackwell_square");
    expect(mapPlace("mossgate_burrows")).toBe("mossgate_burrows");
    expect(mapPlace("nowhere")).toBeUndefined();
    for (const id of Object.keys(NODES)) expect(mapPlace(id), id).toBeDefined();
  });

  it("draws each road between places once and can reach every place by them", () => {
    const roads = mapRoads();
    expect(roads).toContainEqual(["brackwell_square", "mossgate_old_road"]);
    expect(new Set(roads.map(([a, b]) => `${a}|${b}`)).size).toBe(roads.length);
    const seen = new Set(["brackwell_square"]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const [a, b] of roads)
        if (seen.has(a) !== seen.has(b)) {
          seen.add(a).add(b);
          grew = true;
        }
    }
    expect(seen.size).toBe(Object.keys(MAP_PLACES).length);
  });

  it("offers travel only to places one road away", () => {
    const go = (html: string) => [...html.matchAll(/data-go="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(go(mapHtml("brackwell_square"))).toEqual(["mossgate_old_road", "thornwood_bramble_edge"]);
    expect(go(mapHtml("mossgate_burrows"))).toEqual(["mossgate_drowned_mill", "thornwood_bramble_edge"]);
    // From inside the town the way out is through the square, which is where you already are on the map.
    expect(go(mapHtml("brackwell_smithy"))).toEqual([]);
    expect(mapHtml("brackwell_smithy")).toMatch(/place-here[^>]*title="Brackwell,/);
    expect(mapHtml("cinder_wardens_crypt")).toMatch(/place-here[^>]*title="Warden&#39;s Crypt,/);
  });

  it("centres the minimap on the place, and moves the pin instead where the map ends", () => {
    // Bramble Edge is far from every edge: the pin is in the middle.
    const mid = miniMap("thornwood_bramble_edge");
    expect(mid.pinX).toBeCloseTo(50);
    expect(mid.pinY).toBeCloseTo(50);
    for (const id of Object.keys(NODES)) {
      const m = miniMap(id);
      // The map always covers the frame, and the pin stays inside it.
      expect(m.left, id).toBeLessThanOrEqual(0);
      expect(m.left, id).toBeGreaterThanOrEqual(-300);
      expect(m.top, id).toBeLessThanOrEqual(0);
      expect(m.top, id).toBeGreaterThanOrEqual(100 - 800 / 3);
      for (const v of [m.pinX, m.pinY]) {
        expect(v, id).toBeGreaterThan(10);
        expect(v, id).toBeLessThan(90);
      }
    }
    // The crypt is at the top edge: the map stops and the pin goes up.
    expect(miniMap("cinder_wardens_crypt").top).toBe(0);
    expect(miniMap("cinder_wardens_crypt").pinY).toBeLessThan(50);
    // Town nodes share the square's place.
    expect(miniMap("brackwell_market")).toEqual(miniMap("brackwell_square"));
    expect(miniMapHtml("mossgate_old_road")).toContain('data-open="map"');
  });
});
