# MVP plan

Each stage ends with something playable in the browser and green CI. Docs are
updated in the same PRs.

## Stage 0 — Foundations (done)

- [x] Monorepo with `shared`, `server`, `client`, CI.
- [x] Design document, decision log, this plan.
- [x] Shared formulas and a seeded 1v1 combat engine with tests and a balance
      simulation.
- [x] Server with health, game meta and a demo auto-fight endpoint.
- [x] Postgres schema for accounts and characters, migration runner.
- [x] Client PWA shell that runs a demo fight against the server.

## Stage 1 — Accounts and characters (done)

- [x] Sign up / log in / log out (email + password hashed with scrypt; session
      cookie backed by a `sessions` table; failed-login limit per email).
- [x] Create a character: name, race, archetype, with a live level 1 preview.
      Up to 4 characters per account, names unique regardless of case.
- [x] List and pick characters.
- [x] Character sheet screen with stats derived from the shared formulas, plus
      a practice auto-fight at the character's level.
- [x] Store contract tests run against both the in-memory store and Postgres
      (Postgres in CI).

Left for later: deleting characters, password reset (needs email sending),
applying racial passives to numbers (stage 2).

## Stage 2 — Real fights and leveling (done)

- [x] Node map for Brackwell and Mossgate Fields, moving along roads, hunting
      with level-weighted encounters.
- [x] Server-side fights bound to a character: state persisted in Postgres
      between rounds, client sends actions only and never sees the RNG state.
- [x] XP, level-ups, HP and mana carried between fights, resting in town.
- [x] Racial passives applied to the numbers.
- [x] Remaining warrior and mage skill effects (stun, buffs, bleed and burn,
      ward, execute).
- [x] Death penalty and respawn.
- [x] Auto-battle for mobs 4+ levels below.

Left for later: town services behind the Market, Smithy, Warehouse and Notice
Board nodes (Market and Warehouse done in stage 3).

## Stage 3 — Loot, gear and town (done)

- [x] Inventory (bag of 40), six equipment slots, Ironbound and Steelsworn
      gear with item levels, rarity (Common, Uncommon, Rare with a bonus).
- [x] Starter kit for new characters; stage 2 characters get their
      provisional kit as real worn gear.
- [x] Mob drop tables for silver, resources, draughts and equipment.
- [x] Brackwell market (buy charges, draughts and gear; sell anything) and
      warehouse (60 per character, storage fee).
- [x] Charges with auto-use matched to the weapon's grade; healing and mana
      draughts in and out of fights; auto-battle drinks when low.
- [x] Economy test: silver per kill against charges spent.

Left for later: account-wide warehouse, gear for the other archetype in drops,
item icons (placeholders for now), the ember vial question in design.md §9.

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
