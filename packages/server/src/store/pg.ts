import type { CharacterSummary } from "@l2n/shared";
import type pg from "pg";
import type { Account, NewCharacter, Store } from "./types.js";

const UNIQUE_VIOLATION = "23505";

const CHARACTER_COLUMNS = `id, name, race, archetype, profession, level, xp, hp, resource, silver, location, created_at`;

interface CharacterRow {
  id: string;
  name: string;
  race: CharacterSummary["race"];
  archetype: CharacterSummary["archetype"];
  profession: string | null;
  level: number;
  xp: number;
  hp: number;
  resource: number;
  silver: string;
  location: string;
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
  createdAt: r.created_at.toISOString(),
});

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
}
