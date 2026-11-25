/**
 * Deterministic 1v1 turn-based combat. Pure functions: the server owns the
 * state and the seed; the client only sends actions and renders the log.
 */
import { ARCHETYPES } from "./data/archetypes.js";
import { skillById } from "./data/skills.js";
import {
  CHARGE_MULTIPLIER,
  CRIT_MULTIPLIER,
  MAX_FOCUS,
  attackPower,
  baseDamage,
  critChance,
  defensePower,
  hitChance,
  manaRegen,
  maxHp,
  maxMana,
  mobStats,
  type MobRole,
} from "./formulas.js";
import { between, createRng, roll } from "./rng.js";
import type { ArchetypeId, Stats } from "./types.js";

export interface Combatant {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  agility: number;
  critBonus: number;
  damageBonus: number;
}

export interface PlayerCombatant extends Combatant {
  archetype: ArchetypeId;
  resource: number;
  maxResource: number;
  skills: string[];
  charges: number;
}

export type Action = { type: "attack" } | { type: "skill"; skillId: string } | { type: "flee" };

export type LogEntry =
  | { t: "hit"; who: "player" | "enemy"; amount: number; crit: boolean; source: string }
  | { t: "miss"; who: "player" | "enemy"; source: string }
  | { t: "heal"; amount: number; source: string }
  | { t: "flee"; success: boolean };

export type Outcome = "ongoing" | "won" | "lost" | "fled";

export interface FightState {
  round: number;
  rngState: number;
  player: PlayerCombatant;
  enemy: Combatant;
  outcome: Outcome;
  log: LogEntry[];
}

export interface PlayerInput {
  name: string;
  archetype: ArchetypeId;
  level: number;
  stats: Stats;
  weaponPower: number;
  armour: number;
  skills: string[];
  charges: number;
  critBonus?: number;
  damageBonus?: number;
  hpBonus?: number;
}

export function buildPlayer(p: PlayerInput): PlayerCombatant {
  const a = ARCHETYPES[p.archetype];
  const hp = Math.round(maxHp(p.archetype, p.level, p.stats.vitality) * (1 + (p.hpBonus ?? 0)));
  const maxResource = a.resource === "mana" ? maxMana(p.level, p.stats.spirit) : MAX_FOCUS;
  return {
    name: p.name,
    archetype: p.archetype,
    level: p.level,
    hp,
    maxHp: hp,
    atk: attackPower(p.level, p.stats[a.mainStat], p.weaponPower),
    def: defensePower(p.level, p.stats.vitality, p.armour),
    agility: p.stats.agility,
    critBonus: p.critBonus ?? 0,
    damageBonus: p.damageBonus ?? 0,
    resource: a.resource === "mana" ? maxResource : 0,
    maxResource,
    skills: p.skills,
    charges: p.charges,
  };
}

export function buildMob(name: string, level: number, role: MobRole = "normal"): Combatant {
  const m = mobStats(level, role);
  return { name, level, hp: m.hp, maxHp: m.hp, atk: m.atk, def: m.def, agility: m.agility, critBonus: 0, damageBonus: 0 };
}

export function startFight(player: PlayerCombatant, enemy: Combatant, seed: number): FightState {
  return { round: 1, rngState: seed >>> 0, player, enemy, outcome: "ongoing", log: [] };
}

export class InvalidAction extends Error {}

function strike(
  rng: ReturnType<typeof createRng>,
  att: Combatant,
  def: Combatant,
  power: number,
): { hit: boolean; amount: number; crit: boolean } {
  if (!roll(rng, hitChance(att.agility, def.agility, att.level - def.level))) {
    return { hit: false, amount: 0, crit: false };
  }
  const crit = roll(rng, critChance(att.agility, att.critBonus));
  const raw = baseDamage(att.atk, def.def, power) * between(rng, 0.9, 1.1) * (1 + att.damageBonus);
  const amount = Math.max(1, Math.round(raw * (crit ? CRIT_MULTIPLIER : 1)));
  return { hit: true, amount, crit };
}

/** Resolve one round: player acts, then the enemy (if both still stand). */
export function resolveRound(state: FightState, action: Action): FightState {
  if (state.outcome !== "ongoing") throw new InvalidAction("Fight is over");
  const rng = createRng(state.rngState);
  const player = { ...state.player };
  const enemy = { ...state.enemy };
  const log: LogEntry[] = [];
  const isMage = ARCHETYPES[player.archetype].resource === "mana";
  let outcome: Outcome = "ongoing";

  if (isMage) player.resource = Math.min(player.maxResource, player.resource + manaRegen(player.maxResource));

  if (action.type === "flee") {
    const success = roll(rng, 0.5 + (player.agility - enemy.agility) * 0.02);
    log.push({ t: "flee", success });
    if (success) outcome = "fled";
  } else if (action.type === "attack") {
    let power = 1;
    if (player.charges > 0) {
      player.charges -= 1;
      power *= CHARGE_MULTIPLIER;
    }
    const r = strike(rng, player, enemy, power);
    if (r.hit) {
      enemy.hp -= r.amount;
      log.push({ t: "hit", who: "player", amount: r.amount, crit: r.crit, source: "attack" });
    } else log.push({ t: "miss", who: "player", source: "attack" });
    if (!isMage) player.resource = Math.min(MAX_FOCUS, player.resource + 1);
  } else {
    const skill = skillById(action.skillId);
    if (!skill || !player.skills.includes(skill.id)) throw new InvalidAction("Unknown skill");
    if (skill.effect.kind === "planned") throw new InvalidAction("Skill not implemented yet");
    if (player.resource < skill.cost) throw new InvalidAction("Not enough resource");
    player.resource -= skill.cost;
    if (skill.effect.kind === "heal") {
      const amount = Math.min(player.maxHp - player.hp, Math.round(player.maxHp * skill.effect.percentOfMaxHp));
      player.hp += amount;
      log.push({ t: "heal", amount, source: skill.id });
    } else {
      const r = strike(rng, player, enemy, skill.effect.power);
      if (r.hit) {
        enemy.hp -= r.amount;
        log.push({ t: "hit", who: "player", amount: r.amount, crit: r.crit, source: skill.id });
      } else log.push({ t: "miss", who: "player", source: skill.id });
    }
  }

  if (enemy.hp <= 0) {
    enemy.hp = 0;
    outcome = "won";
  }

  if (outcome === "ongoing") {
    const r = strike(rng, enemy, player, 1);
    if (r.hit) {
      player.hp -= r.amount;
      log.push({ t: "hit", who: "enemy", amount: r.amount, crit: r.crit, source: "attack" });
      if (!isMage) player.resource = Math.min(MAX_FOCUS, player.resource + 1);
    } else log.push({ t: "miss", who: "enemy", source: "attack" });
    if (player.hp <= 0) {
      player.hp = 0;
      outcome = "lost";
    }
  }

  return { round: state.round + 1, rngState: rng.state(), player, enemy, outcome, log: [...state.log, ...log] };
}

/**
 * Simple auto-battle policy (used for weak mobs and for balance simulation):
 * heal under 35% HP if possible, else the strongest affordable damage skill,
 * else a basic attack.
 */
export function autoAction(state: FightState): Action {
  const p = state.player;
  const usable = p.skills
    .map((id) => skillById(id))
    .filter((s) => s !== undefined && s.effect.kind !== "planned" && s.cost <= p.resource);
  if (p.hp / p.maxHp < 0.35) {
    const heal = usable.find((s) => s?.effect.kind === "heal");
    if (heal) return { type: "skill", skillId: heal.id };
  }
  let best: { id: string; power: number } | undefined;
  for (const s of usable) {
    if (s?.effect.kind === "damage" && (!best || s.effect.power > best.power)) best = { id: s.id, power: s.effect.power };
  }
  return best ? { type: "skill", skillId: best.id } : { type: "attack" };
}

export function autoResolve(state: FightState, maxRounds = 50): FightState {
  let s = state;
  while (s.outcome === "ongoing" && s.round <= maxRounds) s = resolveRound(s, autoAction(s));
  return s;
}
