import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { MemoryStore, PgStore, type Store } from "./store/index.js";

const config = loadConfig();

let store: Store;
if (config.databaseUrl) {
  store = new PgStore(createPool(config.databaseUrl));
} else if (config.production) {
  console.error("DATABASE_URL is required in production.");
  process.exit(1);
} else {
  console.warn("DATABASE_URL is not set: using an in-memory store. Accounts are lost on restart.");
  store = new MemoryStore();
}

const app = buildApp({ store, cookieSecure: config.cookieSecure });

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
