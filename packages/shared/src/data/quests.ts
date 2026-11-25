/**
 * The quests of the Brackwell notice board. Source: docs/design.md, section
 * "Quests". The rules (taking a quest, progress, turning it in) are in
 * packages/shared/src/quests.ts.
 */
import type { ArchetypeId } from "../types.js";
import type { ZoneId } from "./world.js";

/** Something a quest asks for. `label` is the line shown in the quest log. */
export type QuestObjective =
  /** Win fights against `mobs` (any mob if left out), at `node` if given. */
  | { kind: "kill"; label: string; count: number; mobs?: string[]; node?: string; resetOnLoss?: boolean }
  /**
   * Have `count` of an item in the bag when turning the quest in; they are
   * handed over. With `drop`, the item drops from kills while the quest
   * needs it (from `mobs`, at `node` or anywhere in `zone`).
   */
  | { kind: "deliver"; label: string; item: string; count: number; drop?: { chance: number; mobs?: string[]; node?: string; zone?: ZoneId } }
  /** Succeed at one of `recipes` at the smithy. */
  | { kind: "craft"; label: string; recipes: string[]; count: number }
  /** Walk to a node. */
  | { kind: "visit"; label: string; node: string }
  /** Store something in the warehouse. */
  | { kind: "deposit"; label: string; count: number };

/** An item given by a quest; `archetype` limits it to one archetype. */
export interface QuestItem {
  item: string;
  quantity: number;
  archetype?: ArchetypeId;
}

export interface Quest {
  id: string;
  name: string;
  /** Lowest character level that can take the quest. */
  level: number;
  /** A quest that must be done first. */
  requires?: string;
  /** One line for the notice board. */
  summary: string;
  /** The notice itself, shown before and while the quest is taken. */
  story: string;
  /** Shown when the quest is turned in. */
  done: string;
  objectives: QuestObjective[];
  /** Given when the quest is taken: recipes learned straight into the book, and items. */
  onAccept?: { recipes?: { recipe: string; archetype?: ArchetypeId }[]; items?: QuestItem[] };
  reward: { xp: number; silver: number; items?: QuestItem[] };
  /** Turning this quest in is the profession change. */
  profession?: true;
}

const LIST: Quest[] = [
  {
    id: "mud_and_rats",
    name: "Mud and Rats",
    level: 1,
    summary: "The road out of town is crawling. Clear some of it.",
    story:
      "Notice, nailed low: \"Carters wanted for the Mossgate run. None will go while the Old Road is crawling. Two coppers a tail.\" Someone has crossed out \"coppers\" and written \"silver\". Take your first steps out of Brackwell and thin out what lives on the Old Road.",
    done: "The carter at the square counts your trophies twice, pulls a face and pays. \"You'll do. Mind the mill, though.\"",
    objectives: [{ kind: "kill", label: "Beasts slain on the Old Road", count: 5, node: "mossgate_old_road" }],
    reward: { xp: 140, silver: 30, items: [{ item: "healing_draught", quantity: 3 }] },
  },
  {
    id: "millers_debt",
    name: "The Miller's Debt",
    level: 3,
    summary: "Fetch a drowned ledger from the mill and put something by for later.",
    story:
      "The widow Orla kept the mill's books until the river took the wheel. The ledger went under with it, and half of Brackwell owes her flour money. Something at the Drowned Mill has it now. Bring it back, and while you are at it, rent a stall at the warehouse: the keeper is her cousin, and what you carry you can lose.",
    done: "Orla turns the swollen pages one by one. \"Every name still there. Thank you, wayfarer.\" She presses a few coins and two draughts into your hand.",
    objectives: [
      { kind: "deliver", label: "Miller's Ledger", item: "millers_ledger", count: 1, drop: { chance: 0.3, node: "mossgate_drowned_mill" } },
      { kind: "deposit", label: "Things stored at the warehouse", count: 1 },
    ],
    reward: { xp: 310, silver: 60, items: [{ item: "healing_draught", quantity: 2 }, { item: "mana_draught", quantity: 3, archetype: "mage" }] },
  },
  {
    id: "sharpened_edges",
    name: "Sharpened Edges",
    level: 5,
    summary: "The smith will teach you to make your own charges.",
    story:
      "Hadda the smith is tired of selling whetstones and ember vials one at a time. \"Bring me scrap and resin and I'll show you how it's done. Here, this much you get for free.\" She hands you a recipe and enough to make one batch. Craft it at the smithy.",
    done: "Hadda inspects your work and nods once. \"Not bad. Next batch, you bring the stuff.\"",
    objectives: [{ kind: "craft", label: "Charges crafted at the smithy", recipes: ["whetstones_1", "ember_vials_1"], count: 1 }],
    onAccept: {
      recipes: [
        { recipe: "whetstones_1", archetype: "warrior" },
        { recipe: "ember_vials_1", archetype: "mage" },
      ],
      items: [
        { item: "iron_scrap", quantity: 2, archetype: "warrior" },
        { item: "resin_lump", quantity: 1, archetype: "warrior" },
        { item: "resin_lump", quantity: 2, archetype: "mage" },
        { item: "marsh_herb", quantity: 1, archetype: "mage" },
      ],
    },
    reward: { xp: 550, silver: 50 },
  },
  {
    id: "burrow_queen",
    name: "Burrow Queen",
    level: 7,
    summary: "Something huge is digging under the Burrows. Kill it.",
    story:
      "The hillside at the Burrows sinks a little more every night, and the farm at its foot has lost two cows into the ground. The diggers have a queen down there, big as a cart. Find her in the Burrows and end the digging. She is no common beast: take draughts.",
    done: "The farmer stamps on the ground as if to test it. \"Quiet down there at last.\" He pays from a tin box, and adds three draughts his wife brewed.",
    objectives: [{ kind: "kill", label: "Burrow Queen slain", count: 1, mobs: ["burrow_queen"] }],
    reward: { xp: 850, silver: 120, items: [{ item: "healing_draught", quantity: 3 }] },
  },
  {
    id: "webbed_roads",
    name: "Webbed Roads",
    level: 9,
    summary: "Clear the webs of Spider Dell and bring back silk.",
    story:
      "The track through Thornwood is strung with web again, and the ropemaker in Brackwell will pay for good silk. Clear the spiders out of Spider Dell and bring back five lengths of Spider Silk.",
    done: "The ropemaker pulls a strand between two fingers until it sings. \"Good, strong stuff.\" The road is open, for a while.",
    objectives: [
      { kind: "kill", label: "Creatures slain in Spider Dell", count: 6, node: "thornwood_spider_dell" },
      { kind: "deliver", label: "Spider Silk", item: "spider_silk", count: 5 },
    ],
    reward: { xp: 1500, silver: 200 },
  },
  {
    id: "hermits_lamp",
    name: "The Hermit's Lamp",
    level: 12,
    summary: "See the hermit's oil up the path at Hermit's Rise.",
    story:
      "A hermit lives at the top of Hermit's Rise and keeps a lamp burning in the window, the only light on that hill. The brigands have cut him off. Carry his oil up the path and fight off whatever stands in the way. If you fall, the oil is spilled and the lamp goes out: you start again.",
    done:
      "The old man fills the lamp with shaking hands. \"They did not burn out, you know, the great lanterns. I was there. The light was pulled from them, all in one night, east, towards the barrows. Nobody listens to a hermit.\" He gives you what little he has.",
    objectives: [{ kind: "kill", label: "Foes fought off on the hermit's path", count: 5, node: "thornwood_hermits_rise", resetOnLoss: true }],
    reward: { xp: 2100, silver: 250, items: [{ item: "healing_draught", quantity: 5 }] },
  },
  {
    id: "bandit_toll",
    name: "Bandit Toll",
    level: 14,
    summary: "Break the brigands who hold the toll at Hermit's Rise.",
    story:
      "The brigands on the Rise call it a toll. Brackwell calls it robbery. The reeve wants their captain dead and their band scattered, so the hill road can carry carts again.",
    done: "The reeve hangs the captain's stolen badge on the notice board for all to see. \"That will make the next lot think twice.\"",
    objectives: [
      { kind: "kill", label: "Brigand Captain slain", count: 1, mobs: ["brigand_captain"] },
      { kind: "kill", label: "Toll Brigands slain", count: 5, mobs: ["toll_brigand"] },
    ],
    reward: { xp: 2500, silver: 300 },
  },
  {
    id: "ash_in_the_wind",
    name: "Ash in the Wind",
    level: 16,
    summary: "Scout the Cinder Barrows as far as the Warden's Crypt.",
    story:
      "Grey ash has been falling on Brackwell when the wind blows from the east. The reeve wants to know what is stirring in the Cinder Barrows. Walk as far as the Warden's Crypt, thin out the dead in the Bone Gallery on the way, and come back to tell it.",
    done: "The reeve listens to the end without a word, then pours you a drink. \"A dead lantern over a throne of ash. The hermit was right, then.\"",
    objectives: [
      { kind: "visit", label: "Reach the Ash Gate", node: "cinder_ash_gate" },
      { kind: "visit", label: "Reach the Bone Gallery", node: "cinder_bone_gallery" },
      { kind: "visit", label: "Reach the Warden's Crypt", node: "cinder_wardens_crypt" },
      { kind: "kill", label: "Dead laid to rest in the Bone Gallery", count: 4, node: "cinder_bone_gallery" },
    ],
    reward: { xp: 3000, silver: 350, items: [{ item: "healing_draught", quantity: 5 }] },
  },
  {
    id: "unlit_path",
    name: "The Unlit Path",
    level: 18,
    summary: "Profession chain, part 1: gather relics and craft a lantern ward charm.",
    story:
      "The hermit has come down from the Rise. \"The Warden keeps the light that was stolen, and the dark around him eats any lamp you carry. The old lantern-makers had a ward for that.\" He teaches you the charm's making. Recover three Dimmed Relics from the dead of the Cinder Barrows and craft a Lantern Ward Charm at the smithy. Keep the charm: you will need it.",
    done:
      "The hermit holds the charm up to the light. For a moment it glows by itself. \"It remembers. Now you are ready to choose the road you will walk, and to face the Warden.\"",
    objectives: [
      { kind: "deliver", label: "Dimmed Relics", item: "dimmed_relic", count: 3, drop: { chance: 0.25, zone: "cinder_barrows" } },
      { kind: "craft", label: "Lantern Ward Charm crafted", recipes: ["lantern_ward_charm"], count: 1 },
    ],
    onAccept: { recipes: [{ recipe: "lantern_ward_charm" }] },
    reward: { xp: 3650, silver: 400 },
  },
  {
    id: "wardens_crypt",
    name: "Warden's Crypt",
    level: 20,
    requires: "unlit_path",
    summary: "Profession chain, part 2: defeat the Ashen Warden and choose your profession.",
    story:
      "Carry the Lantern Ward Charm into the Warden's Crypt and defeat the Ashen Warden. Then bring the charm back to the notice board, where the hermit waits, and choose your path: every wayfarer who comes back from the crypt is changed by it.",
    done: "The charm burns steadily now, a small light that does not go out. The hermit smiles for the first time. \"One lantern lit. Many more to go.\"",
    objectives: [
      { kind: "kill", label: "Ashen Warden defeated", count: 1, mobs: ["ashen_warden"] },
      { kind: "deliver", label: "Lantern Ward Charm", item: "lantern_ward_charm", count: 1 },
    ],
    reward: { xp: 0, silver: 1000 },
    profession: true,
  },
];

export const QUESTS: Record<string, Quest> = Object.fromEntries(LIST.map((q) => [q.id, q]));
/** Quests in the order the notice board lists them. */
export const QUEST_LIST: Quest[] = LIST;

export const questById = (id: string): Quest | undefined => (Object.hasOwn(QUESTS, id) ? QUESTS[id] : undefined);
