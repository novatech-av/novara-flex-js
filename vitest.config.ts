import { defineConfig } from "vitest/config";

/**
 * Unit test configuration: the default `pnpm test` run.
 *
 * `include` is pinned to the colocated test files under `src/` so the opt-in
 * live API suite under `test/live` can never be picked up by accident. That
 * suite has its own config (`vitest.live.config.ts`) and its own script.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
