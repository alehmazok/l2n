/**
 * PgStore against a real Postgres. Runs only when TEST_DATABASE_URL is set
 * (CI sets it). The database is wiped: never point this at real data.
 */
import { afterAll, describe, it } from "vitest";
import { createPool } from "../src/db.js";
import { runMigrations } from "../src/migrations.js";
import { PgStore } from "../src/store/index.js";
import { storeContract } from "./store.contract.js";

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  describe.skip("store contract: postgres (set TEST_DATABASE_URL to run)", () => it("skipped", () => {}));
} else {
  const pool = createPool(url);
  let migrated = false;
  afterAll(() => pool.end());

  storeContract("postgres", async () => {
    if (!migrated) {
      await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      await runMigrations(pool);
      migrated = true;
    }
    await pool.query("TRUNCATE accounts, sessions, characters, fights RESTART IDENTITY CASCADE");
    return new PgStore(pool);
  });
}
