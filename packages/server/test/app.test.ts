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

  it("serves the world map in meta", async () => {
    const meta = (await buildApp().inject({ method: "GET", url: "/api/meta" })).json();
    expect(meta.nodes.brackwell_square.links).toContain("mossgate_old_road");
    expect(meta.mobs.mire_rat.level).toBe(1);
  });
});
