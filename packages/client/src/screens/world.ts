/**
 * The living-world panel of the game screen: the chat window with its chat,
 * combat and chronicle tabs, and the player counts and fallen markers
 * sprinkled over the scene and the map. It polls the server while the game
 * screen is open and the tab is visible.
 */
import {
  NODES,
  ZONES,
  chronicleText,
  fallenText,
  timeAgo,
  type ChatMessage,
  type ChronicleEntry,
  type FallenMarker,
  type WorldView,
} from "@l2n/shared";
import { api, ApiError } from "../api.js";
import { CHAT_HELP, IgnoreList, parseChatInput } from "../chat.js";
import { esc } from "../ui.js";

const POLL_MS = 4000;
const POLL_IDLE_MS = 15000;
const KEEP_CHAT = 200;
const KEEP_CHRONICLE = 50;

let stopActive: (() => void) | null = null;

/** Stop polling, e.g. when leaving the game screen. */
export function stopWorld() {
  stopActive?.();
  stopActive = null;
}

export interface WorldPanel {
  /** Fill in player counts and fallen markers on the freshly drawn game screen. */
  decorate(): void;
  /** Show a fight's log in the combat tab; `jump` turns to that tab, for a fight that has just begun. */
  combat(html: string, jump: boolean): void;
  /** Put the cursor in the chat box. */
  focus(): void;
  /** Shrink the window back to a few lines where it was opened over the scene. True if it was open. */
  shrink(): boolean;
}

/**
 * Start the chat window in `aside` for character `id`. `game` is the element
 * the game screen draws into; `location` tells where the character stands now.
 */
export function startWorld(aside: HTMLElement, game: HTMLElement, id: number, location: () => string): WorldPanel {
  stopWorld();
  const ignored = new IgnoreList();
  let online: Record<string, number> = {};
  let chat: ChatMessage[] = [];
  let chronicle: ChronicleEntry[] = [];
  let fallen: FallenMarker[] = [];
  let lastChat: number | undefined;
  let lastChronicle: number | undefined;
  /** Server clock minus ours, so "min ago" matches the server. */
  let skew = 0;
  let tab: "chat" | "combat" | "chronicle" = "chat";
  let combatLog = "";
  let notice = "";
  let unreadChronicle = 0;
  let unreadChat = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let failures = 0;

  // On a phone held sideways the window is a few lines of the current tab; a tap opens it over the scene (see style.css).
  aside.innerHTML = `
    <div class="chat-tabs small" role="tablist">
      <button class="chat-tab active" data-tab="chat" role="tab">Chat <span class="unread" data-unread="chat"></span></button>
      <button class="chat-tab" data-tab="combat" role="tab">Combat</button>
      <button class="chat-tab" data-tab="chronicle" role="tab">Chronicle <span class="unread" data-unread="chronicle"></span></button>
      <button class="quiet world-close" aria-label="Shrink chat">✕</button>
    </div>
    <div class="world-body" aria-live="polite"></div>
    <form class="chat-form row">
      <select name="channel" aria-label="Channel"><option value="zone">Zone</option><option value="global">Global</option></select>
      <input name="text" class="grow" maxlength="200" autocomplete="off" enterkeyhint="send" placeholder="Say something… (/help)" aria-label="Chat message" />
      <button type="submit">Send</button>
    </form>
    <p class="small muted chat-notice" role="status"></p>`;
  const body = aside.querySelector<HTMLElement>(".world-body")!;
  const form = aside.querySelector<HTMLFormElement>(".chat-form")!;
  const input = form.querySelector<HTMLInputElement>("input")!;
  const select = form.querySelector<HTMLSelectElement>("select")!;
  const noticeEl = aside.querySelector<HTMLElement>(".chat-notice")!;

  const serverNow = () => new Date(Date.now() + skew);
  const channelLabel = (m: ChatMessage) => (m.channel === "global" ? "Global" : (ZONES[m.channel]?.name ?? m.channel));

  const drawBody = () => {
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
    const now = serverNow();
    if (tab === "chat") {
      const lines = chat.filter((m) => !ignored.has(m.name));
      body.innerHTML = lines.length
        ? `<ol class="chat">${lines
            .map(
              (m) =>
                `<li class="chat-${m.channel === "global" ? "global" : "zone"}"><span class="muted small" title="${esc(new Date(m.at).toLocaleString())}">[${esc(channelLabel(m))}]</span> <b>${esc(m.name)}</b>: ${esc(m.text)}</li>`,
            )
            .join("")}</ol>`
        : `<p class="muted small">It is quiet. Say hello: zone chat reaches everyone in ${esc(ZONES[NODES[location()]?.zone ?? "brackwell"]?.name ?? "this zone")}.</p>`;
    } else if (tab === "combat") {
      body.innerHTML = combatLog || `<p class="muted small">No fight yet. Every blow struck and taken is written here.</p>`;
    } else {
      body.innerHTML = chronicle.length
        ? `<ol class="chronicle">${[...chronicle]
            .reverse()
            .map((e) => `<li class="${e.first ? "first" : ""}">${esc(chronicleText(e))} <span class="muted small">${esc(timeAgo(e.at, now))}</span></li>`)
            .join("")}</ol>`
        : `<p class="muted small">No deeds yet. Defeat the Ashen Warden, take a profession or forge a Rare piece to be the first in the chronicle.</p>`;
    }
    if (tab === "combat" || (tab === "chat" && atBottom)) body.scrollTop = body.scrollHeight;
    aside.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    if (tab === "chat") unreadChat = 0;
    aside.querySelector('[data-unread="chat"]')!.textContent = unreadChat ? `(${unreadChat})` : "";
    aside.querySelector('[data-unread="chronicle"]')!.textContent = unreadChronicle ? `(${unreadChronicle})` : "";
    noticeEl.textContent = notice;
  };

  const decorate = () => {
    const here = location();
    game.querySelectorAll<HTMLElement>("[data-online]").forEach((el) => {
      const n = online[el.dataset.online!] ?? 0;
      // On the map there is room for a number only: the others at a place, not counting yourself.
      if (el.dataset.short !== undefined) {
        const others = el.dataset.online === here ? n - 1 : n;
        el.textContent = others > 0 ? ` ●${others}` : "";
        el.title = others > 0 ? `${others} ${others > 1 ? "players" : "player"} here` : "";
        return;
      }
      el.textContent = el.dataset.online === here ? (n > 1 ? `You and ${n - 1} other${n > 2 ? "s" : ""} are here.` : "") : n ? `· ${n} here` : "";
    });
    game.querySelectorAll<HTMLElement>("[data-fallen]").forEach((el) => {
      const n = fallen.filter((f) => f.nodeId === el.dataset.fallen).length;
      el.textContent = n ? ` ✝${n > 1 ? n : ""}` : "";
      el.title = n ? `${n} fell here recently` : "";
    });
    const box = game.querySelector<HTMLElement>("#fallen-here");
    if (box) {
      const now = serverNow();
      const marks = fallen.filter((f) => f.nodeId === here).slice(0, 5);
      box.innerHTML = marks.map((f) => `<li>✝ ${esc(fallenText(f))} <span class="muted">${esc(timeAgo(f.at, now))}</span></li>`).join("");
      box.hidden = marks.length === 0;
    }
  };

  const merge = (w: WorldView) => {
    skew = new Date(w.now).getTime() - Date.now();
    online = w.online;
    fallen = w.fallen;
    if (w.chat.length) {
      const fresh = w.chat.filter((m) => !chat.some((x) => x.id === m.id));
      if (lastChat !== undefined && tab !== "chat") unreadChat += fresh.filter((m) => !ignored.has(m.name)).length;
      chat = [...chat, ...fresh].slice(-KEEP_CHAT);
      lastChat = chat.at(-1)!.id;
    }
    if (w.chronicle.length) {
      if (lastChronicle !== undefined && tab !== "chronicle") unreadChronicle += w.chronicle.length;
      chronicle = [...chronicle, ...w.chronicle.filter((e) => !chronicle.some((x) => x.id === e.id))].slice(-KEEP_CHRONICLE);
      lastChronicle = chronicle.at(-1)!.id;
    }
  };

  const schedule = (ms: number) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => void poll(), ms);
  };

  const poll = async () => {
    if (stopped) return;
    if (document.visibilityState === "hidden") return schedule(POLL_IDLE_MS);
    try {
      merge(await api.world(id, { chat: lastChat, chronicle: lastChronicle }));
      failures = 0;
      if (notice.startsWith("Connection")) notice = "";
    } catch (err) {
      failures++;
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) return stopWorld();
      if (failures >= 2) notice = "Connection to the world lost. Retrying…";
    }
    if (stopped) return;
    drawBody();
    decorate();
    schedule(failures ? POLL_IDLE_MS : POLL_MS);
  };

  const setOpen = (open: boolean) => {
    if (aside.classList.contains("open") === open) return false;
    aside.classList.toggle("open", open);
    drawBody();
    body.scrollTop = body.scrollHeight;
    return true;
  };
  aside.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab as typeof tab;
      if (tab === "chronicle") unreadChronicle = 0;
      setOpen(true);
      drawBody();
    }),
  );
  body.addEventListener("click", () => setOpen(true));
  aside.querySelector(".world-close")!.addEventListener("click", () => setOpen(false));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cmd = parseChatInput(input.value, select.value as "global" | "zone");
    notice = "";
    if (cmd.kind === "help") notice = CHAT_HELP;
    if (cmd.kind === "ignore" || cmd.kind === "unignore") {
      ignored.set(cmd.name, cmd.kind === "ignore");
      notice = cmd.kind === "ignore" ? `You no longer see ${cmd.name}'s lines.` : `You see ${cmd.name}'s lines again.`;
      input.value = "";
    }
    if (cmd.kind === "say") {
      form.querySelector("button")!.disabled = true;
      try {
        await api.chat(id, cmd.channel, cmd.text);
        input.value = "";
        tab = "chat";
        await poll();
      } catch (err) {
        notice = err instanceof Error ? err.message : String(err);
      }
      form.querySelector("button")!.disabled = false;
      input.focus();
    }
    drawBody();
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") void poll();
  };
  document.addEventListener("visibilitychange", onVisible);
  stopActive = () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };

  drawBody();
  void poll();
  return {
    decorate,
    combat(html, jump) {
      combatLog = html;
      if (jump) tab = "combat";
      drawBody();
    },
    focus() {
      setOpen(true);
      input.focus();
    },
    shrink: () => setOpen(false),
  };
}
