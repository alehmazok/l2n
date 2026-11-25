/**
 * Fight animations. The server sends the whole fight log after every action;
 * `plan` turns the entries that are new into a short list of steps (who is
 * struck, what number flies up, how the bars move), and `play` runs them on
 * the fight scene with the Web Animations API. Planning is pure, so it is
 * tested without a browser; the game stays correct if nothing is played.
 */
import type { LogEntry, PublicFightState } from "@l2n/shared";

export type Side = "player" | "enemy";
export type StepKind = "hit" | "crit" | "miss" | "heal" | "dot" | "buff" | "curse" | "stun" | "mana";

export interface Step {
  /** Who the step lands on: the one who is hit, healed, buffed or stunned. */
  target: Side;
  kind: StepKind;
  /** The floating text, e.g. "−12", "+30", "miss". */
  text: string;
  /** The target's HP once the step has landed. */
  hp: number;
  /** True when the other side lunges first (a blow, not a tick of damage over time). */
  lunge: boolean;
}

/** More new entries than this means the fight was resolved in one go (auto-battle): nothing is played. */
export const MAX_STEPS = 8;
/** Time between two steps, in milliseconds. */
export const STEP_MS = 340;

const other = (s: Side): Side => (s === "player" ? "enemy" : "player");

/**
 * The steps for the log entries from `from` on. HP is walked backwards from
 * the state after them, so every step knows where its bar should stand.
 */
export function plan(state: PublicFightState, from: number): { steps: Step[]; start: Record<Side, number> } {
  const max = { player: state.player.maxHp, enemy: state.enemy.maxHp };
  const draft = state.log.slice(from).flatMap((e) => describe(e) ?? []);
  // HP before the new entries: undo every change, newest first. Healing may have been capped at the maximum.
  const hp = { player: state.player.hp, enemy: state.enemy.hp };
  for (const d of [...draft].reverse()) hp[d.target] = Math.min(max[d.target], Math.max(0, hp[d.target] - d.delta));
  const start = { ...hp };
  const steps = draft.map((d) => {
    hp[d.target] = Math.min(max[d.target], Math.max(0, hp[d.target] + d.delta));
    return { target: d.target, kind: d.kind, text: d.text, hp: hp[d.target], lunge: d.lunge };
  });
  // The state is the truth: whatever the walk lost to caps, the last step of each side ends on the real number.
  for (const side of ["player", "enemy"] as const) {
    const last = steps.filter((s) => s.target === side).pop();
    if (last) last.hp = state[side].hp;
  }
  return { steps, start };
}

type Draft = Omit<Step, "hp"> & { delta: number };

function describe(e: LogEntry): Draft | null {
  switch (e.t) {
    case "hit":
      return { target: other(e.who), kind: e.crit ? "crit" : "hit", text: `−${e.amount}`, delta: -e.amount, lunge: true };
    case "miss":
      return { target: other(e.who), kind: "miss", text: "miss", delta: 0, lunge: true };
    case "heal":
      return { target: "player", kind: "heal", text: `+${e.amount}`, delta: e.amount, lunge: false };
    case "draught":
      return e.item === "healing_draught"
        ? { target: "player", kind: "heal", text: `+${e.amount}`, delta: e.amount, lunge: false }
        : { target: "player", kind: "mana", text: `+${e.amount}`, delta: 0, lunge: false };
    case "dot":
      return { target: "enemy", kind: "dot", text: `−${e.amount}`, delta: -e.amount, lunge: false };
    case "stun":
      return { target: "enemy", kind: "stun", text: "stunned", delta: 0, lunge: false };
    case "buff":
      return { target: "player", kind: "buff", text: e.kind === "shield" ? "ward" : e.kind === "guard" ? "guard" : "attack up", delta: 0, lunge: false };
    case "curse":
      return { target: "enemy", kind: "curse", text: "weakened", delta: 0, lunge: false };
    // A failed escape, a lost turn and a fading effect are told by the log line alone.
    case "flee":
    case "stunned":
    case "fade":
      return null;
  }
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True when `steps` should be played: there are some, not too many, and the player has not asked for less motion. */
export const playable = (steps: Step[]) => steps.length > 0 && steps.length <= MAX_STEPS && !reducedMotion();

/**
 * Plays the steps on a fight scene (see `sceneHtml` in screens/game.ts) and
 * moves the HP bars with them. `setHp` draws a bar at a value. The returned
 * function stops whatever has not happened yet, for when the screen is redrawn.
 */
export function play(scene: HTMLElement, steps: Step[], setHp: (side: Side, hp: number) => void, done?: () => void): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const fighter = (side: Side) => scene.querySelector<HTMLElement>(`.fighter-${side}`);
  steps.forEach((step, i) => {
    timers.push(
      setTimeout(() => {
        const target = fighter(step.target);
        const striker = fighter(other(step.target));
        // The hero stands on the left, the foe on the right: each lunges towards the other.
        const towards = step.target === "enemy" ? 1 : -1;
        if (step.lunge) striker?.animate([{ transform: "none" }, { transform: `translateX(${towards * 14}%)` }, { transform: "none" }], { duration: 220, easing: "ease-out" });
        if (target && (step.kind === "hit" || step.kind === "crit" || step.kind === "dot")) {
          const push = step.kind === "crit" ? 9 : step.kind === "dot" ? 2 : 5;
          target.animate(
            [
              { transform: "none", filter: "none" },
              { transform: `translateX(${towards * push}%) rotate(${towards * (push / 3)}deg)`, filter: "brightness(1.9) saturate(0.4)", offset: 0.25 },
              { transform: `translateX(${-towards * push * 0.5}%)`, filter: "none", offset: 0.6 },
              { transform: "none", filter: "none" },
            ],
            { duration: step.kind === "crit" ? 320 : 260, delay: step.lunge ? 90 : 0 },
          );
        }
        if (target && step.kind === "miss") target.animate([{ transform: "none" }, { transform: `translateX(${towards * 8}%)` }, { transform: "none" }], { duration: 240, delay: 90 });
        if (target && (step.kind === "heal" || step.kind === "buff" || step.kind === "mana"))
          target.animate([{ filter: "none" }, { filter: "brightness(1.5)" }, { filter: "none" }], { duration: 320 });
        if (target) float(target, step);
        setHp(step.target, step.hp);
      }, i * STEP_MS),
    );
  });
  if (done) timers.push(setTimeout(done, steps.length * STEP_MS + 120));
  return () => timers.forEach(clearTimeout);
}

/** A number or word that rises from a fighter and fades. */
function float(target: HTMLElement, step: Step) {
  const el = document.createElement("span");
  el.className = `float float-${step.kind}`;
  el.textContent = step.text;
  target.append(el);
  el.animate(
    [
      { transform: "translate(-50%, 0) scale(0.8)", opacity: 0 },
      { transform: `translate(-50%, -60%) scale(${step.kind === "crit" ? 1.5 : 1})`, opacity: 1, offset: 0.25 },
      { transform: "translate(-50%, -220%) scale(1)", opacity: 0 },
    ],
    { duration: 900, delay: step.lunge ? 90 : 0, easing: "ease-out", fill: "both" },
  ).onfinish = () => el.remove();
}
