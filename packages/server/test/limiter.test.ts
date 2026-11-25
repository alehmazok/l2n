import { describe, expect, it } from "vitest";
import { FailureLimiter } from "../src/auth/limiter.js";

describe("FailureLimiter", () => {
  const setup = () => {
    let t = 0;
    const limiter = new FailureLimiter(3, 1000, () => t);
    return { limiter, advance: (ms: number) => (t += ms) };
  };

  it("blocks a key after max failures within the window, and only that key", () => {
    const { limiter } = setup();
    limiter.fail("a");
    limiter.fail("a");
    expect(limiter.blocked("a")).toBe(false);
    limiter.fail("a");
    expect(limiter.blocked("a")).toBe(true);
    expect(limiter.blocked("b")).toBe(false);
  });

  it("unblocks once the window has passed and starts counting afresh", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) limiter.fail("a");
    advance(1000);
    expect(limiter.blocked("a")).toBe(false);
    limiter.fail("a");
    expect(limiter.blocked("a")).toBe(false);
  });

  it("a failure after an expired window starts a new window", () => {
    const { limiter, advance } = setup();
    limiter.fail("a");
    limiter.fail("a");
    advance(1500);
    limiter.fail("a");
    limiter.fail("a");
    expect(limiter.blocked("a")).toBe(false);
  });

  it("reset clears the count", () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i++) limiter.fail("a");
    limiter.reset("a");
    expect(limiter.blocked("a")).toBe(false);
  });
});
