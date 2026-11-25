import { canAutoBattle, characterSheet, publicFight, type CharacterSummary } from "@l2n/shared";
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

/** The standard answer for a character: summary, sheet and the fight in progress (or null). */
export function gameView(c: CharacterSummary, fight: StoredFight | undefined) {
  return { character: c, sheet: characterSheet(c.race, c.archetype, c.level), fight: fight ? fightView(fight) : null };
}
