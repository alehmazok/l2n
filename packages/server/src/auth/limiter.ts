/**
 * In-memory limit on failed logins per key (email). Good enough for one
 * server process; move to Postgres or Redis if the server is ever scaled out.
 */
export class FailureLimiter {
  private readonly fails = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly max = 10,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly now = () => Date.now(),
  ) {}

  blocked(key: string): boolean {
    const f = this.fails.get(key);
    if (!f) return false;
    if (f.until <= this.now()) {
      this.fails.delete(key);
      return false;
    }
    return f.count >= this.max;
  }

  fail(key: string): void {
    const f = this.fails.get(key);
    if (!f || f.until <= this.now()) this.fails.set(key, { count: 1, until: this.now() + this.windowMs });
    else f.count++;
  }

  reset(key: string): void {
    this.fails.delete(key);
  }
}
