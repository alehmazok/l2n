import { defineConfig } from "vitest/config";

// Own config so `pnpm test` here doesn't pick up the root (coverage) config.
export default defineConfig({});
