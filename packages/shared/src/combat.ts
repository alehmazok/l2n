/**
 * Deterministic 1v1 turn-based combat. Pure functions: the server owns the
 * state and the seed; the client only sends actions and renders the log.
 *
 * Round order: mage mana regen, player action, enemy action (skipped if
 * stunned), then end of round: damage over time ticks on the enemy and the
 * player's buffs count down.
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
  fleeChance,
  hitChance,
  manaRegen,
  maxHp,
  maxMana,
  mobStats,
  type MobRole,
} from "./formulas.js";
import { between, createRng, roll, type Rng } from "./rng.js";
import type { ArchetypeId, Skill, Stats } from "./types.js";

/**
 * Status effects. Buffs (`attack_up`, `guard`, `shield`) last for the rest of
 * the round they are cast in plus `turns` more rounds; `fresh` marks the cast
 * round. A dot ticks at the end of each round, `turns` ticks in total,
 * starting with the round it is applied in.
 */
export type Effect =
  | { kind: "stun"; source: string }
  | { kind: "dot"; name: "bleed" | "burn"; amount: number; turns: number; source: string }
  | { kind: "attack_up"; value: number; turns: number; source: string; fresh?: boolean }
  | { kind: "guard"; value: number; turns: number; source: string; fresh?: boolean }
  | { kind: "shield"; amount: number; turns: number; source: string; fresh?: boolean };

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
  effects: Effect[];
}

export interface PlayerCombatant extends Combatant {
  archetype: ArchetypeId;
  resource: number;
  maxResource: number;
  skills: string[];
  charges: number;
}

export type Action = { type: "attack" } | { type: "skill"; skillId: string } | { type: "flee" };

export type Who = "player" | "enemy";

export type LogEntry =
  | { t: "hit"; who: Who; amount: number; crit: boolean; source: string; absorbed?: number }
  | { t: "miss"; who: Who; source: string }
  | { t: "heal"; amount: number; source: string }
  | { t: "flee"; success: boolean }
  | { t: "stun"; source: string }
  | { t: "stunned" }
  | { t: "dot"; name: "bleed" | "burn"; amount: number }
  | { t: "buff"; kind: "attack_up" | "guard" | "shield"; source: string; amount?: number }
  | { t: "fade"; kind: "attack_up" | "guard" | "shield" };

export type Outcome = "ongoing" | "won" | "lost" | "fled";

export interface FightState {
  round: number;
  rngState: number;
  player: PlayerCombatant;
  enemy: Combatant;
  outcome: Outcome;
  log: LogEntry[];
}

/** What the client is allowed to see: no RNG state, so outcomes cannot be predicted. */
export type PublicFightState = Omit<FightState, "rngState">;
export const publicFight = ({ rngState: _, ...s }: FightState): PublicFightState => s;

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
  /** Current HP and Mana carried into the fight; default full. Focus always starts at 0. */
  hp?: number;
  mana?: number;
}

export function buildPlayer(p: PlayerInput): PlayerCombatant {
  const a = ARCHETYPES[p.archetype];
  const max = Math.round(maxHp(p.archetype, p.level, p.stats.vitality) * (1 + (p.hpBonus ?? 0)));
  const maxResource = a.resource === "mana" ? maxMana(p.level, p.stats.spirit) : MAX_FOCUS;
  const clampTo = (v: number | undefined, m: number) => Math.max(0, Math.min(m, v ?? m));
  return {
    name: p.name,
    archetype: p.archetype,
    level: p.level,
    hp: Math.max(1, clampTo(p.hp, max)),
    maxHp: max,
    atk: attackPower(p.level, p.stats[a.mainStat], p.weaponPower),
    def: defensePower(p.level, p.stats.vitality, p.armour),
    agility: p.stats.agility,
    critBonus: p.critBonus ?? 0,
    damageBonus: p.damageBonus ?? 0,
    effects: [],
    resource: a.resource === "mana" ? clampTo(p.mana, maxResource) : 0,
    maxResource,
    skills: p.skills,
    charges: p.charges,
  };
}

export function buildMob(name: string, level: number, role: MobRole = "normal"): Combatant {
  const m = mobStats(level, role);
  return {
    name,
    level,
    hp: m.hp,
    maxHp: m.hp,
    atk: m.atk,
    def: m.def,
    agility: m.agility,
    critBonus: 0,
    damageBonus: 0,
    effects: [],
  };
}

export function startFight(player: PlayerCombatant, enemy: Combatant, seed: number): FightState {
  return { round: 1, rngState: seed >>> 0, player, enemy, outcome: "ongoing", log: [] };
}

export class InvalidAction extends Error {}

const attackMultiplier = (c: Combatant) =>
  c.effects.reduce((m, e) => (e.kind === "attack_up" ? m * (1 + e.value) : m), 1);

function strike(rng: Rng, att: Combatant, def: Combatant, power: number): { hit: boolean; amount: number; crit: boolean } {
  if (!roll(rng, hitChance(att.agility, def.agility, att.level - def.level))) {
    return { hit: false, amount: 0, crit: false };
  }
  const crit = roll(rng, critChance(att.agility, att.critBonus));
  const raw = baseDamage(att.atk * attackMultiplier(att), def.def, power) * between(rng, 0.9, 1.1) * (1 + att.damageBonus);
  const amount = Math.max(1, Math.round(raw * (crit ? CRIT_MULTIPLIER : 1)));
  return { hit: true, amount, crit };
}

const copy = <T extends Combatant>(c: T): T => ({ ...c, effects: c.effects.map((e) => ({ ...e })) });

/** Skills the player knows and can use right now (implemented, affordable). */
export function usableSkills(p: PlayerCombatant): Skill[] {
  return p.skills.map((id) => skillById(id)).filter((s): s is Skill => s !== undefined && s.cost <= p.resource);
}

function useSkill(rng: Rng, skill: Skill, player: PlayerCombatant, enemy: Combatant, log: LogEntry[]) {
  const e = skill.effect;
  if (e.heal !== undefined) {
    const amount = Math.min(player.maxHp - player.hp, Math.round(player.maxHp * e.heal));
    player.hp += amount;
    log.push({ t: "heal", amount, source: skill.id });
  }
  if (e.buff) {
    const b = e.buff;
    player.effects = player.effects.filter((x) => x.kind !== b.kind);
    if (b.kind === "shield") {
      const amount = Math.round(player.maxHp * b.shareOfMaxHp);
      player.effects.push({ kind: "shield", amount, turns: b.turns, source: skill.id, fresh: true });
      log.push({ t: "buff", kind: "shield", source: skill.id, amount });
    } else {
      player.effects.push({ kind: b.kind, value: b.value, turns: b.turns, source: skill.id, fresh: true });
      log.push({ t: "buff", kind: b.kind, source: skill.id });
    }
  }
  if (!e.damage && !e.dot) return;

  // Offensive part: one hit roll decides the damage and every rider.
  let landed: boolean;
  if (e.damage) {
    const lowHp = e.damage.execute && enemy.hp < enemy.maxHp * e.damage.execute.belowHpShare;
    const r = strike(rng, player, enemy, lowHp ? e.damage.execute!.power : e.damage.power);
    landed = r.hit;
    if (r.hit) {
      enemy.hp -= r.amount;
      log.push({ t: "hit", who: "player", amount: r.amount, crit: r.crit, source: skill.id });
    } else log.push({ t: "miss", who: "player", source: skill.id });
  } else {
    landed = roll(rng, hitChance(player.agility, enemy.agility, player.level - enemy.level));
    if (!landed) log.push({ t: "miss", who: "player", source: skill.id });
  }
  if (!landed || enemy.hp <= 0) return;
  if (e.stun !== undefined && roll(rng, e.stun) && !enemy.effects.some((x) => x.kind === "stun")) {
    enemy.effects.push({ kind: "stun", source: skill.id });
    log.push({ t: "stun", source: skill.id });
  }
  if (e.dot) {
    const d = e.dot;
    const amount = Math.max(1, Math.round(baseDamage(player.atk * attackMultiplier(player), enemy.def, d.power) * (1 + player.damageBonus)));
    enemy.effects = enemy.effects.filter((x) => !(x.kind === "dot" && x.name === d.name));
    enemy.effects.push({ kind: "dot", name: d.name, amount, turns: d.turns, source: skill.id });
  }
}

function enemyTurn(rng: Rng, player: PlayerCombatant, enemy: Combatant, isMage: boolean, log: LogEntry[]) {
  const stun = enemy.effects.findIndex((e) => e.kind === "stun");
  if (stun >= 0) {
    enemy.effects.splice(stun, 1);
    log.push({ t: "stunned" });
    return;
  }
  const r = strike(rng, enemy, player, 1);
  if (!r.hit) {
    log.push({ t: "miss", who: "enemy", source: "attack" });
    return;
  }
  let amount = r.amount;
  const guard = player.effects.find((e) => e.kind === "guard");
  if (guard?.kind === "guard") amount = Math.max(1, Math.round(amount * (1 - guard.value)));
  let absorbed = 0;
  const shield = player.effects.find((e) => e.kind === "shield");
  if (shield?.kind === "shield") {
    absorbed = Math.min(shield.amount, amount);
    shield.amount -= absorbed;
    amount -= absorbed;
    if (shield.amount <= 0) {
      player.effects = player.effects.filter((e) => e !== shield);
      log.push({ t: "fade", kind: "shield" });
    }
  }
  player.hp -= amount;
  log.push({ t: "hit", who: "enemy", amount, crit: r.crit, source: "attack", ...(absorbed ? { absorbed } : {}) });
  if (!isMage) player.resource = Math.min(MAX_FOCUS, player.resource + 1);
}

function endOfRound(player: PlayerCombatant, enemy: Combatant, log: LogEntry[]) {
  for (const e of enemy.effects) {
    if (e.kind !== "dot") continue;
    enemy.hp -= e.amount;
    e.turns -= 1;
    log.push({ t: "dot", name: e.name, amount: e.amount });
  }
  enemy.effects = enemy.effects.filter((e) => e.kind !== "dot" || e.turns > 0);
  const kept: Effect[] = [];
  for (const e of player.effects) {
    if (e.kind === "attack_up" || e.kind === "guard" || e.kind === "shield") {
      if (e.fresh) delete e.fresh;
      else e.turns -= 1;
      if (e.turns <= 0) {
        log.push({ t: "fade", kind: e.kind });
        continue;
      }
    }
    kept.push(e);
  }
  player.effects = kept;
}

/** Resolve one round: player acts, then the enemy (if both still stand). */
export function resolveRound(state: FightState, action: Action): FightState {
  if (state.outcome !== "ongoing") throw new InvalidAction("Fight is over");
  const player = copy(state.player);
  const enemy = copy(state.enemy);
  const isMage = ARCHETYPES[player.archetype].resource === "mana";

  // Validate before touching the RNG so a rejected action changes nothing.
  let skill: Skill | undefined;
  if (action.type === "skill") {
    skill = skillById(action.skillId);
    if (!skill || !player.skills.includes(skill.id)) throw new InvalidAction("Unknown skill");
  }

  const rng = createRng(state.rngState);
  const log: LogEntry[] = [];
  let outcome: Outcome = "ongoing";

  if (isMage) player.resource = Math.min(player.maxResource, player.resource + manaRegen(player.maxResource));
  if (skill && player.resource < skill.cost) throw new InvalidAction("Not enough " + (isMage ? "mana" : "focus"));

  if (action.type === "flee") {
    const success = roll(rng, fleeChance(player.agility, enemy.agility));
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
    player.resource -= skill!.cost;
    useSkill(rng, skill!, player, enemy, log);
  }

  if (enemy.hp <= 0) outcome = "won";

  if (outcome === "ongoing") {
    enemyTurn(rng, player, enemy, isMage, log);
    if (player.hp <= 0) outcome = "lost";
  }

  if (outcome === "ongoing") {
    endOfRound(player, enemy, log);
    if (enemy.hp <= 0) outcome = "won";
  }

  player.hp = Math.max(0, player.hp);
  enemy.hp = Math.max(0, enemy.hp);
  return { round: state.round + 1, rngState: rng.state(), player, enemy, outcome, log: [...state.log, ...log] };
}

/** Expected value of a skill as a damage multiplier, for the auto-battle policy. */
function skillScore(s: Skill, enemy: Combatant): number {
  const e = s.effect;
  let score = 0;
  if (e.damage) {
    const low = e.damage.execute && enemy.hp < enemy.maxHp * e.damage.execute.belowHpShare;
    score += low ? e.damage.execute!.power : e.damage.power;
  }
  if (e.dot && !enemy.effects.some((x) => x.kind === "dot" && x.name === e.dot!.name)) score += e.dot.power * e.dot.turns;
  return score;
}

/**
 * Auto-battle policy (used for weak mobs and for the balance simulation):
 * heal under 35% HP if possible, else the affordable skill with the most
 * expected damage if it beats a basic attack, else a basic attack.
 */
export function autoAction(state: FightState): Action {
  const p = state.player;
  // Mages regenerate before acting; plan with the mana they will have.
  const isMage = ARCHETYPES[p.archetype].resource === "mana";
  const resource = isMage ? Math.min(p.maxResource, p.resource + manaRegen(p.maxResource)) : p.resource;
  const usable = usableSkills({ ...p, resource });
  if (p.hp / p.maxHp < 0.35) {
    const heal = usable.find((s) => s.effect.heal !== undefined);
    if (heal) return { type: "skill", skillId: heal.id };
  }
  let best: { id: string; score: number } | undefined;
  for (const s of usable) {
    const score = skillScore(s, state.enemy);
    if (score > 1 && (!best || score > best.score)) best = { id: s.id, score };
  }
  return best ? { type: "skill", skillId: best.id } : { type: "attack" };
}

export function autoResolve(state: FightState, maxRounds = 50): FightState {
  let s = state;
  while (s.outcome === "ongoing" && s.round <= maxRounds) s = resolveRound(s, autoAction(s));
  return s;
}
