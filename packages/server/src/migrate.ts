/** CLI: `pnpm db:migrate`. */
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { runMigrations } from "./migrations.js";

const { databaseUrl } = loadConfig();
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.");
  process.exit(1);
}

const pool = createPool(databaseUrl);
try {
  const applied = await runMigrations(pool, console.log);
  if (applied.length === 0) console.log("database is up to date");
} finally {
  await pool.end();
}
