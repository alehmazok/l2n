import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("has dev defaults", () => {
    expect(loadConfig({})).toEqual({ port: 3000, databaseUrl: undefined, production: false, cookieSecure: false });
  });

  it("reads port and database url", () => {
    const c = loadConfig({ PORT: "8080", DATABASE_URL: "postgres://x" });
    expect(c.port).toBe(8080);
    expect(c.databaseUrl).toBe("postgres://x");
  });

  it("uses secure cookies in production unless told otherwise", () => {
    expect(loadConfig({ NODE_ENV: "production" })).toMatchObject({ production: true, cookieSecure: true });
    expect(loadConfig({ NODE_ENV: "production", COOKIE_SECURE: "false" }).cookieSecure).toBe(false);
    expect(loadConfig({ COOKIE_SECURE: "true" }).cookieSecure).toBe(true);
  });
});
