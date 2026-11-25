import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("server", () => {
  it("answers health", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ ok: true });
  });

  it("serves game meta", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/api/meta" });
    expect(Object.keys(res.json().races)).toHaveLength(5);
  });

  it("runs a deterministic demo fight", async () => {
    const app = buildApp();
    const url = "/api/demo-fight?race=orc&archetype=warrior&level=5&seed=7";
    const a = (await app.inject({ method: "GET", url })).json();
    const b = (await app.inject({ method: "GET", url })).json();
    expect(a).toEqual(b);
    expect(a.outcome).toBe("won");
  });

  it("rejects an unknown race", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/api/demo-fight?race=goblin" });
    expect(res.statusCode).toBe(400);
  });
});
