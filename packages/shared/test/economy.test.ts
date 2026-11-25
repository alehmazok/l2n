/**
 * Economy simulation (docs/design.md, "Economy"): an hour of hunting at each
 * level, silver in against silver spent on charges and draughts.
 */
import { describe, expect, it } from "vitest";
import {
  ITEMS,
  NODES,
  autoResolve,
  buildMob,
  buildPlayer,
  chargeId,
  createRng,
  nodeLevels,
  pickEncounter,
  playerInputFor,
  referenceGear,
  rollLoot,
  sellPrice,
  startFight,
  type ArchetypeId,
} from "../src/index.js";

/** Fights in an hour at about 25 seconds each. */
const FIGHTS_PER_HOUR = 144;

/** The hunting node a player of this level would pick: the highest one whose mobs span their level. */
function huntingNodeFor(level: number) {
  const fits = Object.values(NODES).filter((n) => {
    const l = nodeLevels(n);
    return l && l[0] <= level && level <= l[1];
  });
  return fits.sort((a, b) => nodeLevels(b)![0] - nodeLevels(a)![0])[0]!;
}

function hourOfHunting(archetype: ArchetypeId, level: number, seed = 1) {
  const rng = createRng(seed);
  const tier = level >= 10 ? 2 : 1;
  const charge = chargeId(archetype, tier);
  const node = huntingNodeFor(level);
  let silverIn = 0;
  let resources = 0;
  let charges = 0;
  let draughts = 0;
  let deaths = 0;
  for (let i = 0; i < FIGHTS_PER_HOUR; i++) {
    const mob = pickEncounter(node, level, rng.next());
    const p = buildPlayer(
      playerInputFor(
        { name: "T", race: "human", archetype, level, xp: 0, hp: 9999, resource: 9999, gear: referenceGear(archetype, level) },
        { charges: 999, chargeItem: charge, draughts: { healing_draught: 99 } },
      ),
    );
    const end = autoResolve(startFight(p, buildMob(mob.name, mob.level, mob.role), Math.floor(rng.next() * 2 ** 32)));
    charges += 999 - end.player.charges;
    draughts += 99 - (end.player.draughts?.healing_draught ?? 0);
    if (end.outcome !== "won") {
      deaths++;
      continue;
    }
    const loot = rollLoot(mob, { race: "human", archetype }, createRng(end.rngState));
    silverIn += loot.silver;
    for (const it of loot.items) if (ITEMS[it.templateId]!.kind === "resource") resources += sellPrice(it, it.quantity);
  }
  const silverOut = charges * (ITEMS[charge] as { value: number }).value + draughts * (ITEMS.healing_draught as { value: number }).value;
  return { node: node.id, silverIn, resources, silverOut, charges, draughts, deaths };
}

describe("economy simulation", () => {
  // Rule from docs/design.md: an hour of hunting at your level earns more
  // silver (coin plus resources sold) than the charges and draughts it uses,
  // so the player saves up for gear, but supplies eat a large share of it.
  for (const archetype of ["warrior", "mage"] as const)
    it(`a ${archetype} keeps 15–65% of an hour's income after supplies`, () => {
      let income = 0;
      let spent = 0;
      for (let level = 1; level <= 20; level++) {
        const h = hourOfHunting(archetype, level);
        expect(h.deaths, `level ${level}`).toBeLessThanOrEqual(2);
        // Single levels may run at a loss where elites or tougher mobs sit just above, but not by much.
        expect(h.silverOut / (h.silverIn + h.resources), `level ${level}`).toBeLessThan(1.5);
        income += h.silverIn + h.resources;
        spent += h.silverOut;
      }
      expect(spent / income).toBeGreaterThan(0.35);
      expect(spent / income).toBeLessThan(0.85);
    });

  it("picks the highest hunting node that spans the level", () => {
    expect(huntingNodeFor(1).id).toBe("mossgate_old_road");
    expect(huntingNodeFor(7).id).toBe("thornwood_bramble_edge");
    expect(huntingNodeFor(20).id).toBe("cinder_wardens_crypt");
  });
});
