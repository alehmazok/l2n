# Lost to Nostalgia — Game Design Document

Status: draft v0.1 (2026-11-25). Short name: **L2N**.

This document is the source of truth for game rules and numbers. Game data in
`packages/shared/src` is derived from it; when one changes, the other changes in
the same pull request. Items marked **Proposal** are ideas that have not been
confirmed yet; see [decisions.md](decisions.md) for what has.

## 1. Vision

A turn-based fantasy RPG that brings back the feeling of early-2000s online
RPGs: a shared world, a long road from a muddy starting village to dangerous
lands, gear that matters, a profession change that feels like a milestone, and
other players around you. It runs in the browser and on phones, so sessions can
be five minutes or an evening.

Pillars:

1. **The grind is the journey.** Levels are earned, zones feel dangerous until
   you outgrow them, and each new grade of gear is an event.
2. **Short, readable turns.** A fight is a handful of clear choices, 20 to 30
   seconds for a normal mob.
3. **A world with other people in it.** Even before real PvP, you should feel
   that others are hunting beside you.
4. **Original, not a copy.** The game is made *in the spirit of* the genre.
   All names, lore, numbers and assets are our own or clean-licensed (CC0 or
   similar). Nothing comes from another game's client, data or fan databases.

Presentation: no 3D. The MVP uses cards, icons and text. A 2D engine and
animation may come later.

## 2. World

The continent of **Hollowreach** was held for a thousand years by the
**Lantern Compact**, an oath between the five peoples kept alive by great
lanterns that burned in every city. A century ago the lanterns went dark in a
single night, the Dimming. Nobody agrees why. Roads fell to beasts, old
alliances broke, and the borderlands filled with ruins.

Players are **wayfarers**: people who choose to walk the dark roads, earn coin
from bounties and relic hunting, and maybe find out what put the lanterns out.

### MVP locations

The map is a graph of nodes. Moving between adjacent nodes is free and instant
in the MVP; each hunting node has a mob pool.

| Location | Levels | Nodes | Notes |
| --- | --- | --- | --- |
| **Brackwell** (village) | — | Square, Market, Smithy, Warehouse, Notice Board | Safe. Shop, warehouse, blacksmith, quest givers, respawn point. |
| **Mossgate Fields** | 1–7 | Old Road, Drowned Mill, Burrows | Beasts and vermin. Tutorial quests. |
| **Thornwood Hollow** | 7–14 | Bramble Edge, Spider Dell, Hermit's Rise | Forest creatures and bandits. First elites. |
| **Cinder Barrows** | 14–20 | Ash Gate, Bone Gallery, Warden's Crypt | Undead and constructs. Zone boss: **the Ashen Warden** (level 20, boss role). |

## 3. Races

Every stat starts at 10, then race and archetype modifiers are added. All five
races can play both archetypes; the stat spread makes some pairings stronger,
but none is locked.

| Race | Might | Agility | Vitality | Intellect | Spirit | Passive |
| --- | --- | --- | --- | --- | --- | --- |
| Human | +1 | +1 | +1 | +1 | +1 | **Restless**: +5% XP |
| Dawn Elf | | +3 | −1 | +1 | +2 | **Keen Sight**: +3% crit chance |
| Dusk Elf | +1 | +2 | −1 | +3 | −1 | **Nightblood**: +5% damage dealt |
| Orc | +3 | −1 | +3 | −1 | | **Thick Hide**: +8% max HP |
| Dwarf | +2 | −2 | +3 | | +1 | **Forge-born**: +5% craft success, +10% resource drops |

Short lore notes (to expand later):

- **Humans** rebuilt fastest after the Dimming and run most of the frontier
  villages. Adaptable, ambitious, impatient.
- **Dawn Elves** keep the old forest shrines and still tend small lanterns of
  their own. Graceful and precise.
- **Dusk Elves** broke from their kin long before the Dimming and learned magic
  the Compact forbade. Proud, sharp, distrusted.
- **Orcs** are clans of the high steppe who honour strength and debt. They kept
  their oaths when others did not.
- **Dwarves** are guild-folk of the deep halls, makers of the original lanterns.
  They want to know why their work failed.

### Stats

| Stat | Effect |
| --- | --- |
| Might | Warrior attack power (+4% per point above 10). |
| Agility | Hit chance (+1% per point of difference), crit chance (+0.5% per point), flee chance. |
| Vitality | Max HP (+4% per point), defence (+2% per point). |
| Intellect | Mage attack power (+4% per point). |
| Spirit | Max mana (+4% per point). |

## 4. Archetypes and professions

Two starting archetypes. At level 20 a quest chain unlocks the first profession
change into one of two branches.

| Archetype | Stat mods | Resource | Base HP | HP / level | Professions at 20 |
| --- | --- | --- | --- | --- | --- |
| **Warrior** | Might +4, Vitality +2 | **Focus** | 60 | 14 | **Vanguard** (durable, outlasts enemies) or **Reaver** (trades defence for burst) |
| **Mage** | Intellect +4, Spirit +2 | **Mana** | 40 | 9 | **Stormcaller** (burst, expensive spells) or **Hexbinder** (curses, drains, attrition) |

- **Focus** (warrior): starts each fight at 0, max 5. +1 for each basic attack
  made and each hit taken. Skills spend it. This makes warriors build up over a
  fight.
- **Mana** (mage): max `round((30 + 6·(L−1)) · (1 + 0.04·(Spirit−10)))`.
  Regenerates 5% of max at the start of each of the mage's turns. Mana carries
  over between fights, so mages burst one fight and then rest or drink.

The profession branch skills (about 4 per branch) are designed in the MVP stage
that builds the profession quest.

### Skills

The engine already implements damage and heal skills; the rest are designed and
marked `planned` in data.

| Skill | Archetype | Level | Cost | Effect |
| --- | --- | --- | --- | --- |
| Heavy Blow | Warrior | 1 | 2 Focus | 1.8× physical damage |
| Shield Bash | Warrior | 4 | 2 Focus | 0.8× damage, 50% stun for 1 turn |
| War Cry | Warrior | 7 | 1 Focus | +20% attack for 3 turns |
| Rending Cut | Warrior | 10 | 3 Focus | 1.0× damage, bleed 0.4× for 3 turns |
| Second Wind | Warrior | 13 | 4 Focus | Heal 25% max HP |
| Iron Stance | Warrior | 16 | 2 Focus | −35% damage taken for 2 turns |
| Finishing Strike | Warrior | 19 | 5 Focus | 2.0× damage, 3.5× if target below 30% HP |
| Ember Bolt | Mage | 1 | 8 Mana | 1.6× magic damage |
| Frost Shackle | Mage | 4 | 10 Mana | 0.8× damage, 40% chance target loses next action |
| Arcane Ward | Mage | 7 | 14 Mana | Shield for 20% max HP, 3 turns |
| Searing Brand | Mage | 10 | 16 Mana | Burn 0.6× per turn for 4 turns |
| Mend | Mage | 13 | 18 Mana | Heal 30% max HP |
| Chain Spark | Mage | 16 | 24 Mana | 2.1× magic damage |
| Falling Star | Mage | 19 | 40 Mana | 2.6× magic damage |

## 5. Combat

One player against one enemy, in rounds. Each round the player picks one action:
**Attack**, **Skill**, **Item** (planned), or **Flee**. The player acts first,
then the enemy, if both are still standing. (Agility-based initiative is a
candidate for later.)

The engine is pure and deterministic: given the fight state and a seed it always
produces the same result. The server stores the state and seed, the client only
sends actions and draws the log. This lets the server validate everything and
lets tests pin exact outcomes.

### Formulas

All implemented in `packages/shared/src/formulas.ts`. `L` is level.

| Quantity | Formula |
| --- | --- |
| Max HP | `round((baseHp + hpPerLevel·(L−1)) · (1 + 0.04·(Vit−10)))` |
| Attack power | `(4 + 2L) · (1 + 0.04·(MainStat−10)) + weaponPower` |
| Defence | `(2 + 1.5L) · (1 + 0.02·(Vit−10)) + armour` |
| Damage | `atk² / (atk + def) · skillPower · rand(0.9, 1.1) · (1 + damageBonus)`, ×1.75 on crit, min 1 |
| Hit chance | `0.92 + 0.01·(AgiA − AgiD) + 0.02·(LA − LD)`, clamped to 60–99% |
| Crit chance | `0.05 + 0.005·(Agi − 10) + bonus`, clamped to 1–30% |
| Flee chance | `0.5 + 0.02·(AgiP − AgiE)` |
| Charge bonus | Basic attack ×1.3 while a charge is active, one charge per attack |

`atk² / (atk + def)` never reaches zero, and defence matters more against weak
attackers than against strong ones, so low-level mobs barely scratch you.

### Mobs

Mob stats come from level and role, not from hand-written tables:

| Role | HP | Attack | Defence |
| --- | --- | --- | --- |
| Normal | `20 + 12L` | `6 + 2.5L` | `2 + 1.5L` |
| Elite | ×2.2 | ×1.25 | ×1.2 |
| Boss | ×6 | ×1.5 | ×1.4 |

Mob agility is 10. Individual mobs may later get a small modifier set (fast,
armoured, venomous) on top of the template.

### Balance targets

Checked by a simulation test in `packages/shared/test/combat.test.ts` for every
race × archetype at levels 1, 10 and 20, with gear of the matching tier:

- An even-level normal mob dies in **3–5 rounds** for warriors and **2–4
  rounds** for mages on a full mana bar (the test allows 2–7).
- The player wins more than 95% of the time and loses about **15–30%** of HP.
  Current simulation: warriors lose 14–24%, mages 14–27%.
- Elites should need a potion or a careful skill rotation; the boss should need
  preparation (charges, potions, a level or two of margin).

### Proposal: fast fights and auto-battle

- Target 20–30 seconds per normal fight, including reading the log.
- **Auto-battle** for mobs 4 or more levels below the player: the server
  resolves the fight instantly with the built-in policy (heal below 35% HP,
  else the strongest affordable damage skill, else attack). This keeps
  farming quick without removing the danger of even-level mobs.

### Death

**Proposal: keep a real death penalty.** On death the player loses 4% of the
current level's XP bar (never dropping a level in the MVP), respawns in
Brackwell with 30% HP, and the fight's loot is lost. The fear of dying is part
of the genre.

## 6. Progression

- Level cap in the MVP: **20**.
- XP to the next level: `(8 + 2L) · (10 + 6L)`. Level 1→2 needs 160 XP,
  19→20 needs 5,704.
- XP per kill: `round((10 + 6·mobLevel) · clamp(1 + 0.1·(mobLevel − playerLevel), 0.1, 1.3))`.
- The curve means about `8 + 2L` even-level kills per level, roughly 530 kills
  from 1 to 20 before quest XP. At ~25 seconds a fight that is about 4 hours of
  pure fighting; quests should cover about a third of the total XP, so the MVP
  takes around 5–6 hours of play to finish.
- Skills are learned automatically at their level in the MVP. A trainer NPC
  and skill costs can come later.

## 7. Items

### Slots

Weapon, head, chest, legs, gloves, boots. Accessories come later.

### Grades

| Tier | Name | Required level | Weapon power | Armour per slot set |
| --- | --- | --- | --- | --- |
| I | **Ironbound** | 1 | `4 + itemLevel` | `2 + 0.8·itemLevel` |
| II | **Steelsworn** | 10 | `8 + itemLevel` | `4 + 0.8·itemLevel` |

Armour values are the total for a full set; each piece carries a share.

### Rarity

**Proposal: keep item rarity.** Common (×1.00), Uncommon (×1.08) and Rare
(×1.16) multiply the item's base stats. Rare items also roll one small bonus
(for example +2% crit or +3% max HP). Rarity is rolled on drops and crafts.

### Consumables

- **Whetstone charges** (warriors) and **ember vials** (mages): each charge
  boosts one basic attack by ×1.3. Bought or crafted per tier, toggled to
  auto-use. They are the main coin sink.
- **Healing draughts** and **mana draughts**: restore 30% of the bar,
  usable in and out of combat (in combat it takes the turn).

## 8. Crafting

Mobs drop **resources** (hide, bone, resin, iron scraps, ash dust, and so on).
At the Brackwell smithy the player combines resources, a recipe and a coin fee.

- Success chance: `clamp(base + bonus, 5%, 95%)`. Dwarves get +5%.
- On failure the coin fee and half of each resource are lost; the recipe is kept.
- Recipes drop from mobs or are bought; about 15 in the MVP:

| # | Recipe | Base chance |
| --- | --- | --- |
| 1–2 | Whetstone charges I, Ember vials I | 90% |
| 3–4 | Healing draught, Mana draught | 85% |
| 5–6 | Ironbound sword, Ironbound staff | 70% |
| 7–8 | Ironbound mail set, Ironbound robe set | 70% |
| 9–10 | Whetstone charges II, Ember vials II | 80% |
| 11–12 | Steelsworn blade, Steelsworn staff | 55% |
| 13–14 | Steelsworn plate set, Steelsworn vestments set | 55% |
| 15 | Lantern ward charm (quest item for the profession chain) | 60% |

## 9. Economy

Currency: **silver**.

- **Sources**: mob coin drops, quest rewards, selling items to NPCs.
- **Sinks**: charges and draughts, crafting fees, recipes, warehouse storage
  fee, gear from the shop.
- NPCs buy items at 30% of their shop price, so selling is a trickle, not an
  income stream.
- Rule of thumb: an even-level kill should pay slightly more silver than the
  charges it used, so hunting with charges is affordable but not free.
  Exact drop tables are set in MVP stage 3 with a spreadsheet-style simulation
  in tests.
- Player trading is deferred, so there is no market to balance in the MVP.

## 10. Quests

8–10 quests in the MVP, given at the Brackwell notice board:

1. **Mud and Rats** (L1): kill 5 vermin on the Old Road. Tutorial for combat.
2. **The Miller's Debt** (L3): recover a ledger from the Drowned Mill. Tutorial
   for loot and the warehouse.
3. **Sharpened Edges** (L5): craft your first charges at the smithy. Tutorial
   for crafting.
4. **Burrow Queen** (L7): kill an elite in the Burrows.
5. **Webbed Roads** (L9): clear Spider Dell and bring back silk.
6. **The Hermit's Lamp** (L12): escort-style fight chain at Hermit's Rise;
   first hint about the Dimming.
7. **Bandit Toll** (L14): defeat three bandit elites in Thornwood.
8. **Ash in the Wind** (L16): scout the Cinder Barrows.
9. **Profession chain, part 1: The Unlit Path** (L18): gather relics and craft
   the lantern ward charm.
10. **Profession chain, part 2: Warden's Crypt** (L20): defeat the Ashen Warden,
    then choose your profession.

## 11. Living world

**Proposal: signs of a living world from day one**, even without real-time PvP:

- A **global chat** and a zone chat.
- Each node shows how many players are hunting there right now.
- A **chronicle** feed: "Yrsa the Dwarf defeated the Ashen Warden", first
  profession changes, rare crafts.
- **Fallen markers**: where a player died, others briefly see a marker with
  the mob that did it.

## 12. PvP (after MVP)

Deferred, but the data model should not block it:

- **Step two: async arena.** You fight another player's saved character,
  controlled by the auto-battle policy.
- Later: real-time duels and open-world PvP with a **karma** system that
  punishes killing players who do not fight back.

## 13. Out of scope for the MVP

Synchronous PvP, clans and sieges, player trading, enchanting, parties, pets,
gathering nodes, 2D engine and animations.

## 14. Technical shape

- `packages/shared`: types, data, formulas, combat engine. Pure and
  deterministic, used by both server and client.
- `packages/server`: Node + Fastify, authoritative. Owns accounts, characters,
  fights and economy, stores them in Postgres.
- `packages/client`: TypeScript + Vite PWA. Renders state and sends intents.
  A Capacitor wrapper for app stores comes later.
