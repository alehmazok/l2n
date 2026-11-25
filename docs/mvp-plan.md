# MVP plan

Each stage ends with something playable in the browser and green CI. Docs are
updated in the same PRs.

## Stage 0 — Foundations (this PR)

- [x] Monorepo with `shared`, `server`, `client`, CI.
- [x] Design document, decision log, this plan.
- [x] Shared formulas and a seeded 1v1 combat engine with tests and a balance
      simulation.
- [x] Server with health, game meta and a demo auto-fight endpoint.
- [x] Postgres schema for accounts and characters, migration runner.
- [x] Client PWA shell that runs a demo fight against the server.

## Stage 1 — Accounts and characters

- Sign up / log in (email + password, hashed; session cookie).
- Create a character: name, race, archetype. List and pick characters.
- Character sheet screen with stats derived from the shared formulas.

## Stage 2 — Real fights and leveling

- Node map for Brackwell and Mossgate Fields.
- Server-side fights bound to a character: state persisted between rounds,
  client sends actions only.
- XP, level-ups, HP and mana carried between fights, resting in town.
- Remaining warrior and mage skill effects (stun, buffs, bleed, shields).
- Death penalty and respawn.
- Auto-battle for weak mobs.

## Stage 3 — Loot, gear and town

- Inventory, equipment slots, item tiers and rarity.
- Mob drop tables for silver, resources and items.
- Shop, warehouse.
- Charges and draughts.

## Stage 4 — Crafting and the rest of the world

- Blacksmith crafting with the ~15 recipes and success chance.
- Thornwood Hollow and Cinder Barrows, elites, the Ashen Warden.
- Economy simulation test (silver in vs. out per hour).

## Stage 5 — Quests and professions

- Quest system and the 8–10 quests.
- Profession chain and the four professions with their first skills.

## Stage 6 — Living world and polish

- Global and zone chat, player counts on nodes, chronicle feed, fallen markers.
- Installable PWA with offline shell, mobile layout pass.
- First CC0 icon set.

After the MVP: async arena, then Capacitor builds for the stores.
