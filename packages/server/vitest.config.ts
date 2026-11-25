import { defineConfig } from "vitest/config";

// Resolve the shared package from source so tests don't need a build first.
export default defineConfig({
  resolve: { alias: { "@l2n/shared": new URL("../shared/src/index.ts", import.meta.url).pathname } },
});
