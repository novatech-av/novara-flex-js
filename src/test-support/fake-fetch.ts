/**
 * Shared transport fakes for the offline unit tests.
 *
 * Every resource test needs the same three things: a `fetch` that records what
 * it was called with, a way to build the `HTTP 200` JSON envelope Novara Flex
 * always answers with, and a client wired to both. They live here so that one
 * test file per API area does not mean one copy of this plumbing per API area.
 *
 * This module is test-only. It sits under `src/` so the colocated `*.test.ts`
 * files can import it with a relative path and so `tsconfig.json` type-checks
 * it, but `tsconfig.build.json` excludes `src/test-support/**`, so it never
 * reaches `dist/`. Nothing under `src/` other than a `*.test.ts` file may
 * import it.
 */

import { NovaraFlexClient } from "../client.js";

/** A token unlikely to appear anywhere by accident, so leaks are detectable. */
export const TOKEN = "tok_SUPER_SECRET_c0ffee_do_not_leak";

/** The base URL the fake clients are pointed at. */
export const BASE_URL = "https://example.test/v1";

/** One recorded request. */
export interface Capture {
  url: string;
  init: RequestInit | undefined;
}

/** How a fake transport answers a recorded request. */
export type Responder = (capture: Capture) => Response | Promise<Response>;

/** A fake `fetch` that records its arguments and replays canned responses. */
export function fakeFetch(respond: Responder): {
  fetch: typeof globalThis.fetch;
  calls: Capture[];
} {
  const calls: Capture[] = [];
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const capture: Capture = { url: String(input), init };
    calls.push(capture);
    return await respond(capture);
  };
  return { fetch: fetchImpl, calls };
}

/**
 * A promise that settles once `signal` aborts, rejecting with its reason —
 * what real `fetch` does with `init.signal`. It never settles without a
 * signal, so it models a request the server never answers.
 */
export function untilAborted(
  signal: AbortSignal | null | undefined,
): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

/** A responder whose request never answers until `init.signal` aborts. */
export const hang: Responder = ({ init }) => untilAborted(init?.signal);

/**
 * A `200` response whose headers have arrived but whose body never finishes.
 * Real `fetch` wires `init.signal` to the body stream; a fake has to do it by
 * hand, so the body errors with the signal's reason once `signal` aborts.
 */
export function stalledBodyResponse(
  signal: AbortSignal | null | undefined,
  headers?: Record<string, string>,
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      untilAborted(signal).catch((reason: unknown) => controller.error(reason));
    },
  });
  return new Response(body, { status: 200, ...(headers ? { headers } : {}) });
}

/** Build an `HTTP 200` JSON response the way Novara Flex does. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The parsed JSON body of a captured request. */
export function bodyOf(capture: Capture | undefined): Record<string, unknown> {
  return JSON.parse(String(capture?.init?.body));
}

/**
 * A client wired to a fake transport, with the captured requests.
 *
 * Its timeout is disabled so that a caller's `AbortSignal` reaches `fetch`
 * as-is, which is how the resource tests prove their options are forwarded to
 * `call`, its retries are disabled so that every call makes exactly one
 * request, and its `rateLimitDelayMs` is `0` so that a rate-limit error in one
 * test starts no client-wide cooldown before the next call. The timeout,
 * retries, and rate-limit handling themselves are covered in
 * `client.test.ts`; a test that needs the default retry policy builds its own
 * client.
 */
export function createClient(respond: Responder): {
  client: NovaraFlexClient;
  calls: Capture[];
} {
  const { fetch, calls } = fakeFetch(respond);
  return {
    client: new NovaraFlexClient({
      token: TOKEN,
      fetch,
      baseUrl: BASE_URL,
      timeoutMs: 0,
      retry: { maxRetries: 0, rateLimitDelayMs: 0 },
    }),
    calls,
  };
}
