import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../src/api.js";

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("sends JSON bodies and returns parsed data", async () => {
    const fetch = respond(200, { account: { id: 1, email: "a@b.c" } });
    vi.stubGlobal("fetch", fetch);
    await expect(api.login("a@b.c", "secret")).resolves.toEqual({ account: { id: 1, email: "a@b.c" } });
    expect(fetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.c", password: "secret" }),
    });
  });

  it("sends no body or content type without a payload", async () => {
    const fetch = respond(200, { ok: true });
    vi.stubGlobal("fetch", fetch);
    await api.rest(7);
    expect(fetch).toHaveBeenCalledWith("/api/characters/7/rest", { method: "POST", credentials: "same-origin", headers: {}, body: null });
  });

  it("posts crafting and boss challenges", async () => {
    const fetch = respond(200, {});
    vi.stubGlobal("fetch", fetch);
    await api.craft(3, "whetstones_1");
    expect(fetch).toHaveBeenLastCalledWith("/api/characters/3/craft", expect.objectContaining({ method: "POST", body: JSON.stringify({ recipeId: "whetstones_1" }) }));
    await api.challenge(3);
    expect(fetch).toHaveBeenLastCalledWith("/api/characters/3/challenge", expect.objectContaining({ method: "POST", body: null }));
  });

  it("posts notice board actions", async () => {
    const fetch = respond(200, {});
    vi.stubGlobal("fetch", fetch);
    const last = (url: string, body: object) =>
      expect(fetch).toHaveBeenLastCalledWith(url, expect.objectContaining({ method: "POST", body: JSON.stringify(body) }));
    await api.acceptQuest(3, "mud_and_rats");
    last("/api/characters/3/quests/accept", { questId: "mud_and_rats" });
    await api.abandonQuest(3, "mud_and_rats");
    last("/api/characters/3/quests/abandon", { questId: "mud_and_rats" });
    await api.completeQuest(3, "mud_and_rats");
    last("/api/characters/3/quests/complete", { questId: "mud_and_rats" });
    await api.completeQuest(3, "wardens_crypt", "reaver");
    last("/api/characters/3/quests/complete", { questId: "wardens_crypt", profession: "reaver" });
  });

  it("turns server errors into ApiError with the server's code and message", async () => {
    vi.stubGlobal("fetch", respond(409, { error: "name_taken", message: "That name is taken." }));
    const err = await api.createCharacter("Aldric", "human", "warrior").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "name_taken", message: "That name is taken." });
  });

  it("falls back to a generic error when the body is not JSON", async () => {
    vi.stubGlobal("fetch", respond(502, "<html>Bad gateway</html>"));
    await expect(api.me()).rejects.toMatchObject({ status: 502, code: "http", message: "HTTP 502" });
  });

  it("reports the server as unreachable when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(api.characters()).rejects.toMatchObject({ status: 0, code: "offline" });
  });
});
