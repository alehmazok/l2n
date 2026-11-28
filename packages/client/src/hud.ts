/**
 * Pieces of the game screen's HUD that need no game state: the windows that
 * can be opened over the scene, the dock that opens them, and what a key
 * press means. No DOM here, so it can be tested on its own; screens/game.ts
 * draws the screen.
 */

/** A window over the scene. `place` is the service of the town node the character stands on. */
export type WindowId = "hero" | "bag" | "quests" | "map" | "place" | "menu";

const svg = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;

/** The dock, in order: what each button opens, its label, its key and its picture. */
export const DOCK: { id: WindowId; label: string; key?: string; icon: string }[] = [
  { id: "hero", label: "Hero", key: "c", icon: svg(`<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>`) },
  { id: "bag", label: "Bag", key: "b", icon: svg(`<path d="M6 9h12l1.5 11h-15zM9 9V6a3 3 0 0 1 6 0v3"/>`) },
  { id: "quests", label: "Quests", key: "j", icon: svg(`<path d="M7 4h11v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2h10M7 4a2 2 0 0 0-2 2v10M10 9h5M10 12h5"/>`) },
  { id: "map", label: "Map", key: "m", icon: svg(`<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>`) },
  { id: "menu", label: "Menu", icon: svg(`<path d="M4 6h16M4 12h16M4 18h16"/>`) },
];

/** Pictures for the fight actions that have no icon of their own. */
export const GLYPHS = {
  attack: svg(`<path d="M5 19l2-2M6.5 14.5l3 3M8 16L19 5V3h-2L6 14"/>`),
  flee: svg(`<path d="M14 5h5v14h-5M10 8l-4 4 4 4M6 12h9"/>`),
  auto: svg(`<path d="M5 6l6 6-6 6M13 6l6 6-6 6"/>`),
};

/** What a key press asks of the game screen. */
export type Hotkey =
  | { kind: "open"; window: WindowId }
  /** The nth fight action (attack, skills, draughts), counted from 0. */
  | { kind: "slot"; index: number }
  /** The main button of the moment: hunt, attack, continue. */
  | { kind: "primary" }
  | { kind: "close" }
  | { kind: "chat" };

export interface KeyPress {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** True when the key was typed into a text field, where it is just a letter. */
  typing?: boolean;
}

/**
 * Keys of the game screen: C, B, J and M open the windows, 1–9 are the fight
 * actions, Space is the main button, Enter starts a chat line, Escape closes
 * whatever is open. Nothing fires while typing, except Escape.
 */
export function hotkey(e: KeyPress): Hotkey | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "Escape") return { kind: "close" };
  if (e.typing) return null;
  if (e.key === "Enter") return { kind: "chat" };
  if (e.key === " ") return { kind: "primary" };
  if (/^[1-9]$/.test(e.key)) return { kind: "slot", index: Number(e.key) - 1 };
  const dock = DOCK.find((d) => d.key === e.key.toLowerCase());
  return dock ? { kind: "open", window: dock.id } : null;
}
