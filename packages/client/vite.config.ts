import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    // Use shared sources directly in dev and build; no separate build step needed.
    alias: { "@l2n/shared": new URL("../shared/src/index.ts", import.meta.url).pathname },
  },
  server: {
    proxy: { "/api": "http://localhost:3000", "/health": "http://localhost:3000" },
  },
});
