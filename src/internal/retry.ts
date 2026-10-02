/**
 * The retry policy: which methods may be repeated, which failures are worth
 * repeating, and how long to wait in between.
 *
 * Everything here is pure (randomness and the clock are injectable) so the
 * rules stay unit-testable; the loop that applies them, and the sleep between
 * attempts, live in `NovaraFlexClient.call`.
 *
 * Nothing here is public API.
 */

import {
  NovaraFlexApiError,
  NovaraFlexRateLimitError,
  NovaraFlexTransportError,
} from "../errors.js";

/** The retry settings in force for one call, after defaults and overrides. */
export interface RetrySettings {
  /** Extra attempts after the first. */
  readonly maxRetries: number;
  /** Backoff base in milliseconds. */
  readonly baseDelayMs: number;
  /** Backoff cap in milliseconds. */
  readonly maxDelayMs: number;
  /** The wait before the one rate-limit retry when there is no `Retry-After`. */
  readonly rateLimitDelayMs: number;
}

/** The settings a client starts from before any option is applied. */
export const DEFAULT_RETRY_SETTINGS: RetrySettings = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  rateLimitDelayMs: 60_000,
};

/** The most retries a caller may ask for. */
export const MAX_RETRIES = 10;

/** The longest delay `setTimeout` accepts: 2^31 - 1 ms, about 24.8 days. */
export const MAX_DELAY_MS = 2_147_483_647;

/**
 * The longest `Retry-After` the SDK will wait out. The vendor documents about
 * 60 s of errors after a rate-limit violation; anything longer is reported to
 * the caller instead of sleeping for minutes. A rate limit's own cap is the
 * larger of this and the call's `rateLimitDelayMs`.
 */
export const MAX_RETRY_AFTER_MS = 60_000;

/** How many rate-limit retries one call may make. */
export const MAX_RATE_LIMIT_RETRIES = 1;

/** The most jitter added to a rate-limit wait that has no `Retry-After`. */
const MAX_RATE_LIMIT_JITTER_MS = 5_000;

/** Method-name suffixes of the read-only methods that are safe to repeat. */
const IDEMPOTENT_SUFFIXES = [
  ".list",
  ".info",
  ".ping",
  ".echo",
  ".flat",
  ".load",
];

/**
 * `true` when `method` is a read that is safe to repeat after a failure.
 *
 * Every Novara Flex method is a `POST`, so idempotency cannot come from the
 * HTTP verb. This is a default-deny allowlist instead: only names ending in
 * `.list`, `.info`, `.ping`, `.echo`, `.flat`, or `.load` (the attachment
 * download) qualify. Anything else —
 * `dataload.create`, any write the vendor adds later, any name passed to
 * `call` that the SDK does not know — is not retried unless the call asserts
 * `retry: { idempotent: true }`. A failed write may already have been applied
 * on the server (after a timeout, a dropped connection, or a 5xx), and the
 * vendor offers no idempotency key, so the SDK cannot safely repeat one.
 */
export function isIdempotentMethod(method: string): boolean {
  return IDEMPOTENT_SUFFIXES.some((suffix) => method.endsWith(suffix));
}

/**
 * `true` when `error` is a transient failure worth another attempt: a timeout,
 * a network failure, an HTTP 5xx, a `server_error` envelope, or a
 * {@link NovaraFlexRateLimitError} (HTTP 429 or a `rate_limit_exceeded`
 * envelope), whose wait {@link rateLimitRetryDelayMs} decides. Everything else
 * — every other API code, any other status, a malformed body, an abort, a
 * validation `TypeError` — would fail the same way again and is not retried.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof NovaraFlexTransportError) {
    switch (error.reason) {
      case "timeout":
      case "network":
        return true;
      case "http_status":
        return (
          error.status !== undefined &&
          error.status >= 500 &&
          error.status <= 599
        );
      default:
        return false;
    }
  }
  if (error instanceof NovaraFlexRateLimitError) return true;
  if (error instanceof NovaraFlexApiError) {
    return error.code === "server_error";
  }
  return false;
}

/**
 * The full-jitter backoff before retry number `retry` (1-based): a uniformly
 * random delay below `min(maxDelayMs, baseDelayMs * 2 ** (retry - 1))`.
 */
export function backoffDelayMs(
  retry: number,
  settings: RetrySettings,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(
    settings.maxDelayMs,
    settings.baseDelayMs * 2 ** (retry - 1),
  );
  return random() * ceiling;
}

const HTTP_DATE_MONTH =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
const HTTP_DATE_TIME = /\b\d{2}:\d{2}:\d{2}\b/;

/**
 * Parse a `Retry-After` header into a delay in milliseconds, or `undefined`
 * when there is none or it cannot be understood. Delta-seconds (a
 * non-negative integer) and an HTTP-date are both accepted; a date in the
 * past means no wait at all.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  // `Date.parse` is lenient, so insist on the shape of an HTTP-date first.
  if (!HTTP_DATE_MONTH.test(text) || !HTTP_DATE_TIME.test(text)) {
    return undefined;
  }
  const date = Date.parse(text);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

/**
 * How long to wait before retry number `retry` (1-based), or `undefined` when
 * the server asked for a wait longer than {@link MAX_RETRY_AFTER_MS} and the
 * failure should be reported instead. A parseable `Retry-After` wins over the
 * jittered backoff.
 */
export function retryDelayMs(
  retry: number,
  settings: RetrySettings,
  retryAfter: string | null | undefined,
  random: () => number = Math.random,
  now: number = Date.now(),
): number | undefined {
  const requested = parseRetryAfter(retryAfter, now);
  if (requested === undefined) return backoffDelayMs(retry, settings, random);
  return requested > MAX_RETRY_AFTER_MS ? undefined : requested;
}

/**
 * How long to wait before retrying a rate-limited call, or `undefined` when it
 * must be thrown instead. `rateLimitRetries` is how many rate-limit retries
 * the call has already made: only {@link MAX_RATE_LIMIT_RETRIES} are allowed,
 * because a second limit in a row means waiting again would not help.
 *
 * A `Retry-After` wins when it is no longer than the larger of
 * {@link MAX_RETRY_AFTER_MS} and `rateLimitDelayMs`; a longer one is thrown at
 * once. Without one the call waits out the vendor's documented penalty window,
 * `rateLimitDelayMs` (60 s by default), plus up to 10 % of it (at most 5 s) of
 * jitter so that concurrent waiters do not all resume together.
 */
export function rateLimitRetryDelayMs(
  retryAfterMs: number | undefined,
  rateLimitRetries: number,
  settings: RetrySettings,
  random: () => number = Math.random,
): number | undefined {
  if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) return undefined;
  if (retryAfterMs !== undefined) {
    const cap = Math.max(MAX_RETRY_AFTER_MS, settings.rateLimitDelayMs);
    return retryAfterMs > cap ? undefined : retryAfterMs;
  }
  const jitter = Math.min(
    MAX_RATE_LIMIT_JITTER_MS,
    settings.rateLimitDelayMs * 0.1,
  );
  return settings.rateLimitDelayMs + random() * jitter;
}

/**
 * How long a rate limit pauses every call on the client: the `Retry-After`
 * when there is one (uncapped, bar what `setTimeout` can honour), otherwise
 * the call's `rateLimitDelayMs`. `0` means no pause.
 */
export function rateLimitCooldownMs(
  retryAfterMs: number | undefined,
  settings: RetrySettings,
): number {
  return retryAfterMs === undefined
    ? settings.rateLimitDelayMs
    : Math.min(retryAfterMs, MAX_DELAY_MS);
}

/** `true` for a finite delay `setTimeout` can honour, `0` included. */
function isValidDelay(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_DELAY_MS
  );
}

/**
 * Validate a `retry` option and lay its fields over `base`, one by one.
 * `prefix` starts the `TypeError` message and ends with its separator, e.g.
 * `"NovaraFlexClient "` or `"NovaraFlexCallOptions."`. Only the four settings
 * are read: an `idempotent` field is the caller's concern.
 */
export function resolveRetrySettings(
  base: RetrySettings,
  options: unknown,
  prefix: string,
): RetrySettings {
  if (options === undefined) return base;
  if (typeof options !== "object" || options === null) {
    throw new TypeError(`${prefix}retry must be an object`);
  }
  const { maxRetries, baseDelayMs, maxDelayMs, rateLimitDelayMs } =
    options as Record<string, unknown>;
  if (
    maxRetries !== undefined &&
    !(
      Number.isInteger(maxRetries) &&
      (maxRetries as number) >= 0 &&
      (maxRetries as number) <= MAX_RETRIES
    )
  ) {
    throw new TypeError(
      `${prefix}retry.maxRetries must be an integer from 0 to ${MAX_RETRIES}; use 0 to disable retries`,
    );
  }
  for (const [name, value] of [
    ["baseDelayMs", baseDelayMs],
    ["maxDelayMs", maxDelayMs],
    ["rateLimitDelayMs", rateLimitDelayMs],
  ] as const) {
    if (value !== undefined && !isValidDelay(value)) {
      throw new TypeError(
        `${prefix}retry.${name} must be a finite number of milliseconds from 0 to ${MAX_DELAY_MS}`,
      );
    }
  }
  return {
    maxRetries: (maxRetries as number | undefined) ?? base.maxRetries,
    baseDelayMs: (baseDelayMs as number | undefined) ?? base.baseDelayMs,
    maxDelayMs: (maxDelayMs as number | undefined) ?? base.maxDelayMs,
    rateLimitDelayMs:
      (rateLimitDelayMs as number | undefined) ?? base.rateLimitDelayMs,
  };
}
