import {
  chronicleKey,
  slotOf,
  type CharacterSummary,
  type ChatChannel,
  type ChatMessage,
  type ChronicleEntry,
  type ChronicleEvent,
  type FallenMarker,
  type FightState,
  type Item,
  type ItemLocation,
  type NewItem,
  type RaceId,
} from "@l2n/shared";
import type pg from "pg";
import type { Account, CharacterPatch, CharacterTx, ItemPatch, NewCharacter, NewChatMessage, Store, StoredFight } from "./types.js";

const UNIQUE_VIOLATION = "23505";

const CHARACTER_COLUMNS = `id, name, race, archetype, profession, level, xp, hp, resource, silver, location, auto_charges, recipes, quests, created_at`;

interface CharacterRow {
  id: string;
  name: string;
  race: CharacterSummary["race"];
  archetype: CharacterSummary["archetype"];
  profession: CharacterSummary["profession"];
  level: number;
  xp: number;
  hp: number;
  resource: number;
  silver: string;
  location: string;
  auto_charges: boolean;
  recipes: string[];
  quests: CharacterSummary["quests"];
  created_at: Date;
}

const toCharacter = (r: CharacterRow): CharacterSummary => ({
  id: Number(r.id),
  name: r.name,
  race: r.race,
  archetype: r.archetype,
  profession: r.profession,
  level: r.level,
  xp: r.xp,
  hp: r.hp,
  resource: r.resource,
  silver: Number(r.silver),
  location: r.location,
  autoCharges: r.auto_charges,
  recipes: r.recipes,
  quests: r.quests,
  createdAt: r.created_at.toISOString(),
});

interface FightRow {
  id: string;
  character_id: string;
  mob_id: string;
  node_id: string;
  state: FightState;
}

const FIGHT_COLUMNS = "id, character_id, mob_id, node_id, state";

const toFight = (r: FightRow): StoredFight => ({
  id: Number(r.id),
  characterId: Number(r.character_id),
  mobId: r.mob_id,
  nodeId: r.node_id,
  state: r.state,
});

interface ItemRow {
  id: string;
  template_id: string;
  item_level: number | null;
  rarity: Item["rarity"];
  bonus: Item["bonus"];
  quantity: number;
  location: ItemLocation;
}

const ITEM_COLUMNS = "id, template_id, item_level, rarity, bonus, quantity, location";

const toItem = (r: ItemRow): Item => ({
  id: Number(r.id),
  templateId: r.template_id,
  itemLevel: r.item_level,
  rarity: r.rarity,
  bonus: r.bonus,
  quantity: r.quantity,
  location: r.location,
});

/** The slot column is set only while an item is worn (see migrations/004_items.sql). */
const slotFor = (templateId: string, location: ItemLocation) => (location === "equipped" ? slotOf(templateId) : null);

async function insertItem(client: pg.PoolClient, characterId: number, i: NewItem): Promise<Item> {
  const { rows } = await client.query<ItemRow>(
    `INSERT INTO items (character_id, template_id, item_level, rarity, bonus, quantity, location, slot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${ITEM_COLUMNS}`,
    [characterId, i.templateId, i.itemLevel, i.rarity, i.bonus, i.quantity, i.location, slotFor(i.templateId, i.location)],
  );
  return toItem(rows[0]!);
}

interface ChatRow {
  id: string;
  channel: ChatChannel;
  name: string;
  race: RaceId;
  text: string;
  created_at: Date;
}
const CHAT_COLUMNS = "id, channel, name, race, text, created_at";
const toChat = (r: ChatRow): ChatMessage => ({ id: Number(r.id), channel: r.channel, name: r.name, race: r.race, text: r.text, at: r.created_at.toISOString() });

interface ChronicleRow {
  id: string;
  event: ChronicleEvent;
  name: string;
  race: RaceId;
  first: boolean;
  created_at: Date;
}
const CHRONICLE_COLUMNS = "id, event, name, race, first, created_at";
const toChronicle = (r: ChronicleRow): ChronicleEntry => ({ id: Number(r.id), event: r.event, name: r.name, race: r.race, first: r.first, at: r.created_at.toISOString() });

interface FallenRow {
  id: string;
  node_id: string;
  name: string;
  race: RaceId;
  mob_id: string;
  created_at: Date;
}
const FALLEN_COLUMNS = "id, node_id, name, race, mob_id, created_at";
const toFallen = (r: FallenRow): FallenMarker => ({ id: Number(r.id), nodeId: r.node_id, name: r.name, race: r.race, mobId: r.mob_id, at: r.created_at.toISOString() });

/** Rows after `afterId` (oldest first), or else the latest `limit` rows, put back in order. */
const pageQuery = (table: string, columns: string, where: string, afterParam: string, limitParam: string, after: boolean) =>
  after
    ? `SELECT ${columns} FROM ${table} WHERE ${where} AND id > ${afterParam} ORDER BY id LIMIT ${limitParam}`
    : `SELECT * FROM (SELECT ${columns} FROM ${table} WHERE ${where} ORDER BY id DESC LIMIT ${limitParam}) latest ORDER BY id`;

/** Column names a CharacterPatch may set; keys are checked against this list before going into SQL. */
const PATCH_COLUMNS: Record<keyof CharacterPatch, string> = {
  level: "level",
  xp: "xp",
  hp: "hp",
  resource: "resource",
  location: "location",
  silver: "silver",
  autoCharges: "auto_charges",
  recipes: "recipes",
  quests: "quests",
  profession: "profession",
};

export class PgStore implements Store {
  constructor(private readonly pool: pg.Pool) {}

  async createAccount(email: string, passwordHash: string): Promise<Account | "email_taken"> {
    try {
      const { rows } = await this.pool.query<{ id: string }>(
        "INSERT INTO accounts (email, password_hash) VALUES ($1, $2) RETURNING id",
        [email, passwordHash],
      );
      return { id: Number(rows[0]!.id), email, passwordHash };
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) return "email_taken";
      throw err;
    }
  }

  async findAccountByEmail(email: string): Promise<Account | undefined> {
    const { rows } = await this.pool.query<{ id: string; email: string; password_hash: string }>(
      "SELECT id, email, password_hash FROM accounts WHERE email = $1",
      [email],
    );
    const r = rows[0];
    return r && { id: Number(r.id), email: r.email, passwordHash: r.password_hash };
  }

  async createSession(accountId: number, tokenHash: Buffer, expiresAt: Date) {
    await this.pool.query("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)", [
      tokenHash,
      accountId,
      expiresAt,
    ]);
  }

  async findSession(tokenHash: Buffer, now: Date) {
    const { rows } = await this.pool.query<{ id: string; email: string }>(
      `SELECT a.id, a.email FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [tokenHash, now],
    );
    return rows[0] && { id: Number(rows[0].id), email: rows[0].email };
  }

  async deleteSession(tokenHash: Buffer) {
    await this.pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
  }

  async listCharacters(accountId: number) {
    const { rows } = await this.pool.query<CharacterRow>(
      `SELECT ${CHARACTER_COLUMNS} FROM characters WHERE account_id = $1 ORDER BY id`,
      [accountId],
    );
    return rows.map(toCharacter);
  }

  async getCharacter(accountId: number, id: number) {
    const { rows } = await this.pool.query<CharacterRow>(
      `SELECT ${CHARACTER_COLUMNS} FROM characters WHERE account_id = $1 AND id = $2`,
      [accountId, id],
    );
    return rows[0] && toCharacter(rows[0]);
  }

  async createCharacter(n: NewCharacter): Promise<CharacterSummary | "name_taken" | "limit_reached"> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Lock the account row so two parallel creates cannot both pass the limit check.
      await client.query("SELECT 1 FROM accounts WHERE id = $1 FOR UPDATE", [n.accountId]);
      const count = await client.query<{ n: string }>("SELECT count(*) AS n FROM characters WHERE account_id = $1", [
        n.accountId,
      ]);
      if (Number(count.rows[0]!.n) >= n.maxPerAccount) {
        await client.query("ROLLBACK");
        return "limit_reached";
      }
      const { rows } = await client.query<CharacterRow>(
        `INSERT INTO characters (account_id, name, race, archetype, hp, resource)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${CHARACTER_COLUMNS}`,
        [n.accountId, n.name, n.race, n.archetype, n.hp, n.resource],
      );
      for (const i of n.items) await insertItem(client, Number(rows[0]!.id), i);
      await client.query("COMMIT");
      return toCharacter(rows[0]!);
    } catch (err) {
      await client.query("ROLLBACK");
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) return "name_taken";
      throw err;
    } finally {
      client.release();
    }
  }

  async getOngoingFight(characterId: number) {
    const { rows } = await this.pool.query<FightRow>(
      `SELECT ${FIGHT_COLUMNS} FROM fights WHERE character_id = $1 AND outcome = 'ongoing'`,
      [characterId],
    );
    return rows[0] && toFight(rows[0]);
  }

  async listItems(characterId: number) {
    const { rows } = await this.pool.query<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM items WHERE character_id = $1 ORDER BY id`, [
      characterId,
    ]);
    return rows.map(toItem);
  }

  async withCharacter<T>(accountId: number, id: number, fn: (tx: CharacterTx) => Promise<T>): Promise<T | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // The row lock serialises every game action on this character.
      const found = await client.query<CharacterRow>(
        `SELECT ${CHARACTER_COLUMNS} FROM characters WHERE account_id = $1 AND id = $2 FOR UPDATE`,
        [accountId, id],
      );
      if (!found.rows[0]) {
        await client.query("ROLLBACK");
        return undefined;
      }
      const ongoing = await client.query<FightRow>(
        `SELECT ${FIGHT_COLUMNS} FROM fights WHERE character_id = $1 AND outcome = 'ongoing'`,
        [id],
      );
      let fightId = ongoing.rows[0] ? Number(ongoing.rows[0].id) : undefined;
      let items = (
        await client.query<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM items WHERE character_id = $1 ORDER BY id`, [id])
      ).rows.map(toItem);
      const known = (itemId: number) => {
        const i = items.find((x) => x.id === itemId);
        if (!i) throw new Error(`No item ${itemId}`);
        return i;
      };
      const tx: CharacterTx = {
        character: toCharacter(found.rows[0]),
        fight: ongoing.rows[0] && toFight(ongoing.rows[0]),
        updateCharacter: async (patch) => {
          const keys = (Object.keys(patch) as (keyof CharacterPatch)[]).filter((k) => patch[k] !== undefined);
          const sets = keys.map((k, i) => {
            if (!Object.hasOwn(PATCH_COLUMNS, k)) throw new Error(`Unknown column ${k}`);
            return `${PATCH_COLUMNS[k]} = $${i + 2}`;
          });
          const { rows } = await client.query<CharacterRow>(
            sets.length
              ? `UPDATE characters SET ${sets.join(", ")} WHERE id = $1 RETURNING ${CHARACTER_COLUMNS}`
              : `SELECT ${CHARACTER_COLUMNS} FROM characters WHERE id = $1`,
            [id, ...keys.map((k) => patch[k])],
          );
          return toCharacter(rows[0]!);
        },
        createFight: async (f) => {
          if (fightId !== undefined) throw new Error("Character already has a fight in progress");
          const { rows } = await client.query<FightRow>(
            `INSERT INTO fights (character_id, mob_id, node_id, outcome, state)
             VALUES ($1, $2, $3, $4, $5) RETURNING ${FIGHT_COLUMNS}`,
            [id, f.mobId, f.nodeId, f.state.outcome, JSON.stringify(f.state)],
          );
          if (f.state.outcome === "ongoing") fightId = Number(rows[0]!.id);
          return toFight(rows[0]!);
        },
        saveFight: async (state) => {
          if (fightId === undefined) throw new Error("No fight in progress");
          const { rows } = await client.query<FightRow>(
            `UPDATE fights SET state = $2, outcome = $3, updated_at = now() WHERE id = $1 RETURNING ${FIGHT_COLUMNS}`,
            [fightId, JSON.stringify(state), state.outcome],
          );
          if (state.outcome !== "ongoing") fightId = undefined;
          return toFight(rows[0]!);
        },
        get items() {
          return items.map((i) => ({ ...i }));
        },
        addItem: async (i) => {
          const added = await insertItem(client, id, i);
          items.push(added);
          return { ...added };
        },
        updateItem: async (itemId, patch: ItemPatch) => {
          const cur = known(itemId);
          const location = patch.location ?? cur.location;
          const { rows } = await client.query<ItemRow>(
            `UPDATE items SET quantity = $2, location = $3, slot = $4 WHERE id = $1 RETURNING ${ITEM_COLUMNS}`,
            [itemId, patch.quantity ?? cur.quantity, location, slotFor(cur.templateId, location)],
          );
          const updated = toItem(rows[0]!);
          items = items.map((x) => (x.id === itemId ? updated : x));
          return { ...updated };
        },
        deleteItem: async (itemId) => {
          known(itemId);
          await client.query("DELETE FROM items WHERE id = $1", [itemId]);
          items = items.filter((x) => x.id !== itemId);
        },
        addChronicle: async (event, at) => {
          const c = tx.character;
          const { rows } = await client.query<ChronicleRow>(
            `INSERT INTO chronicle (kind, key, event, character_id, name, race, first, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOT EXISTS (SELECT 1 FROM chronicle WHERE kind = $1 AND key = $2), $7)
             RETURNING ${CHRONICLE_COLUMNS}`,
            [event.kind, chronicleKey(event), JSON.stringify(event), id, c.name, c.race, at],
          );
          return toChronicle(rows[0]!);
        },
        addFallen: async (nodeId, mobId, at) => {
          const c = tx.character;
          const { rows } = await client.query<FallenRow>(
            `INSERT INTO fallen (node_id, character_id, name, race, mob_id, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${FALLEN_COLUMNS}`,
            [nodeId, id, c.name, c.race, mobId, at],
          );
          return toFallen(rows[0]!);
        },
      };
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  async touchCharacter(accountId: number, id: number, at: Date) {
    const { rows } = await this.pool.query<CharacterRow>(
      `UPDATE characters SET seen_at = $3 WHERE account_id = $1 AND id = $2 RETURNING ${CHARACTER_COLUMNS}`,
      [accountId, id, at],
    );
    return rows[0] && toCharacter(rows[0]);
  }

  async onlineCounts(since: Date) {
    const { rows } = await this.pool.query<{ location: string; n: string }>(
      "SELECT location, count(*) AS n FROM characters WHERE seen_at > $1 GROUP BY location",
      [since],
    );
    return Object.fromEntries(rows.map((r) => [r.location, Number(r.n)]));
  }

  async addChatMessage(m: NewChatMessage) {
    const { rows } = await this.pool.query<ChatRow>(
      `INSERT INTO chat_messages (channel, account_id, character_id, name, race, text, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${CHAT_COLUMNS}`,
      [m.channel, m.accountId, m.characterId, m.name, m.race, m.text, m.at],
    );
    return toChat(rows[0]!);
  }

  async listChat(channels: ChatChannel[], afterId: number | undefined, limit: number) {
    const { rows } = await this.pool.query<ChatRow>(
      pageQuery("chat_messages", CHAT_COLUMNS, "channel = ANY($1)", "$3", "$2", afterId !== undefined),
      afterId !== undefined ? [channels, limit, afterId] : [channels, limit],
    );
    return rows.map(toChat);
  }

  async chatStanding(accountId: number, since: Date) {
    const { rows } = await this.pool.query<{ muted: Date | null; recent: string; last: Date | null }>(
      `SELECT (SELECT chat_muted_until FROM accounts WHERE id = $1) AS muted,
              (SELECT count(*) FROM chat_messages WHERE account_id = $1 AND created_at > $2) AS recent,
              (SELECT max(created_at) FROM chat_messages WHERE account_id = $1) AS last`,
      [accountId, since],
    );
    const r = rows[0]!;
    return { mutedUntil: r.muted, recent: Number(r.recent), last: r.last };
  }

  async muteByCharacterName(name: string, until: Date | null) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ account_id: string }>(
        "UPDATE accounts SET chat_muted_until = $2 WHERE id = (SELECT account_id FROM characters WHERE lower(name) = lower($1)) RETURNING id AS account_id",
        [name, until],
      );
      if (rows[0]) await client.query("DELETE FROM chat_messages WHERE account_id = $1", [rows[0].account_id]);
      await client.query("COMMIT");
      return rows.length > 0;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async listChronicle(afterId: number | undefined, limit: number) {
    const { rows } = await this.pool.query<ChronicleRow>(
      pageQuery("chronicle", CHRONICLE_COLUMNS, "true", "$2", "$1", afterId !== undefined),
      afterId !== undefined ? [limit, afterId] : [limit],
    );
    return rows.map(toChronicle);
  }

  async listFallen(since: Date, limit: number) {
    const { rows } = await this.pool.query<FallenRow>(
      `SELECT ${FALLEN_COLUMNS} FROM fallen WHERE created_at > $1 ORDER BY id DESC LIMIT $2`,
      [since, limit],
    );
    return rows.map(toFallen);
  }
}
