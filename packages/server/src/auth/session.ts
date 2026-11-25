import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "l2n_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A new random session token (sent in the cookie) and its hash (stored in the database). */
export function newSessionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest();
