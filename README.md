# Lost to Nostalgia (L2N)

A turn-based fantasy RPG with the feel of early-2000s online RPGs, for the
browser and mobile. Original world, names and data; see the
[design document](docs/design.md).

Status: early prototype (MVP stage 6: chat, player counts, the chronicle and fallen markers; installable as a PWA).

## Docs

- [Design document](docs/design.md): world, races, archetypes, combat and progression formulas, economy. Game data is derived from it.
- [Decision log](docs/decisions.md)
- [MVP plan](docs/mvp-plan.md)

## Structure

```
packages/
  shared/   types, game data, formulas, deterministic combat engine (used by both sides)
  server/   Node + Fastify API, authoritative game logic, Postgres migrations
  client/   TypeScript + Vite PWA
docs/       design doc, decision log, MVP plan
```

## Running locally

Requirements: Node 22.12+, pnpm 10 (`corepack enable`), Docker for Postgres.

```sh
pnpm install
cp .env.example .env
pnpm db:up          # start Postgres in Docker
pnpm db:migrate     # apply migrations
pnpm dev            # server on :3000, client on :5173
```

Open http://localhost:5173, create an account and a character, walk from
Brackwell Square to the Notice Board for your first quest, then to the Old Road
to hunt. Sell the loot at the Market.

Without `DATABASE_URL` the dev server falls back to an in-memory store and
warns about it: handy for a quick look, but accounts vanish on restart.

## API

All game endpoints take and return JSON. Errors look like
`{ "error": "name_taken", "message": "..." }`.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/signup` | `{ email, password }`. Sets the `l2n_session` cookie. |
| POST | `/api/auth/login` | `{ email, password }`. 429 after 10 failures in 15 min. |
| POST | `/api/auth/logout` | Ends the session. |
| GET | `/api/auth/me` | Current account, or 401. |
| GET | `/api/characters` | The account's characters and the slot limit. |
| POST | `/api/characters` | `{ name, race, archetype }`. Returns the character and its sheet. |
| GET | `/api/characters/:id` | One character with its sheet and the fight in progress (or `null`). |
| POST | `/api/characters/:id/move` | `{ to }`: walk to an adjacent map node. |
| POST | `/api/characters/:id/rest` | Restore HP and Mana; town nodes only. |
| POST | `/api/characters/:id/hunt` | Start a fight with a mob of the current hunting node. |
| POST | `/api/characters/:id/fight` | `{ action: { type: "attack" \| "skill" \| "item" \| "flee" \| "auto", skillId?, itemId? } }`. `itemId` is `healing_draught` or `mana_draught`. Resolves one round (or the whole fight for `auto`). When the fight ends the answer adds `result` (XP, level-ups, death, loot) and `ended` (the final fight state). |
| POST | `/api/characters/:id/equip` | `{ itemId }`: wear a piece from the bag, swapping out the worn one. |
| POST | `/api/characters/:id/unequip` | `{ slot }`: take a piece off into the bag. |
| POST | `/api/characters/:id/use` | `{ itemId }`: drink a draught outside a fight. |
| POST | `/api/characters/:id/buy` | `{ stockId, quantity? }`: at the Market. Stock ids are in `/api/meta`. |
| POST | `/api/characters/:id/sell` | `{ itemId, quantity? }`: at the Market, from the bag. |
| POST | `/api/characters/:id/deposit` | `{ itemId, quantity? }`: at the Warehouse, for a fee. |
| POST | `/api/characters/:id/withdraw` | `{ itemId, quantity? }`: at the Warehouse. |
| POST | `/api/characters/:id/settings` | `{ autoCharges }`: load charges into fights automatically. |
| GET | `/api/characters/:id/world` | `?chat=<lastId>&chronicle=<lastId>`. Marks the character present and answers `{ online, chat, chronicle, fallen, now }`: players per node, new chat lines on global and the character's zone, new chronicle entries, fallen markers of the last 30 min. Without cursors: the latest 50 lines and 20 entries. |
| POST | `/api/characters/:id/chat` | `{ channel: "global" \| "zone", text }`. 403 `level_too_low` (global below level 2) or `muted`, 429 `too_fast`. |
| GET | `/api/meta` | Races, archetypes, skills, zones, map nodes, mobs, items, market stock, inventory limits. |

Game actions answer with `{ character, sheet, items, fight }`. They return 409
`in_fight` when a fight is in progress and the action needs you to be free.

## Installing on a phone

The client is a PWA. A production build (`pnpm build`) registers a service
worker (`packages/client/public/sw.js`) that caches the page so it opens
offline and says so; the API is never cached. To try it locally, run the
server with `pnpm dev` and the built client with
`pnpm --filter @l2n/client preview` (port 4173), then use the browser's
"Install" or "Add to Home Screen". The PNG icons are rendered from
`icon.svg` by `scripts/render-app-icons.cjs`.

## Item and skill icons

The icons in `packages/client/src/assets/icons` were generated with Venice
(see "Art" in the design doc). `manifest.json` next to them records the
prompt, model, seed and post-processing of each. To make some or all of them
again, for example with a better model (needs a Venice API key and
ImageMagick):

```sh
VENICE_API_KEY=… node scripts/generate-icons.mjs --model <model-id> --only heavy_blow,mend
node scripts/generate-icons.mjs --dry-run   # print the requests only
```

## Moderation

Chat is limited to 200 characters, 1 line per 2 seconds and 8 per minute per
account, and global chat opens at level 2. Players can hide someone with
`/ignore Name`. To mute an account (and delete its chat lines):

```sh
pnpm --filter @l2n/server mute Yrsa 24   # 24 hours; 0 lifts the mute
```

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

Server tests run against an in-memory store. To also run the store contract
tests against Postgres, point `TEST_DATABASE_URL` at a throwaway database (the
tests wipe it):

```sh
TEST_DATABASE_URL=postgres://l2n:l2n@localhost:5432/l2n_test pnpm test
```

`packages/shared/test/combat.test.ts` includes a balance simulation: if you
change a formula or a skill, it tells you whether fights are still in the
target range from the design doc.

### Coverage

```sh
pnpm coverage                      # text table in the terminal, HTML in coverage/index.html
node scripts/coverage-summary.mjs  # per-package Markdown table
```

CI runs the tests with coverage on every push and pull request (with Postgres,
so `pg.ts` is covered there), puts the per-package table in the run's summary
and keeps the HTML report as the `coverage-report` artifact for 14 days. There
is no minimum threshold yet. Game rules (`shared`) and the server's routes and
stores are the parts that must stay well covered; the client's DOM screens are
not unit tested.

## License

[MIT](LICENSE) © 2026 Aleh
