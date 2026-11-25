import type {
  ArchetypeId,
  CharacterSheet,
  CharacterSummary,
  DraughtId,
  FightResult,
  Item,
  NewItem,
  ProfessionId,
  PublicFightState,
  RaceId,
  Slot,
} from "@l2n/shared";

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
export interface FightView {
  id: number;
  mobId: string;
  nodeId: string;
  state: PublicFightState;
  canAuto: boolean;
}
/** Answer to every game action: the character after it, and the fight in progress if any. */
export interface GameView extends CharacterWithSheet {
  /** Everything the character owns: worn, in the bag and in the warehouse. */
  items: Item[];
  fight: FightView | null;
  /** Present when the action ended a fight: what it gave or cost, and its final state. */
  result?: FightResult;
  ended?: FightView;
  /** Present after a crafting attempt. */
  craft?: CraftResult;
  /** Present after taking, abandoning or turning in a quest. */
  quest?: QuestResult;
}
export interface QuestResult {
  questId: string;
  action: "accepted" | "abandoned" | "completed";
  xp: number;
  silver: number;
  items: NewItem[];
  levelsGained: number;
  profession?: ProfessionId;
}
export interface CraftResult {
  recipeId: string;
  success: boolean;
  fee: number;
  used: { item: string; quantity: number }[];
  made: NewItem[];
}
export type FightAction =
  | { type: "attack" | "flee" | "auto" }
  | { type: "skill"; skillId: string }
  | { type: "item"; itemId: DraughtId };

export const api = {
  me: () => call<{ account: AccountInfo }>("GET", "/api/auth/me"),
  signup: (email: string, password: string) => call<{ account: AccountInfo }>("POST", "/api/auth/signup", { email, password }),
  login: (email: string, password: string) => call<{ account: AccountInfo }>("POST", "/api/auth/login", { email, password }),
  logout: () => call<{ ok: true }>("POST", "/api/auth/logout"),
  characters: () => call<{ characters: CharacterSummary[]; maxCharacters: number }>("GET", "/api/characters"),
  character: (id: number) => call<GameView>("GET", `/api/characters/${id}`),
  createCharacter: (name: string, race: RaceId, archetype: ArchetypeId) =>
    call<CharacterWithSheet>("POST", "/api/characters", { name, race, archetype }),
  move: (id: number, to: string) => call<GameView>("POST", `/api/characters/${id}/move`, { to }),
  rest: (id: number) => call<GameView>("POST", `/api/characters/${id}/rest`),
  hunt: (id: number) => call<GameView>("POST", `/api/characters/${id}/hunt`),
  challenge: (id: number) => call<GameView>("POST", `/api/characters/${id}/challenge`),
  craft: (id: number, recipeId: string) => call<GameView>("POST", `/api/characters/${id}/craft`, { recipeId }),
  act: (id: number, action: FightAction) => call<GameView>("POST", `/api/characters/${id}/fight`, { action }),
  equip: (id: number, itemId: number) => call<GameView>("POST", `/api/characters/${id}/equip`, { itemId }),
  unequip: (id: number, slot: Slot) => call<GameView>("POST", `/api/characters/${id}/unequip`, { slot }),
  use: (id: number, itemId: number) => call<GameView>("POST", `/api/characters/${id}/use`, { itemId }),
  buy: (id: number, stockId: string, quantity = 1) => call<GameView>("POST", `/api/characters/${id}/buy`, { stockId, quantity }),
  sell: (id: number, itemId: number, quantity?: number) => call<GameView>("POST", `/api/characters/${id}/sell`, { itemId, quantity }),
  deposit: (id: number, itemId: number, quantity?: number) =>
    call<GameView>("POST", `/api/characters/${id}/deposit`, { itemId, quantity }),
  withdraw: (id: number, itemId: number, quantity?: number) =>
    call<GameView>("POST", `/api/characters/${id}/withdraw`, { itemId, quantity }),
  acceptQuest: (id: number, questId: string) => call<GameView>("POST", `/api/characters/${id}/quests/accept`, { questId }),
  abandonQuest: (id: number, questId: string) => call<GameView>("POST", `/api/characters/${id}/quests/abandon`, { questId }),
  completeQuest: (id: number, questId: string, profession?: ProfessionId) =>
    call<GameView>("POST", `/api/characters/${id}/quests/complete`, profession ? { questId, profession } : { questId }),
  settings: (id: number, autoCharges: boolean) => call<GameView>("POST", `/api/characters/${id}/settings`, { autoCharges }),
};
