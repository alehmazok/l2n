# Lost to Nostalgia — Game Design Document

Status: draft v0.6 (2026-11-25). Short name: **L2N**.

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
in the MVP; each hunting node has a mob pool. Node and mob data live in
`packages/shared/src/data/world.ts`.

| Location | Levels | Nodes | Notes |
| --- | --- | --- | --- |
| **Brackwell** (village) | — | Square, Market, Smithy, Warehouse, Notice Board | Safe. Shop, warehouse, blacksmith, quest givers, respawn point. |
| **Mossgate Fields** | 1–7 | Old Road, Drowned Mill, Burrows | Beasts and vermin. Tutorial quests. Quest elite: the Burrow Queen. |
| **Thornwood Hollow** | 7–14 | Bramble Edge, Spider Dell, Hermit's Rise | Forest creatures and bandits. First elites. |
| **Cinder Barrows** | 14–20 | Ash Gate, Bone Gallery, Warden's Crypt | Undead and constructs. Zone boss: **the Ashen Warden** (level 20, boss role). |

All four are built (Thornwood Hollow and Cinder Barrows in stage 4).

### The map

```
Market   Smithy   Warehouse   Notice Board
     \     |        |        /
         Brackwell Square ──── Old Road ──── Drowned Mill ──── Burrows
                 │                                               │
                 └──────── (cart track) ──────── Bramble Edge ───┘
                                                     │
                                Spider Dell ─────────┘
                                     │
                               Hermit's Rise ──── Ash Gate ──── Bone Gallery ──── Warden's Crypt
```

- **Town nodes** are safe. Resting there restores HP and Mana to full, free
  and instantly. The Market and Warehouse are open (stage 3, see "Items" and
  "Economy"), the Smithy opened in stage 4 (see "Crafting") and the Notice
  Board in stage 5 (see "Quests").
- **Hunting nodes** have a pool of mobs. Hunting starts a fight with one of
  them, weighted towards the player's level: a mob at or below your level has
  weight 3, one level above 2, two or more levels above 1. Elites always
  have weight 1, so they turn up about one hunt in eight to ten.
- **Bosses** never turn up while hunting. The Ashen Warden waits in the
  Warden's Crypt and is fought only when the player chooses to challenge it.
  There is no respawn timer in the MVP.
- **Quest foes** work the same way but only while their quest is active: the
  Burrow Queen (level 7 elite) can be challenged in the Burrows during
  "Burrow Queen". She is not in the hunting pool, so levels 5–7 stay safe
  for players who are not looking for her.
- You cannot move, rest or start another hunt while a fight is in progress.

| Node | Mobs (level) |
| --- | --- |
| Old Road | Mire Rat (1), Hedge Crow (2), Mangy Cur (3) |
| Drowned Mill | Mill Toad (3), Silt Crawler (4), Drowned Scavenger (5) |
| Burrows | Burrow Mole (5), Tusked Digger (6), Burrow Hulk (7) |

| Bramble Edge | Briar Boar (7), Thicket Wolf (8), Roadside Cutpurse (9) |
| Spider Dell | Dell Spider (9), Web Lurker (10), Fungal Shambler (11), **Brood Matron** (11, elite) |
| Hermit's Rise | Crag Lynx (12), Hollow Stag (13), Toll Brigand (14), **Brigand Captain** (14, elite) |
| Ash Gate | Cinder Hound (14), Ashbound Sentry (15), Restless Bones (16) |
| Bone Gallery | Ossuary Crawler (16), Gallery Wight (17), **Bone Colossus** (18, elite) |
| Warden's Crypt | Crypt Keeper (18), Ember Revenant (19), **Gravebound Champion** (20, elite); boss **Ashen Warden** (20) |

Mossgate Fields has no elites in its hunting pools; the Burrow Queen (7,
elite) is a quest foe in the Burrows (see above).

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

Passives apply to the numbers on the sheet and in fights (see
`racialBonuses` in `packages/shared/src/progression.ts`). Forge-born's resource
bonus multiplies each resource drop chance by 1.1, and it adds 5 points to
every crafting success chance.

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

### Character creation

A player account holds up to **4** characters. Creating one means choosing a
name, a race and an archetype; there are no stat points to spend, so every
character of a given race and archetype starts with the same numbers. Names are
3–16 letters (A–Z), shown capitalised, and unique across the server regardless
of case. A new character starts at level 1 in Brackwell Square with full HP, 0 silver,
full mana (mages) or 0 Focus (warriors), wearing a full common Ironbound set of
item level 1 and carrying 3 healing draughts, 50 charges of the first grade and
(mages) 3 mana draughts.

The character sheet shows the stats, derived numbers (HP, Mana or Focus,
attack and defence, crit chance, all with the racial passive applied), the
racial passive and the archetype's skills with the level they unlock at.

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

### Professions

Built in stage 5. The second part of the profession quest chain ends with the
choice, made once and for good at level 20. A profession adds a passive on
top of the racial one and two skills, learned at once. More skills per
branch can come with levels above 20.

| Profession | Archetype | Passive | Skills |
| --- | --- | --- | --- |
| **Vanguard** | Warrior | **Bulwark**: +10% max HP, +10% defence | Bulwark Strike, Shield Wall |
| **Reaver** | Warrior | **Bloodlust**: +12% damage dealt, −10% defence | Savage Cleave, Blood Frenzy |
| **Stormcaller** | Mage | **Overcharge**: +10% damage dealt | Thunderclap, Storm Lash |
| **Hexbinder** | Mage | **Lingering Malice**: +25% damage over time, +5% max HP | Life Drain, Withering Curse |

Data lives in `packages/shared/src/data/archetypes.ts` (passives) and
`data/skills.ts` (skills). Choosing a profession refills HP and Mana.

### Skills

All skills are implemented by the engine (stage 2). Timing rules:

- A rider on a damaging skill (stun, bleed) applies only if the hit lands.
  Searing Brand, which has no direct damage, rolls to hit for its burn.
- **Stun**: the enemy skips its next action, which is the one in the same
  round. A target cannot hold two stuns.
- **Buffs** (War Cry, Iron Stance, Arcane Ward) last for the rest of the round
  they are used in plus the listed number of rounds. Using one again refreshes it.
- **Damage over time** (bleed, burn) ticks at the end of each round, starting
  with the round it is applied in, for the listed number of ticks. Its damage
  per tick is fixed when applied: `atk² / (atk + def) · power`, no crit.
  Re-applying replaces it.
- **Arcane Ward** absorbs damage until its pool is used up or it expires.
  **Iron Stance** applies before the ward.
- **Drain** (Bulwark Strike, Life Drain) heals a share of the direct damage
  the hit dealt, after the hit.
- **Weaken** (Withering Curse) is a curse on the enemy: its attack is lower
  for its next listed number of turns. It counts down at the end of each
  round; a new one replaces the old.

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
| Bulwark Strike | Vanguard | 20 | 3 Focus | 1.5× damage, heal 40% of the damage dealt |
| Shield Wall | Vanguard | 20 | 3 Focus | −50% damage taken for 3 turns |
| Savage Cleave | Reaver | 20 | 4 Focus | 2.6× damage |
| Blood Frenzy | Reaver | 20 | 2 Focus | +35% attack for 3 turns |
| Thunderclap | Stormcaller | 20 | 50 Mana | 3.2× magic damage |
| Storm Lash | Stormcaller | 20 | 26 Mana | 1.2× magic damage, 50% chance the target loses its next action |
| Life Drain | Hexbinder | 20 | 24 Mana | 1.6× magic damage, heal 50% of the damage dealt |
| Withering Curse | Hexbinder | 20 | 26 Mana | Blight 0.45× per turn for 4 turns, target's attack −25% for 3 turns |

## 5. Combat

One player against one enemy, in rounds. Each round the player picks one action:
**Attack**, **Skill**, **Item** (a draught), or **Flee**. A round goes: mage Mana
regeneration, the player's action, the enemy's action (if both still stand and
it is not stunned), then end of round (damage over time ticks, buffs count
down). (Agility-based initiative is a candidate for later.)

The engine is pure and deterministic: given the fight state and a seed it always
produces the same result. The server stores the state, including the RNG
state, in Postgres between rounds; the client only sends actions and draws the
log, and never sees the RNG state, so it cannot predict rolls. This lets the
server validate everything and lets tests pin exact outcomes.

A fight starts with the character's current HP and Mana; Focus starts at 0.
When it ends, the remaining HP and Mana are kept, so a run of fights wears you
down until you rest in town.

At the start of a fight the character takes their draughts and (if auto-use is
on) the charges matching the weapon's grade out of the bag; whatever is left
goes back when the fight ends, however it ends. The inventory cannot change
during a fight.

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
| Flee chance | `0.5 + 0.02·(AgiP − AgiE)`, clamped to 5–95% |
| Charge bonus | ×1.3 damage, one charge each: a warrior's basic attack, or a mage's damaging spell (direct damage or burn) |

`atk² / (atk + def)` never reaches zero, and defence matters more against weak
attackers than against strong ones, so low-level mobs barely scratch you.

### Mobs

Mob stats come from level and role, not from hand-written tables:

| Role | HP | Attack | Defence |
| --- | --- | --- | --- |
| Normal | `20 + 12L` | `6 + 2.5L` | `2 + 1.5L` |
| Elite | ×2.2 | ×1.25 | ×1.2 |
| Boss | ×5 | ×1.4 | ×1.3 |

Mob agility is 10. Individual mobs may later get a small modifier set (fast,
armoured, venomous) on top of the template.

### Balance targets

Checked by a simulation test in `packages/shared/test/combat.test.ts` for every
race × archetype at levels 1, 10 and 20, with racial passives and gear of the
matching tier, played by the auto-battle policy:

- An even-level normal mob dies in **3–5 rounds** for warriors and **2–4
  rounds** for mages on a full mana bar (the test allows 2–7).
- The player wins more than 95% of the time and loses about **15–30%** of HP
  (the test fails above 40%). Current simulation: warriors take 3.0–4.3
  rounds and lose 13–25% HP, mages take 2.0–3.4 rounds and lose 13–28%.
- Mobs two levels above you are a real risk: a level 1 mage on full HP wins
  only about 60% of fights against a level 3 mob. Encounter weighting keeps
  them rare.
- Elites should need a draught or a careful skill rotation; the boss should need
  preparation (charges, draughts, a full bar). Checked in the same test file
  with charges loaded: every race × archetype beats an even-level elite more
  than 95% of the time but loses at least 30% of HP (currently 45–65%). A
  level 20 character with charges and 10 healing draughts beats the Ashen
  Warden more than 85% of the time (currently warriors ~100%, mages ~92%, in
  20–22 rounds, drinking about 6 draughts); without charges and with only 2
  draughts, less than 10% (currently ~1%). The boss role was lowered from
  ×6 HP, ×1.5 attack, ×1.4 defence in stage 4: with those numbers even a
  prepared mage won less than half the time.
- **Professions** keep these targets at level 20 (checked in the same test
  file): every race in every profession beats an even mob more than 95% of
  the time in 1.9–7 rounds (level 20 mages on a full bar already sit at the
  two-round floor, 2.0–2.2) losing under 40% HP, and beats the prepared
  Ashen Warden more than 85% of the time. Every profession wins more often
  against the Warden than the plain archetype: warriors ~100%, Stormcallers
  ~94%, Hexbinders ~95% (plain mages ~90%).
- The Burrow Queen meets the elite target at level 7 like the other elites.

### Fast fights and auto-battle

- Target 20–30 seconds per normal fight, including reading the log.
- **Auto-battle** (decided 2026-11-25) for mobs 4 or more levels below the
  player: the server resolves the rest of the fight in one request with the
  built-in policy (below 35% HP heal with a skill or else a healing draught,
  else the affordable skill with the most expected damage, counting damage over
  time not yet on the target, if it beats a basic attack, which is worth ×1.3
  while a charge is loaded; else attack). This keeps farming quick without removing the danger of
  even-level mobs.

### Death

**A real death penalty** (decided 2026-11-25). On death the player loses 4% of
the current level's XP bar (never dropping a level in the MVP), respawns in
Brackwell Square with 30% HP and 30% Mana, and the fight's loot is lost. The
fear of dying is part of the genre.

## 6. Progression

- Level cap in the MVP: **20**.
- XP to the next level: `(8 + 2L) · (10 + 6L)`. Level 1→2 needs 160 XP,
  19→20 needs 5,704.
- XP per kill: `round((10 + 6·mobLevel) · clamp(1 + 0.1·(mobLevel − playerLevel), 0.1, 1.3))`.
- The curve means about `8 + 2L` even-level kills per level, roughly 530 kills
  from 1 to 20 before quest XP. At ~25 seconds a fight that is about 4 hours of
  pure fighting; quests cover about a third of the total XP (14,600 of 44,080,
  checked by a test), so the MVP takes around 5–6 hours of play to finish.
  A quest's XP is a third of the XP needed for the levels between it and the
  next quest, smoothed. Humans get their +5% on quest XP too. A quest
  reward can level you up, which refills HP and Mana like a kill.
- XP is stored as progress inside the current level; extra XP carries into
  the next level. At the cap, XP stops counting.
- A level-up restores HP and Mana to full.
- Skills are learned automatically at their level in the MVP. A trainer NPC
  and skill costs can come later.

## 7. Items

Item data lives in `packages/shared/src/data/items.ts`, the rules in
`packages/shared/src/items.ts`.

### Slots

Weapon, head, chest, legs, gloves, boots. Accessories come later. Equipment is
made for one archetype: warriors wear mail and swords, mages robes and staves.

### Grades

| Tier | Name | Item levels | Weapon power | Armour of a full set |
| --- | --- | --- | --- | --- |
| I | **Ironbound** | 1–9 | `4 + itemLevel` | `2 + 0.8·itemLevel` |
| II | **Steelsworn** | 10–20 | `8 + itemLevel` | `4 + 0.8·itemLevel` |

Every piece has an **item level**; wearing it needs that character level (so
Steelsworn needs at least 10). Each armour piece carries a share of the set's
armour: chest 35%, legs 25%, head 15%, gloves and boots 12.5% each. A full common
set of your own level is the gear the balance simulation assumes.

Names: Ironbound Sword, Helm, Hauberk, Greaves, Gauntlets, Boots (warrior) and
Staff, Hood, Robe, Breeches, Gloves, Shoes (mage); Steelsworn Blade, Helm,
Cuirass, Greaves, Gauntlets, Sabatons and Staff, Cowl, Vestments, Leggings,
Gloves, Boots.

Characters from stage 2, who fought with a provisional kit of their level,
were given that kit as worn common gear by the stage 3 migration.

### Rarity

**Item rarity** (decided 2026-11-25). Common (×1.00), Uncommon (×1.08) and Rare (×1.16) multiply the item's base
stats. Rare items also roll one bonus, +2% crit chance or +3% max HP, with equal
odds. Dropped equipment is 80% common, 17% uncommon, 3% rare. Shop gear is
always common. Crafted equipment rolls each piece separately with slightly
better odds: 75% common, 20% uncommon, 5% rare.

### Consumables

- **Whetstones** (warriors) and **ember vials** (mages), grades I and II: a
  whetstone boosts one basic attack by ×1.3, an ember vial one damaging spell
  (decided 2026-11-25; spells with direct damage or a burn, not Arcane Ward
  or Mend). Warriors' skills and mages' basic attacks take no charge. A charge works only with a weapon of
  the same grade. With auto-use on (the default), every matching charge in the
  bag is loaded into each fight. They are the main coin sink.
- **Healing draughts** and **mana draughts**: restore 30% of the bar,
  usable in and out of combat (in combat it takes the turn).

### Inventory

- The **bag** holds 40 stacks or pieces; worn gear does not count. Charges,
  draughts and resources stack without limit.
- The **warehouse** in Brackwell holds 60 per character and charges 2 silver
  for each stack or piece stored; taking things out is free.
- Loot that does not fit in the bag is left behind (the fight result lists it).

### Loot

Every won fight pays silver and rolls the mob's drop table, continuing the
fight's own server-side RNG:

- **Silver**: `(4 + L) · role · rand(0.8, 1.2)`, rounded; role ×1 normal, ×3
  elite, ×15 boss.
- **Resources**: each mob lists 2–3 resources with a chance per kill (20–50%),
  usually 1, sometimes up to 2.
- **Healing draught**: 3% on any kill.
- **Equipment**: 3% normal, 20% elite, 100% boss. A random slot, for the
  killer's archetype, with the mob's level as item level and a rarity roll.

- **Recipes**: elites and the Ashen Warden can drop the Steelsworn gear
  recipes (8–10% per elite kill, 25% each from the Warden). Like equipment,
  only recipes for the killer's archetype drop.

Resources by zone (silver value): Mossgate Fields: Rough Hide (4), Bone Shard
(4), Iron Scrap (6), Resin Lump (5), Marsh Herb (5). Thornwood Hollow: Thick
Pelt (7), Heartwood (7), Spider Silk (8), Glowcap (8). Cinder Barrows: Ash
Dust (9), Grave Iron (12), Ember Shard (12). They feed crafting.

## 8. Crafting

Built in stage 4. Recipe data lives in `packages/shared/src/data/recipes.ts`,
the rules in `packages/shared/src/crafting.ts`.

Mobs drop **resources**. At the Brackwell smithy the player combines
resources from the bag with a learned recipe and pays the smith a fee.

- **Recipes** are items. The smith sells the first ten; the Steelsworn gear
  recipes drop from elites and the Ashen Warden; the Lantern ward charm
  recipe comes from the profession quest (stage 5). Using a recipe from the
  bag learns it for good (a character's recipe book), and the item is used up.
- Success chance: `clamp(base + bonus, 5%, 95%)`. Dwarves get +5%.
- The fee is paid on every attempt. On failure half of each resource
  (rounded up) is lost too; the recipe is kept.
- Set recipes make all five armour pieces at once; each piece rolls its own
  rarity. Crafted Ironbound gear has item level 8 and Steelsworn item level
  18, levels the market does not sell.
- The bag must have room for everything a success makes before the attempt.

| # | Recipe | Makes | Resources | Fee | Base chance | Smithy price |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Whetstones (I) | 25 Whetstone (I) | 2 Iron Scrap, 1 Resin Lump | 20 | 90% | 40 |
| 2 | Ember Vials (I) | 25 Ember Vial (I) | 2 Resin Lump, 1 Marsh Herb | 20 | 90% | 40 |
| 3 | Healing Draughts | 3 Healing Draught | 2 Marsh Herb, 1 Bone Shard | 5 | 85% | 50 |
| 4 | Mana Draughts | 3 Mana Draught | 1 Marsh Herb, 2 Resin Lump | 5 | 85% | 50 |
| 5 | Ironbound Sword | iL 8 sword | 6 Iron Scrap, 2 Bone Shard, 2 Rough Hide | 60 | 70% | 150 |
| 6 | Ironbound Staff | iL 8 staff | 5 Resin Lump, 3 Bone Shard, 2 Marsh Herb | 60 | 70% | 150 |
| 7 | Ironbound Mail Set | iL 8 warrior armour, 5 pieces | 8 Iron Scrap, 6 Rough Hide, 2 Bone Shard | 120 | 70% | 250 |
| 8 | Ironbound Robe Set | iL 8 mage armour, 5 pieces | 6 Rough Hide, 4 Marsh Herb, 4 Resin Lump | 120 | 70% | 250 |
| 9 | Whetstones (II) | 25 Whetstone (II) | 2 Iron Scrap, 1 Heartwood | 50 | 80% | 200 |
| 10 | Ember Vials (II) | 25 Ember Vial (II) | 2 Glowcap, 1 Resin Lump | 50 | 80% | 200 |
| 11 | Steelsworn Blade | iL 18 blade | 6 Grave Iron, 3 Heartwood, 2 Thick Pelt | 300 | 55% | drop |
| 12 | Steelsworn Staff | iL 18 staff | 5 Heartwood, 3 Ember Shard, 2 Spider Silk | 300 | 55% | drop |
| 13 | Steelsworn Plate Set | iL 18 warrior armour, 5 pieces | 10 Grave Iron, 6 Thick Pelt, 4 Ash Dust | 600 | 55% | drop |
| 14 | Steelsworn Vestments Set | iL 18 mage armour, 5 pieces | 10 Spider Silk, 4 Ember Shard, 4 Ash Dust | 600 | 55% | drop |
| 15 | Lantern Ward Charm | quest item for the profession chain | 2 each of Ember Shard, Ash Dust, Spider Silk, Heartwood | 100 | 60% | quest |

Crafted supplies cost less than buying them, counting the expected cost of
failures and the resources at full value (a test checks this), so crafting
is where resources are worth the most. Quest items cannot be sold.

## 9. Economy

Currency: **silver**.

- **Sources**: mob coin drops, quest rewards, selling items to NPCs.
- **Sinks**: charges and draughts, crafting fees, recipes, warehouse storage
  fee, gear from the shop.
- NPCs buy items at 30% of their value (at least 1 silver each), so selling is a
  trickle, not an income stream.
- Rule of thumb: an even-level kill should pay slightly more silver than the
  charges it used, so hunting with charges is affordable but not free. The
  economy test in `packages/shared/test/items.test.ts` checks that an
  even-level kill pays 1.1–3.5× the charges spent on it at every level, for
  both archetypes. Warriors spend about 2 charges per fight: ratio 1.3 at
  level 1 rising to 3.2 at level 9, then 1.4 at level 10 rising to 2.2 at
  20. Mages spend about 3 (one per damaging spell): 1.3 at level 1 rising to
  2.2 at 9, then about 1.2 at level 10 rising to 3.0 at 20. Mages use more
  charges per fight, which is why the grade II ember vial costs 4, not 5.
- **Economy simulation** (`packages/shared/test/economy.test.ts`): an hour of
  hunting (144 fights) at every level on the highest node that spans it,
  with charges and healing draughts, counting coin and resources sold
  against charges and draughts used. Over levels 1–20 a player must keep
  15–65% of their income; currently warriors keep about 52% and mages about
  45%. A single level may run at a loss of up to 50% where elites or mobs a
  level or two up sit in the pool (mages at levels 1 and 9 currently run
  at a loss), and a player dies at most twice an hour.

### Brackwell market prices

| Item | Price |
| --- | --- |
| Whetstone / Ember Vial (I) | 2 |
| Whetstone (II) | 5 |
| Ember Vial (II) | 4 |
| Healing / Mana Draught | 10 |
| Weapon, or a full armour set | `(4·iL² + 30)`, ×1.5 for Steelsworn |

Armour pieces cost their share of the set. The market sells gear of item
levels 1, 5, 10 and 15 (e.g. an iL 5 sword is 130, an iL 10 Steelsworn blade
645). Uncommon items are valued ×1.5 and rare ×2.5 when sold. Resources are
worth 3–6 silver.

- Player trading is deferred, so there is no market to balance in the MVP.

## 10. Quests

Built in stage 5. Quest data lives in `packages/shared/src/data/quests.ts`,
the rules in `packages/shared/src/quests.ts`.

- Quests are taken and turned in at the Brackwell **Notice Board**. A quest
  needs its level (and, for part 2 of the profession chain, part 1 done).
  Any number can be active at once; a quest can be abandoned anywhere, which
  drops its progress and any quest items that drop only for it.
- **Objectives**: win fights (against given mobs and/or on a given node),
  deliver items (counted in the bag; handed over on turn-in), craft a
  recipe, reach a node, store something in the warehouse.
- **Quest items** (Miller's Ledger, Dimmed Relic) drop only while a quest
  needs them, one roll per kill after the normal loot, from the fight's own
  RNG. They cannot be sold.
- A **fight chain** (The Hermit's Lamp) starts over when the player dies.
- Some quests give something when taken: a recipe learned straight into the
  book, and items. Rewards are XP, silver and items; the bag must have room.
- The quest log is stored on the character (`quests` jsonb column).

| # | Quest | Level | Objectives | Reward |
| --- | --- | --- | --- | --- |
| 1 | **Mud and Rats** | 1 | Win 5 fights on the Old Road | 140 XP, 30 s, 3 Healing Draughts |
| 2 | **The Miller's Debt** | 3 | Recover the Miller's Ledger (30% per kill at the Drowned Mill); store something in the warehouse | 310 XP, 60 s, 2 Healing Draughts (+3 Mana Draughts for mages) |
| 3 | **Sharpened Edges** | 5 | Craft your charges once. On taking it: the Whetstones (I) or Ember Vials (I) recipe and one batch of resources | 550 XP, 50 s |
| 4 | **Burrow Queen** | 7 | Challenge and kill the Burrow Queen in the Burrows | 850 XP, 120 s, 3 Healing Draughts |
| 5 | **Webbed Roads** | 9 | Win 6 fights in Spider Dell; deliver 5 Spider Silk | 1,500 XP, 200 s |
| 6 | **The Hermit's Lamp** | 12 | Win 5 fights at Hermit's Rise; a death starts the count over. The hermit's first hint about the Dimming | 2,100 XP, 250 s, 5 Healing Draughts |
| 7 | **Bandit Toll** | 14 | Kill the Brigand Captain and 5 Toll Brigands | 2,500 XP, 300 s |
| 8 | **Ash in the Wind** | 16 | Reach the Ash Gate, Bone Gallery and Warden's Crypt; win 4 fights in the Bone Gallery | 3,000 XP, 350 s, 5 Healing Draughts |
| 9 | **The Unlit Path** (profession chain, part 1) | 18 | Deliver 3 Dimmed Relics (25% per kill anywhere in the Cinder Barrows); craft the Lantern Ward Charm. On taking it: the charm recipe | 3,650 XP, 400 s |
| 10 | **Warden's Crypt** (profession chain, part 2) | 20 | Defeat the Ashen Warden; deliver the Lantern Ward Charm. Needs part 1 | 1,000 s and the choice of profession |

Quests pay 2,760 silver in all, more than half of it from the last quest.

## 11. Living world

Signs of a living world from day one, even without real-time PvP (confirmed
by Aleh for stage 6). The client polls the server every 4 seconds while the
game screen is open and the tab is visible (15 seconds after an error); no
websockets yet.

- **Chat**: a **global** channel and one channel per **zone**. You hear global
  and the zone you stand in. Global chat opens at level 2, zone chat to all.
  Lines are up to 200 characters, cleaned of control and invisible
  characters, and always shown as text, never HTML. One account may send a
  line every 2 seconds and 8 a minute. `/g` and `/z` pick a channel for one
  line; `/ignore Name` hides a player's lines in this browser.
- **Moderation**: an operator can mute an account for some hours by
  character name (`pnpm --filter @l2n/server mute <Name> <hours>`), which also
  deletes its chat lines. No reporting or word filter yet.
- **Who is where**: a character counts as present on its node for 5 minutes
  after its last request. Each node and road shows how many are there.
- **Chronicle**: a feed of deeds: defeating the Ashen Warden (boss role), taking
  a profession, and crafting a Rare item. The first time anyone does a deed
  it says so ("Yrsa the Dwarf is the first to defeat the Ashen Warden!").
- **Fallen markers**: a death leaves a marker on the node with the mob that
  did it, seen by everyone for 30 minutes ("Yrsa fell here to a Thicket
  Wolf"); roads show a ✝ for places where someone fell.

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
