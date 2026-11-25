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
item icons (arrived in stage 6). The ember vial question was settled in
stage 4.

## Stage 4 — Crafting and the rest of the world (done)

- [x] Smithy crafting with 15 recipes, success chance, failure losses and
      rarity rolls; recipes bought from the smith or dropped by elites and
      the boss, learned into a recipe book.
- [x] Thornwood Hollow and Cinder Barrows (six hunting nodes, 21 mobs),
      four elites, the Ashen Warden as a boss you challenge on purpose.
- [x] Ember vials boost damaging spells (the open question from stage 3).
- [x] Balance tests for elites and the boss; economy simulation test
      (silver in vs. out per hour of hunting).

Left for later: a respawn timer for the boss. The Lantern Ward Charm recipe
and the Burrows elite arrived in stage 5.

## Stage 5 — Quests and professions (done)

- [x] Quest system at the Brackwell notice board: kill, deliver, craft,
      visit and warehouse objectives, quest-only drops, a fight chain that
      resets on death, gifts on taking a quest, rewards, abandoning.
- [x] Ten quests from level 1 to 20, about a third of the XP to level 20.
- [x] The Burrow Queen, a quest elite challenged in the Burrows.
- [x] Profession chain (The Unlit Path, Warden's Crypt) with the Lantern
      Ward Charm, and the four professions with a passive and two skills
      each; new engine effects: drain, weaken, blight.
- [x] Balance tests for professions at level 20 and the Burrow Queen.

Left for later: more profession skills above level 20, a quest giver per
quest (everything goes through the notice board for now).

## Stage 6 — Living world and polish (done)

- [x] Global and zone chat with length and rate limits, a level gate on
      global, `/ignore`, and an operator mute.
- [x] Player counts on nodes and roads, chronicle feed (boss kills,
      professions, rare crafts, "first ever"), fallen markers.
- [x] Installable PWA (PNG and maskable icons) with an offline shell; a
      mobile layout pass: chat as a bottom sheet on phones, a sidebar on wide
      screens, bigger tap targets.
- [x] First icon set: 68 item and skill icons generated with Venice's
      cheapest image model in one original style, with a manifest of
      prompts, model and settings and a script to make them again.

Left for later: push updates instead of polling, reporting players, chat
history beyond the latest 50 lines, character portraits (still a letter on
a tinted tile), icons from a better model.

After the MVP: async arena, then Capacitor builds for the stores.
