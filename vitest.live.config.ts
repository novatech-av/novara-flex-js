import { defineConfig } from "vitest/config";

/**
 * Live API test configuration: `pnpm test:live`.
 *
 * These tests talk to the real Novara Flex API and are opt-in — they need a
 * token in `.env` (see `.env.example`). They are deliberately excluded from
 * `pnpm test` and `pnpm check`, which stay fully offline.
 *
 * Files run serially: the vendor shares one rate-limit pool across all tokens
 * for a customer, so parallel request bursts are a bad idea. The tests also
 * throttle their own client to 40 requests a minute and fail if they ever
 * observe a rate limit, so a run takes about a minute or longer by design.
 *
 * The per-test timeout is generous on purpose. The upstream stalls: a request
 * that normally answers in well under a second can take half a minute, and on
 * 2026-09-20 ordinary calls — `api.echo` included — measured 25-38 s for a
 * whole run, which failed a different random handful of tests every time at
 * 30 s for reasons that had nothing to do with the SDK. The bound is here to
 * stop a test wedging the suite, not to assert vendor latency. The SDK's own
 * 60 s default request timeout now bounds any single hung request; this stays
 * at 120 s because some tests chain several calls.
 */
export default defineConfig({
  test: {
    include: ["test/live/**/*.test.ts"],
    globalSetup: ["test/live/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
