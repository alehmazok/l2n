export interface Config {
  port: number;
  databaseUrl: string | undefined;
}

export function loadConfig(env = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL,
  };
}
