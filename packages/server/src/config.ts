export interface Config {
  port: number;
  databaseUrl: string | undefined;
  production: boolean;
  /** Send the session cookie only over HTTPS. On by default in production. */
  cookieSecure: boolean;
}

export function loadConfig(env = process.env): Config {
  const production = env.NODE_ENV === "production";
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL,
    production,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : production,
  };
}
