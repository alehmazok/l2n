/**
 * CLI: `pnpm --filter @l2n/server mute <CharacterName> <hours>`. Keeps the
 * account that owns the character out of chat for that many hours (0 lifts a
 * mute) and deletes the account's chat lines. See README, "Moderation".
 */
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { PgStore } from "./store/index.js";

const [name, hoursArg] = process.argv.slice(2);
const hours = Number(hoursArg);
if (!name || !Number.isFinite(hours) || hours < 0) {
  console.error("Usage: pnpm --filter @l2n/server mute <CharacterName> <hours>");
  process.exit(1);
}
const { databaseUrl } = loadConfig();
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.");
  process.exit(1);
}

const pool = createPool(databaseUrl);
try {
  const until = hours > 0 ? new Date(Date.now() + hours * 3_600_000) : null;
  const found = await new PgStore(pool).muteByCharacterName(name, until);
  if (!found) {
    console.error(`No character named ${name}.`);
    process.exitCode = 1;
  } else console.log(until ? `${name}'s account is muted until ${until.toISOString()}; its chat lines are deleted.` : `${name}'s account can chat again.`);
} finally {
  await pool.end();
}
