import { defineConfig } from "vite";

const proxy = { "/api": "http://localhost:3000", "/health": "http://localhost:3000" };

export default defineConfig({
  resolve: {
    // Use shared sources directly in dev and build; no separate build step needed.
    alias: { "@l2n/shared": new URL("../shared/src/index.ts", import.meta.url).pathname },
  },
  server: { proxy },
  // `pnpm --filter @l2n/client preview` serves the build (with the service worker) against the dev server.
  preview: { proxy },
});
