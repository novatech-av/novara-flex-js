import { describe, expect, it } from "vitest";
import type { NovaraFlexMethod } from "../client.js";
import {
  NovaraFlexApiError,
  NovaraFlexRateLimitError,
  NovaraFlexTransportError,
  type NovaraFlexTransportErrorReason,
} from "../errors.js";
import {
  backoffDelayMs,
  DEFAULT_RETRY_SETTINGS,
  isIdempotentMethod,
  isRetryableError,
  MAX_RATE_LIMIT_RETRIES,
  MAX_RETRY_AFTER_MS,
  parseRetryAfter,
  rateLimitCooldownMs,
  rateLimitRetryDelayMs,
  resolveRetrySettings,
  retryDelayMs,
} from "./retry.js";

/**
 * Whether every method in the contract is retried by default. Typed as a
 * `Record` over the contract's method names, so a method the vendor adds
 * fails to compile here until someone decides whether it is safe to repeat.
 *
 * Only one is not: `dataload.create`, the SDK's one write, which may already
 * have been applied when an attempt fails. `attachment.load`, a file
 * download, is a read like the rest and is allowed by its `.load` suffix.
 */
const DEFAULT_IDEMPOTENCY: Record<NovaraFlexMethod, boolean> = {
  "account.info": true,
  "acknowledgments.info": true,
  "acknowledgments.list": true,
  "api.echo": true,
  "api.ping": true,
  "attachment.load": true,
  "companies.list": true,
  "completedtrainings.v2.list": true,
  "contractor-contacts.list": true,
  "contractor-requirement.info": true,
  "contractor-requirements.list": true,
  "contractors.list": true,
  "datalistitems.list": true,
  "datalists.list": true,
  "dataload.create": false,
  "dataload.info": true,
  "driver-qualifications.list": true,
  "equipments.list": true,
  "equipmenttypes.list": true,
  "establishments.info": true,
  "establishments.list": true,
  "fieldoffices.list": true,
  "followups.list": true,
  "formfolders.list": true,
  "forms.info": true,
  "forms.list": true,
  "grouptrainings.list": true,
  "inspections.list": true,
  "jobtitles.list": true,
  "linesofbusiness.list": true,
  "osha-hours.list": true,
  "projects.info": true,
  "projects.list": true,
  "resources.list": true,
  "resourcetags.list": true,
  "responses.flat": true,
  "responses.info": true,
  "responses.list": true,
  "roles.list": true,
  "training-employee-status.list": true,
  "trainings.v2.list": true,
  "users.info": true,
  "users.list": true,
};

describe("isIdempotentMethod", () => {
  for (const [method, expected] of Object.entries(DEFAULT_IDEMPOTENCY)) {
    it(`${expected ? "retries" : "does not retry"} ${method}`, () => {
      expect(isIdempotentMethod(method)).toBe(expected);
    });
  }

  it("denies names the SDK does not know", () => {
    for (const method of [
      "foo.create",
      "foo.update",
      "foo.delete",
      "x",
      "",
      "list",
      "users.listing",
      "users.list.create",
      "attachment.loader",
      "load",
    ]) {
      expect(isIdempotentMethod(method), method).toBe(false);
    }
  });
});

describe("isRetryableError", () => {
  const transport = (
    reason: NovaraFlexTransportErrorReason,
    status?: number,
  ): NovaraFlexTransportError =>
    new NovaraFlexTransportError("x", { method: "api.ping", reason, status });

  it("retries a timeout and a network failure", () => {
    expect(isRetryableError(transport("timeout"))).toBe(true);
    expect(isRetryableError(transport("network"))).toBe(true);
    expect(isRetryableError(transport("network", 200))).toBe(true);
  });

  it("retries every HTTP 5xx, and no other status", () => {
    for (const status of [500, 502, 503, 504, 599]) {
      expect(
        isRetryableError(transport("http_status", status)),
        `${status}`,
      ).toBe(true);
    }
    // A 429 never reaches here as a transport error; the client raises a
    // NovaraFlexRateLimitError for it instead.
    for (const status of [301, 400, 401, 403, 404, 408, 428, 429, 430, 600]) {
      expect(
        isRetryableError(transport("http_status", status)),
        `${status}`,
      ).toBe(false);
    }
    expect(isRetryableError(transport("http_status"))).toBe(false);
  });

  it("never retries a malformed body", () => {
    expect(isRetryableError(transport("invalid_json", 200))).toBe(false);
    expect(isRetryableError(transport("invalid_envelope", 200))).toBe(false);
  });

  it("never retries an unexpected content type", () => {
    expect(isRetryableError(transport("content_type", 200))).toBe(false);
  });

  it("retries a rate-limit error, whichever way it arrived", () => {
    for (const status of [200, 429]) {
      expect(
        isRetryableError(
          new NovaraFlexRateLimitError({ method: "api.ping", status }),
        ),
      ).toBe(true);
    }
  });

  it("retries only server_error among the other API codes", () => {
    const api = (code: string) =>
      new NovaraFlexApiError({ method: "api.ping", code });
    expect(isRetryableError(api("server_error"))).toBe(true);
    for (const code of [
      "token_invalid",
      "token_expired",
      "token_revoked",
      "account_inactive",
      "parameter_missing",
      "parameter_invalid",
      "request_invalid",
      "request_too_large",
      "api_method_not_found",
      "content_not_found",
      "some_future_code",
      // Only the client's own NovaraFlexRateLimitError carries a rate limit.
      "rate_limit_exceeded",
    ]) {
      expect(isRetryableError(api(code)), code).toBe(false);
    }
  });

  it("never retries an abort, a TypeError, or anything else", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isRetryableError(abort)).toBe(false);
    expect(isRetryableError(new DOMException("aborted", "AbortError"))).toBe(
      false,
    );
    expect(isRetryableError(new TypeError("bad option"))).toBe(false);
    expect(isRetryableError("server_error")).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe("backoffDelayMs", () => {
  const settings = {
    maxRetries: 5,
    baseDelayMs: 500,
    maxDelayMs: 3_000,
    rateLimitDelayMs: 60_000,
  };

  it("doubles the ceiling per retry up to maxDelayMs", () => {
    const top = () => 1;
    expect(backoffDelayMs(1, settings, top)).toBe(500);
    expect(backoffDelayMs(2, settings, top)).toBe(1_000);
    expect(backoffDelayMs(3, settings, top)).toBe(2_000);
    expect(backoffDelayMs(4, settings, top)).toBe(3_000);
    expect(backoffDelayMs(10, settings, top)).toBe(3_000);
  });

  it("applies full jitter from 0 up to the ceiling", () => {
    expect(backoffDelayMs(3, settings, () => 0)).toBe(0);
    expect(backoffDelayMs(3, settings, () => 0.25)).toBe(500);
  });

  it("stays within bounds with the real Math.random", () => {
    for (let retry = 1; retry <= 10; retry++) {
      const ceiling = Math.min(3_000, 500 * 2 ** (retry - 1));
      for (let i = 0; i < 50; i++) {
        const delay = backoffDelayMs(retry, settings);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThan(ceiling);
      }
    }
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");

  it("reads delta-seconds", () => {
    expect(parseRetryAfter("0", now)).toBe(0);
    expect(parseRetryAfter("3", now)).toBe(3_000);
    expect(parseRetryAfter(" 120 ", now)).toBe(120_000);
  });

  it("reads an HTTP-date relative to now", () => {
    expect(parseRetryAfter("Tue, 29 Sep 2026 12:00:05 GMT", now)).toBe(5_000);
    expect(parseRetryAfter("Tuesday, 29-Sep-26 12:00:05 GMT", now)).toBe(5_000);
  });

  it("treats an HTTP-date in the past as no wait", () => {
    expect(parseRetryAfter("Mon, 28 Sep 2026 12:00:00 GMT", now)).toBe(0);
  });

  it("ignores a missing or unparseable value", () => {
    for (const value of [
      null,
      undefined,
      "",
      "  ",
      "soon",
      "-5",
      "1.5",
      "3s",
      "Tue, 99 Foo 2026",
      "garbage 2026",
    ]) {
      expect(parseRetryAfter(value, now), String(value)).toBeUndefined();
    }
  });
});

describe("retryDelayMs", () => {
  const top = () => 1;

  it("uses the jittered backoff without a Retry-After", () => {
    expect(retryDelayMs(2, DEFAULT_RETRY_SETTINGS, null, top)).toBe(1_000);
    expect(retryDelayMs(2, DEFAULT_RETRY_SETTINGS, "soon", top)).toBe(1_000);
  });

  it("uses Retry-After instead of the backoff, up to 60 s", () => {
    expect(retryDelayMs(1, DEFAULT_RETRY_SETTINGS, "7", top)).toBe(7_000);
    expect(retryDelayMs(1, DEFAULT_RETRY_SETTINGS, "0", top)).toBe(0);
    expect(retryDelayMs(1, DEFAULT_RETRY_SETTINGS, "60", top)).toBe(
      MAX_RETRY_AFTER_MS,
    );
  });

  it("gives up on a Retry-After over 60 s", () => {
    expect(retryDelayMs(1, DEFAULT_RETRY_SETTINGS, "61", top)).toBeUndefined();
    const now = Date.parse("2026-09-29T12:00:00Z");
    expect(
      retryDelayMs(
        1,
        DEFAULT_RETRY_SETTINGS,
        "Tue, 29 Sep 2026 12:05:00 GMT",
        top,
        now,
      ),
    ).toBeUndefined();
  });
});

describe("rateLimitRetryDelayMs", () => {
  const settings = DEFAULT_RETRY_SETTINGS;

  it("waits the 60 s penalty window plus up to 5 s of jitter by default", () => {
    expect(rateLimitRetryDelayMs(undefined, 0, settings, () => 0)).toBe(60_000);
    expect(rateLimitRetryDelayMs(undefined, 0, settings, () => 0.5)).toBe(
      62_500,
    );
    expect(rateLimitRetryDelayMs(undefined, 0, settings, () => 1)).toBe(65_000);
    for (let i = 0; i < 50; i++) {
      const delay = rateLimitRetryDelayMs(undefined, 0, settings) as number;
      expect(delay).toBeGreaterThanOrEqual(60_000);
      expect(delay).toBeLessThan(65_000);
    }
  });

  it("bounds the jitter at 10 % of rateLimitDelayMs", () => {
    const short = { ...settings, rateLimitDelayMs: 2_000 };
    expect(rateLimitRetryDelayMs(undefined, 0, short, () => 1)).toBe(2_200);
    const off = { ...settings, rateLimitDelayMs: 0 };
    expect(rateLimitRetryDelayMs(undefined, 0, off, () => 1)).toBe(0);
    const long = { ...settings, rateLimitDelayMs: 300_000 };
    expect(rateLimitRetryDelayMs(undefined, 0, long, () => 1)).toBe(305_000);
  });

  it("prefers a Retry-After, with no jitter, up to 60 s", () => {
    const top = () => 1;
    expect(rateLimitRetryDelayMs(5_000, 0, settings, top)).toBe(5_000);
    expect(rateLimitRetryDelayMs(0, 0, settings, top)).toBe(0);
    expect(rateLimitRetryDelayMs(60_000, 0, settings, top)).toBe(60_000);
    expect(rateLimitRetryDelayMs(60_001, 0, settings, top)).toBeUndefined();
  });

  it("raises the Retry-After cap to rateLimitDelayMs, never below 60 s", () => {
    const long = { ...settings, rateLimitDelayMs: 120_000 };
    expect(rateLimitRetryDelayMs(120_000, 0, long)).toBe(120_000);
    expect(rateLimitRetryDelayMs(120_001, 0, long)).toBeUndefined();
    const short = { ...settings, rateLimitDelayMs: 1_000 };
    expect(rateLimitRetryDelayMs(MAX_RETRY_AFTER_MS, 0, short)).toBe(
      MAX_RETRY_AFTER_MS,
    );
    expect(
      rateLimitRetryDelayMs(MAX_RETRY_AFTER_MS + 1, 0, short),
    ).toBeUndefined();
  });

  it("allows only one rate-limit retry per call", () => {
    expect(MAX_RATE_LIMIT_RETRIES).toBe(1);
    expect(rateLimitRetryDelayMs(undefined, 1, settings)).toBeUndefined();
    expect(rateLimitRetryDelayMs(1_000, 1, settings)).toBeUndefined();
    expect(rateLimitRetryDelayMs(0, 2, settings)).toBeUndefined();
  });
});

describe("rateLimitCooldownMs", () => {
  it("is the Retry-After when present, else rateLimitDelayMs", () => {
    expect(rateLimitCooldownMs(undefined, DEFAULT_RETRY_SETTINGS)).toBe(60_000);
    expect(rateLimitCooldownMs(5_000, DEFAULT_RETRY_SETTINGS)).toBe(5_000);
    expect(
      rateLimitCooldownMs(undefined, {
        ...DEFAULT_RETRY_SETTINGS,
        rateLimitDelayMs: 0,
      }),
    ).toBe(0);
  });

  it("does not cap a long Retry-After, bar what setTimeout can honour", () => {
    expect(rateLimitCooldownMs(600_000, DEFAULT_RETRY_SETTINGS)).toBe(600_000);
    expect(rateLimitCooldownMs(1e15, DEFAULT_RETRY_SETTINGS)).toBe(
      2_147_483_647,
    );
  });
});

describe("resolveRetrySettings", () => {
  it("defaults to 2 retries from 500 ms, capped at 10 s, and a 60 s rate-limit wait", () => {
    expect(DEFAULT_RETRY_SETTINGS).toEqual({
      maxRetries: 2,
      baseDelayMs: 500,
      maxDelayMs: 10_000,
      rateLimitDelayMs: 60_000,
    });
    expect(resolveRetrySettings(DEFAULT_RETRY_SETTINGS, undefined, "X")).toBe(
      DEFAULT_RETRY_SETTINGS,
    );
  });

  it("overrides field by field and ignores idempotent", () => {
    expect(
      resolveRetrySettings(
        DEFAULT_RETRY_SETTINGS,
        { baseDelayMs: 0, idempotent: true },
        "X",
      ),
    ).toEqual({
      maxRetries: 2,
      baseDelayMs: 0,
      maxDelayMs: 10_000,
      rateLimitDelayMs: 60_000,
    });
    expect(
      resolveRetrySettings(
        DEFAULT_RETRY_SETTINGS,
        { rateLimitDelayMs: 5_000 },
        "X",
      ).rateLimitDelayMs,
    ).toBe(5_000);
  });

  it("validates rateLimitDelayMs like the other delays", () => {
    for (const value of [0, 2_147_483_647]) {
      expect(
        resolveRetrySettings(
          DEFAULT_RETRY_SETTINGS,
          { rateLimitDelayMs: value },
          "X",
        ).rateLimitDelayMs,
      ).toBe(value);
    }
    for (const value of [
      -1,
      2_147_483_648,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "60000",
    ]) {
      expect(
        () =>
          resolveRetrySettings(
            DEFAULT_RETRY_SETTINGS,
            { rateLimitDelayMs: value },
            "Here ",
          ),
        String(value),
      ).toThrow(
        /^Here retry\.rateLimitDelayMs must be a finite number of milliseconds from 0 to 2147483647/,
      );
    }
  });

  it("prefixes its TypeError with where the option came from", () => {
    expect(() =>
      resolveRetrySettings(DEFAULT_RETRY_SETTINGS, { maxRetries: 11 }, "Here."),
    ).toThrow(/^Here\.retry\.maxRetries must be an integer from 0 to 10/);
  });
});
