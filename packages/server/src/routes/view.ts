import { canAutoBattle, characterSheet, gearStats, publicFight, type CharacterSummary, type Item } from "@l2n/shared";
import type { StoredFight } from "../store/index.js";

/** What the client sees of a fight: never the RNG state. */
export function fightView(f: StoredFight) {
  return {
    id: f.id,
    mobId: f.mobId,
    nodeId: f.nodeId,
    state: publicFight(f.state),
    canAuto: canAutoBattle(f.state.player.level, f.state.enemy.level),
  };
}

/** The standard answer for a character: summary, sheet with worn gear, items, and the fight in progress (or null). */
export function gameView(c: CharacterSummary, fight: StoredFight | undefined, items: Item[]) {
  return {
    character: c,
    sheet: characterSheet(c.race, c.archetype, c.level, gearStats(items)),
    items,
    fight: fight ? fightView(fight) : null,
  };
}
