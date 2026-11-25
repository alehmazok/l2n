# Lost to Nostalgia (L2N)

A turn-based fantasy RPG with the feel of early-2000s online RPGs, for the
browser and mobile. Original world, names and data; see the
[design document](docs/design.md).

Status: early prototype (MVP stage 0).

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

Open http://localhost:5173 and start a demo fight. The demo does not need the
database yet.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

`packages/shared/test/combat.test.ts` includes a balance simulation: if you
change a formula or a skill, it tells you whether fights are still in the
target range from the design doc.
