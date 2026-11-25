# Decision log

Short record of decisions and why. Newest at the bottom. Proposals that are not
decided yet live in [design.md](design.md), marked **Proposal**.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-25 | The game is original, made "in the spirit of" early-2000s online RPGs. No names, lore, data, art or music from existing games, nothing from their clients or fan databases. Assets are our own or CC0 / similarly clean-licensed. | Legal safety and a game that can stand on its own. |
| 2026-11-25 | Turn-based, no 3D. MVP UI is cards, icons and text; a 2D engine may come later. | Small scope for a hobby project; works well on phones. |
| 2026-11-25 | Targets: browser first, mobile through a PWA, app stores later through Capacitor. | One codebase for all platforms. |
| 2026-11-25 | Stack: TypeScript everywhere, pnpm monorepo (`client`, `server`, `shared`), Node server with authoritative game logic, Postgres. | One language, shared rules between client and server, cheat-resistant. |
| 2026-11-25 | Server and accounts from the start, no offline-only version. | The living-world feel and later PvP need a server anyway. |
| 2026-11-25 | Game language is English. | Wider audience; one language to maintain. |
| 2026-11-25 | MVP scope: levels 1–20, profession change at 20, five races, two archetypes (warrior, mage), one village and three hunting zones on a node map, 1v1 PvE with a zone boss, two gear grades, charges, ~15 crafting recipes, 8–10 quests, shop/warehouse/blacksmith. | Smallest game that still has the full loop: hunt, loot, craft, gear up, change profession. |
| 2026-11-25 | Async arena PvP is step two, after the MVP. Deferred: real-time PvP, clans and sieges, trading, enchanting, parties, pets, 2D engine. | Keep the MVP finishable. |
| 2026-11-25 | Title: **Lost to Nostalgia**, short name **L2N**. | Chosen by Aleh; matches the repo name. |
| 2026-11-25 | Docs live in the repo (README, design doc, this log, MVP plan) and are updated in the same pull requests as code. | Docs that drift from code are worse than none. |
| 2026-11-25 | Combat engine is pure and seeded; numbers come from formulas in the design doc, checked by a balance simulation test. | Reproducible fights, server-side validation, balance changes are reviewable. |
| 2026-11-25 | Accounts use email + password. Passwords are hashed with Node's built-in scrypt; sessions are random tokens in an HttpOnly, SameSite=Lax cookie, stored in Postgres only as a SHA-256 hash, valid 30 days. | No native dependencies and no third-party auth service; a leaked database does not leak live sessions; easy to revoke. |
| 2026-11-25 | Character names: 3–16 letters A–Z, stored capitalised ("Aldric"), unique regardless of case. Up to 4 characters per account. | Readable names in chat and the chronicle, no look-alike impersonation. The slot count can grow later. |
| 2026-11-25 | Persistence goes through a `Store` interface with a Postgres and an in-memory implementation that pass the same contract tests. Without `DATABASE_URL` the dev server uses the in-memory store; in production it refuses to start. | Fast tests and a zero-setup dev loop without letting the two drift apart. |

Open: whether the repository becomes public and under which licence. No
LICENSE file until that is decided.
