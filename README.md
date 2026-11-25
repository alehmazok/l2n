# Lost to Nostalgia (L2N)

A turn-based fantasy RPG with the feel of early-2000s online RPGs, for the
browser and mobile. Original world, names and data; see the
[design document](docs/design.md).

Status: early prototype (MVP stage 2: map, real fights and leveling).

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
Brackwell Square to the Old Road and hunt.

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
| POST | `/api/characters/:id/fight` | `{ action: { type: "attack" \| "skill" \| "flee" \| "auto", skillId? } }`. Resolves one round (or the whole fight for `auto`). When the fight ends the answer adds `result` (XP, level-ups, death) and `ended` (the final fight state). |
| GET | `/api/meta` | Races, archetypes, skills, zones, map nodes, mobs. |

Game actions answer with `{ character, sheet, fight }`. They return 409
`in_fight` when a fight is in progress and the action needs you to be free.

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

## License

[MIT](LICENSE) © 2026 Aleh
