import { normalizeEmail, validateEmail, validatePassword } from "@l2n/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { FailureLimiter } from "../auth/limiter.js";
import { dummyHash, hashPassword, verifyPassword } from "../auth/password.js";
import { SESSION_COOKIE, SESSION_TTL_MS, hashToken, newSessionToken } from "../auth/session.js";
import type { SessionAccount, Store } from "../store/index.js";

declare module "fastify" {
  interface FastifyRequest {
    account: SessionAccount | null;
  }
}

export interface AuthOptions {
  store: Store;
  cookieSecure: boolean;
  now?: () => Date;
}

const credentialsSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    additionalProperties: false,
    properties: { email: { type: "string", maxLength: 320 }, password: { type: "string", maxLength: 1024 } },
  },
} as const;

type Credentials = { Body: { email: string; password: string } };

export async function authRoutes(app: FastifyInstance, opts: AuthOptions) {
  const { store } = opts;
  const now = opts.now ?? (() => new Date());
  const limiter = new FailureLimiter();

  async function startSession(reply: FastifyReply, accountId: number) {
    const { token, hash } = newSessionToken();
    const expiresAt = new Date(now().getTime() + SESSION_TTL_MS);
    await store.createSession(accountId, hash, expiresAt);
    reply.setCookie(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: opts.cookieSecure,
      expires: expiresAt,
    });
  }

  app.post<Credentials>("/api/auth/signup", { schema: credentialsSchema }, async (req, reply) => {
    const email = normalizeEmail(req.body.email);
    const problem = validateEmail(email) ?? validatePassword(req.body.password);
    if (problem) return reply.code(400).send({ error: "invalid", message: problem });
    const account = await store.createAccount(email, await hashPassword(req.body.password));
    if (account === "email_taken")
      return reply.code(409).send({ error: "email_taken", message: "An account with this email already exists." });
    await startSession(reply, account.id);
    return reply.code(201).send({ account: { id: account.id, email: account.email } });
  });

  app.post<Credentials>("/api/auth/login", { schema: credentialsSchema }, async (req, reply) => {
    const email = normalizeEmail(req.body.email);
    if (limiter.blocked(email))
      return reply.code(429).send({ error: "too_many_attempts", message: "Too many failed attempts. Try again later." });
    const account = await store.findAccountByEmail(email);
    const ok = await verifyPassword(req.body.password, account?.passwordHash ?? (await dummyHash()));
    if (!account || !ok) {
      limiter.fail(email);
      return reply.code(401).send({ error: "invalid_credentials", message: "Wrong email or password." });
    }
    limiter.reset(email);
    await startSession(reply, account.id);
    return { account: { id: account.id, email: account.email } };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await store.deleteSession(hashToken(token));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    if (!req.account) return reply.code(401).send({ error: "unauthorized", message: "Not logged in." });
    return { account: req.account };
  });
}

/** Resolves the session cookie into `req.account` on every request. */
export function sessionHook(store: Store, now: () => Date = () => new Date()) {
  return async (req: FastifyRequest) => {
    req.account = null;
    const token = req.cookies[SESSION_COOKIE];
    if (token) req.account = (await store.findSession(hashToken(token), now())) ?? null;
  };
}

export async function requireAccount(req: FastifyRequest, reply: FastifyReply) {
  if (!req.account) return reply.code(401).send({ error: "unauthorized", message: "Not logged in." });
}
