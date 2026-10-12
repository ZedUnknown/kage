import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Each file boots an in-process Postgres, which can be slow on first run.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
