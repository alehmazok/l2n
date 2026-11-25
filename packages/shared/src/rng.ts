/**
 * Small seeded PRNG (mulberry32). Combat must be reproducible from a seed so the
 * server can replay and verify fights, and tests can pin exact outcomes.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Current internal state, to persist a fight between turns. */
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state() {
      return s;
    },
  };
}

/** True with probability p. */
export function roll(rng: Rng, p: number): boolean {
  return rng.next() < p;
}

/** Uniform float in [min, max). */
export function between(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng.next();
}
