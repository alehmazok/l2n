import { api, ApiError, type AccountInfo } from "./api.js";
import { renderAuth } from "./screens/auth.js";
import { renderCharacters } from "./screens/characters.js";
import { renderCreate } from "./screens/create.js";
import { renderGame } from "./screens/game.js";
import { stopWorld } from "./screens/world.js";
import { $, esc } from "./ui.js";
import "@fontsource/im-fell-english/latin-400.css";
import "./style.css";

const app = $("#app");
app.innerHTML = `
  <header class="top">
    <div class="brand">
      <svg class="mark" viewBox="0 0 32 40" aria-hidden="true"><path d="M13 2h6v3h-6zM9 7h14l2 5H7zM9 13h14v17H9zM7 31h18v4H7z" fill="currentColor"/><path d="M16 16c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" fill="#1b1712"/></svg>
      <div><h1>Lost to Nostalgia</h1><p class="sub">A turn-based adventure. Prototype build.</p></div>
    </div>
    <div id="who" class="small"></div>
  </header>
  <div id="screen"></div>`;
const screen = $("#screen");
let account: AccountInfo | null = null;

function drawHeader() {
  const who = $("#who");
  who.innerHTML = account ? `${esc(account.email)} · <button class="link" id="logout">Log out</button>` : "";
  if (account)
    $("#logout").addEventListener("click", async () => {
      await api.logout().catch(() => {});
      account = null;
      location.hash = "#/";
      void route();
    });
}

/** Hash routes: #/ (characters), #/new (create), #/c/:id (game). */
async function route() {
  stopWorld();
  drawHeader();
  if (!account) {
    renderAuth(screen, () => void start());
    return;
  }
  const hash = location.hash.replace(/^#/, "") || "/";
  try {
    const sheet = /^\/c\/(\d+)$/.exec(hash);
    if (hash === "/new") renderCreate(screen, (id) => (location.hash = `#/c/${id}`));
    else if (sheet) await renderGame(screen, Number(sheet[1]));
    else await renderCharacters(screen);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      account = null;
      return route();
    }
    screen.innerHTML = `<section class="panel bad">${esc(err instanceof Error ? err.message : err)}</section>`;
  }
}

async function start() {
  try {
    account = (await api.me()).account;
  } catch (err) {
    account = null;
    if (!(err instanceof ApiError && err.status === 401)) {
      screen.innerHTML = `<section class="panel bad">${esc(err instanceof Error ? err.message : err)}</section>`;
      return;
    }
  }
  await route();
}

window.addEventListener("hashchange", () => void route());

// Offline shell (public/sw.js): only in builds, so dev always serves fresh files.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
const banner = document.createElement("div");
banner.className = "offline-banner";
banner.textContent = "You are offline. The world will be back when you reconnect.";
const showOnline = () => (navigator.onLine ? banner.remove() : document.body.prepend(banner));
window.addEventListener("online", () => {
  showOnline();
  void route();
});
window.addEventListener("offline", showOnline);
showOnline();
void start();
