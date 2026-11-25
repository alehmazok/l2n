/**
 * The world map: where each place sits on the picture, and the map itself as
 * HTML. The town is one place on it (its market, smithy, warehouse and notice
 * board are reached from the square, not from the map); every hunting node is
 * a place of its own. Positions are percentages of the map's width and height.
 */
import { NODES, ZONES, nodeLevels } from "@l2n/shared";
import { ART } from "./art.js";
import { esc } from "./ui.js";

export const MAP_PLACES: Record<string, { x: number; y: number; label?: string }> = {
  brackwell_square: { x: 12, y: 54, label: "Brackwell" },
  mossgate_old_road: { x: 28, y: 38 },
  mossgate_drowned_mill: { x: 38, y: 20 },
  mossgate_burrows: { x: 58, y: 14 },
  thornwood_bramble_edge: { x: 37, y: 67 },
  thornwood_spider_dell: { x: 56, y: 80 },
  thornwood_hermits_rise: { x: 78, y: 70 },
  cinder_ash_gate: { x: 88, y: 28 },
  cinder_bone_gallery: { x: 80, y: 46 },
  cinder_wardens_crypt: { x: 82, y: 9 },
};

/** The place on the map a node belongs to: itself, or the square for the other town nodes. */
export function mapPlace(nodeId: string): string | undefined {
  if (MAP_PLACES[nodeId]) return nodeId;
  const node = NODES[nodeId];
  return node && node.zone === NODES.brackwell_square!.zone ? "brackwell_square" : undefined;
}

/** Every road between two places on the map, once each. */
export function mapRoads(): [string, string][] {
  const roads: [string, string][] = [];
  for (const a of Object.keys(MAP_PLACES))
    for (const b of NODES[a]!.links) if (MAP_PLACES[b] && a < b) roads.push([a, b]);
  return roads;
}

/**
 * The map with the character at `location`. Places one road away are buttons
 * that travel there (`data-go`); the rest are shown but cannot be pressed.
 * Player counts and fallen marks are filled in by the world panel.
 */
export function mapHtml(location: string) {
  const here = mapPlace(location);
  const reach = new Set(NODES[location]?.links.map(mapPlace));
  reach.delete(here);
  const back = ART.maps?.hollowreach;
  const lines = mapRoads()
    .map(([a, b]) => {
      const [p, q] = [MAP_PLACES[a]!, MAP_PLACES[b]!];
      const open = (a === here && reach.has(b)) || (b === here && reach.has(a));
      return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="${open ? "open" : ""}" />`;
    })
    .join("");
  const places = Object.entries(MAP_PLACES)
    .map(([id, p]) => {
      const node = NODES[id]!;
      const lv = nodeLevels(node);
      const state = id === here ? "here" : reach.has(id) ? "near" : "far";
      const name = p.label ?? node.name;
      const hint = `${name}, ${ZONES[node.zone].name}${lv ? `, levels ${lv[0]}–${lv[1]}` : ", safe"}${id === here ? ", you are here" : ""}`;
      // A place one road away is entered at the node the road leads to; from inside the town that is the square.
      const inner = `<span class="pin"></span><span class="name">${esc(name)}${lv ? ` <span class="lv">${lv[0]}–${lv[1]}</span>` : ""}<span class="fallen-mark" data-fallen="${esc(id)}"></span><span class="online" data-online="${esc(id)}" data-short></span></span>`;
      const at = `class="place place-${state} zone-${esc(node.zone)}" style="left:${p.x}%;top:${p.y}%" title="${esc(hint)}"`;
      return state === "near" ? `<button ${at} data-go="${esc(id)}" aria-label="Go to ${esc(hint)}">${inner}</button>` : `<span ${at}>${inner}</span>`;
    })
    .join("");
  // Build-time URL from Vite, never user input, so it needs no escaping.
  return `<div class="map" ${back ? `style="background-image:url('${back}')"` : ""}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${places}</div>`;
}
