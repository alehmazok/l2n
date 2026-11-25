/**
 * Chat input commands and the ignore list. No DOM here, so it can be tested
 * on its own; screens/world.ts draws the panel.
 */

/** What a line typed into the chat box asks for. */
export type ChatInput =
  | { kind: "say"; channel: "global" | "zone"; text: string }
  | { kind: "ignore" | "unignore"; name: string }
  | { kind: "help" }
  | { kind: "none" };

/**
 * `/g text` and `/z text` pick a channel for one line, `/ignore Name` and
 * `/unignore Name` manage the ignore list, `/help` lists these. Anything
 * else goes to the channel picked in the panel.
 */
export function parseChatInput(raw: string, channel: "global" | "zone"): ChatInput {
  const line = raw.trim();
  if (!line) return { kind: "none" };
  const m = /^\/(\w+)\s*(.*)$/s.exec(line);
  if (!m) return { kind: "say", channel, text: line };
  const [, cmd, rest] = m as unknown as [string, string, string];
  switch (cmd.toLowerCase()) {
    case "g":
    case "global":
      return rest ? { kind: "say", channel: "global", text: rest } : { kind: "none" };
    case "z":
    case "zone":
      return rest ? { kind: "say", channel: "zone", text: rest } : { kind: "none" };
    case "ignore":
    case "unignore": {
      const name = rest.trim();
      return /^[A-Za-z]{3,16}$/.test(name) ? { kind: cmd.toLowerCase() as "ignore" | "unignore", name: capitalise(name) } : { kind: "help" };
    }
    default:
      return { kind: "help" };
  }
}

const capitalise = (n: string) => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();

export const CHAT_HELP = "Commands: /g text (global), /z text (zone), /ignore Name, /unignore Name.";

const KEY = "l2n.ignored";

/** Names whose lines this browser hides. Kept in localStorage; works (in memory) without it. */
export class IgnoreList {
  private names: Set<string>;

  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()) {
    let saved: unknown = [];
    try {
      saved = JSON.parse(this.storage?.getItem(KEY) ?? "[]");
    } catch {
      saved = [];
    }
    this.names = new Set(Array.isArray(saved) ? saved.filter((n): n is string => typeof n === "string") : []);
  }

  has(name: string) {
    return this.names.has(capitalise(name));
  }

  set(name: string, ignored: boolean) {
    if (ignored) this.names.add(capitalise(name));
    else this.names.delete(capitalise(name));
    try {
      this.storage?.setItem(KEY, JSON.stringify([...this.names]));
    } catch {
      // Storage full or blocked: the list still works until the page closes.
    }
  }

  get size() {
    return this.names.size;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
