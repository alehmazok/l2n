import type { ArchetypeId, CharacterSheet, CharacterSummary, FightState, RaceId } from "@l2n/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "offline", "Server unreachable. Is pnpm dev running?");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "http", data.message ?? `HTTP ${res.status}`);
  return data as T;
}

export interface AccountInfo {
  id: number;
  email: string;
}
export interface CharacterWithSheet {
  character: CharacterSummary;
  sheet: CharacterSheet;
}

export const api = {
  me: () => call<{ account: AccountInfo }>("GET", "/api/auth/me"),
  signup: (email: string, password: string) => call<{ account: AccountInfo }>("POST", "/api/auth/signup", { email, password }),
  login: (email: string, password: string) => call<{ account: AccountInfo }>("POST", "/api/auth/login", { email, password }),
  logout: () => call<{ ok: true }>("POST", "/api/auth/logout"),
  characters: () => call<{ characters: CharacterSummary[]; maxCharacters: number }>("GET", "/api/characters"),
  character: (id: number) => call<CharacterWithSheet>("GET", `/api/characters/${id}`),
  createCharacter: (name: string, race: RaceId, archetype: ArchetypeId) =>
    call<CharacterWithSheet>("POST", "/api/characters", { name, race, archetype }),
  demoFight: (race: RaceId, archetype: ArchetypeId, level: number) =>
    call<FightState>("GET", `/api/demo-fight?${new URLSearchParams({ race, archetype, level: String(level) })}`),
};
