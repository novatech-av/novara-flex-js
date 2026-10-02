import { describe, expect, expectTypeOf, it } from "vitest";
import {
  NovaraFlexApiError,
  NovaraFlexError,
  NovaraFlexRateLimitError,
  type NovaraFlexRateLimitErrorOptions,
  NovaraFlexTransportError,
  type NovaraFlexTransportErrorOptions,
  type NovaraFlexTransportErrorReason,
} from "./errors.js";

describe("NovaraFlexError", () => {
  it("is an Error with its own name", () => {
    const err = new NovaraFlexError("boom");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("NovaraFlexError");
    expect(err.message).toBe("boom");
    expect(String(err)).toBe("NovaraFlexError: boom");
  });

  it("carries a cause", () => {
    const cause = new Error("root");
    expect(new NovaraFlexError("boom", { cause }).cause).toBe(cause);
  });
});

describe("NovaraFlexApiError", () => {
  it("formats a message from the method, code, and description", () => {
    const err = new NovaraFlexApiError({
      method: "users.list",
      code: "token_invalid",
      description: "The token is not valid.",
      requestId: "abc123",
    });
    expect(err.message).toBe(
      "Novara Flex users.list failed: token_invalid (The token is not valid.)",
    );
    expect(err.name).toBe("NovaraFlexApiError");
    expect(err.code).toBe("token_invalid");
    expect(err.description).toBe("The token is not valid.");
    expect(err.method).toBe("users.list");
    expect(err.requestId).toBe("abc123");
  });

  it("omits the parenthetical when there is no description", () => {
    const err = new NovaraFlexApiError({
      method: "api.ping",
      code: "server_error",
    });
    expect(err.message).toBe("Novara Flex api.ping failed: server_error");
    expect(err.description).toBeUndefined();
    expect(err.requestId).toBeUndefined();
  });

  it("accepts an undocumented error code", () => {
    expect(
      new NovaraFlexApiError({ method: "api.ping", code: "invalid_token" })
        .code,
    ).toBe("invalid_token");
  });

  it("sits on the SDK error prototype chain", () => {
    const err = new NovaraFlexApiError({ method: "api.ping", code: "x" });
    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err).toBeInstanceOf(NovaraFlexError);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NovaraFlexTransportError);
  });
});

describe("NovaraFlexTransportError", () => {
  it("records the method, status, and request id", () => {
    const err = new NovaraFlexTransportError(
      "Novara Flex api.ping: responded with HTTP 503",
      {
        method: "api.ping",
        reason: "http_status",
        status: 503,
        requestId: "req-1",
      },
    );
    expect(err.name).toBe("NovaraFlexTransportError");
    expect(err.method).toBe("api.ping");
    expect(err.reason).toBe("http_status");
    expect(err.status).toBe(503);
    expect(err.requestId).toBe("req-1");
    expect(err.cause).toBeUndefined();
  });

  it("wires the underlying failure through cause", () => {
    const cause = new TypeError("fetch failed");
    const err = new NovaraFlexTransportError(
      "Novara Flex api.ping: network request failed",
      { method: "api.ping", reason: "network", cause },
    );
    expect(err.cause).toBe(cause);
    expect(err.reason).toBe("network");
    expect(err.status).toBeUndefined();
    expect(err.requestId).toBeUndefined();
  });

  it("sits on the SDK error prototype chain", () => {
    const err = new NovaraFlexTransportError("boom", {
      method: "api.ping",
      reason: "invalid_envelope",
    });
    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err).toBeInstanceOf(NovaraFlexError);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NovaraFlexApiError);
  });

  it("requires a reason from the closed set", () => {
    expectTypeOf<
      NovaraFlexTransportErrorOptions["reason"]
    >().toEqualTypeOf<NovaraFlexTransportErrorReason>();
    expectTypeOf<NovaraFlexTransportErrorReason>().toEqualTypeOf<
      | "timeout"
      | "network"
      | "http_status"
      | "invalid_json"
      | "invalid_envelope"
      | "content_type"
    >();
    expectTypeOf<
      NovaraFlexTransportError["reason"]
    >().toEqualTypeOf<NovaraFlexTransportErrorReason>();
    // @ts-expect-error `reason` is required
    void new NovaraFlexTransportError("boom", { method: "api.ping" });
    void new NovaraFlexTransportError("boom", {
      method: "api.ping",
      // @ts-expect-error `reason` is not an arbitrary string
      reason: "bogus",
    });
  });
});

describe("attempts", () => {
  it("defaults to 1 on both error classes", () => {
    expect(
      new NovaraFlexApiError({ method: "api.ping", code: "server_error" })
        .attempts,
    ).toBe(1);
    expect(
      new NovaraFlexTransportError("x", {
        method: "api.ping",
        reason: "network",
      }).attempts,
    ).toBe(1);
  });

  it("is set from the constructor option without changing the message", () => {
    const api = new NovaraFlexApiError({
      method: "api.ping",
      code: "server_error",
      attempts: 3,
    });
    expect(api.attempts).toBe(3);
    expect(api.message).toBe("Novara Flex api.ping failed: server_error");

    const cause = new Error("root");
    const transport = new NovaraFlexTransportError("boom", {
      method: "api.ping",
      reason: "timeout",
      attempts: 2,
      cause,
    });
    expect(transport.attempts).toBe(2);
    expect(transport.message).toBe("boom");
    expect(transport.cause).toBe(cause);
  });
});

describe("NovaraFlexRateLimitError", () => {
  it("is an API error with a fixed code and its own name", () => {
    const err = new NovaraFlexRateLimitError({
      method: "projects.list",
      status: 200,
    });
    expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err).toBeInstanceOf(NovaraFlexError);
    expect(err).toBeInstanceOf(Error);
    expect(Object.getPrototypeOf(NovaraFlexRateLimitError)).toBe(
      NovaraFlexApiError,
    );
    expect(err.name).toBe("NovaraFlexRateLimitError");
    expect(err.code).toBe("rate_limit_exceeded");
    expect(err.method).toBe("projects.list");
  });

  it("defaults retryAfterMs, description, requestId, and attempts", () => {
    const err = new NovaraFlexRateLimitError({
      method: "api.ping",
      status: 200,
    });
    expect(err.status).toBe(200);
    expect(err.retryAfterMs).toBeUndefined();
    expect(err.description).toBeUndefined();
    expect(err.requestId).toBeUndefined();
    expect(err.attempts).toBe(1);
    expect(err.message).toBe(
      "Novara Flex api.ping failed: rate_limit_exceeded",
    );
  });

  it("formats the envelope's description like any API error", () => {
    const err = new NovaraFlexRateLimitError({
      method: "api.ping",
      status: 200,
      description: "Too many requests",
      requestId: "req-1",
      retryAfterMs: 5_000,
      attempts: 2,
    });
    expect(err.message).toBe(
      "Novara Flex api.ping failed: rate_limit_exceeded (Too many requests)",
    );
    expect(err.requestId).toBe("req-1");
    expect(err.retryAfterMs).toBe(5_000);
    expect(err.attempts).toBe(2);
  });

  it("names the HTTP status when the limit came as a 429", () => {
    const err = new NovaraFlexRateLimitError({
      method: "users.list",
      status: 429,
    });
    expect(err.status).toBe(429);
    expect(err.message).toBe(
      "Novara Flex users.list failed: rate_limit_exceeded (HTTP 429)",
    );
  });

  it("types code as the one literal and requires a status", () => {
    const err = new NovaraFlexRateLimitError({ method: "x", status: 429 });
    expectTypeOf(err.code).toEqualTypeOf<"rate_limit_exceeded">();
    expectTypeOf(err.retryAfterMs).toEqualTypeOf<number | undefined>();
    expectTypeOf<NovaraFlexRateLimitErrorOptions>().not.toHaveProperty("code");
    // @ts-expect-error status is required
    void new NovaraFlexRateLimitError({ method: "x" });
  });
});
