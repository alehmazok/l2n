import { defineConfig } from "vitest/config";

// Root config: runs every package's tests as one project each and measures
// coverage across the whole monorepo (`pnpm coverage`). Package configs still
// work on their own for `pnpm test`.
export default defineConfig({
  test: {
    projects: ["packages/*"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.d.ts"],
      reporter: ["text", "html", "json-summary", "lcov"],
      reportsDirectory: "coverage",
    },
  },
});
