/**
 * Error types raised by the SDK.
 *
 * Every failure surfaces as a {@link NovaraFlexError}. The two subclasses split
 * the two kinds of failure a caller cares about: {@link NovaraFlexApiError} is
 * an application-level rejection that Novara Flex reported inside an otherwise
 * successful `HTTP 200` response, while {@link NovaraFlexTransportError} covers
 * everything that never produced a well-formed Novara Flex envelope.
 * {@link NovaraFlexRateLimitError} narrows the API error to the one failure a
 * caller must react to differently: the vendor's rate limit, however it was
 * signalled.
 *
 * The API token is never included in an error message or property.
 */

import type { NovaraApiError } from "./internal/contract.js";

/** An application-level Novara Flex error code. */
export type NovaraFlexApiErrorCode = NovaraApiError["error"];

/** Base class for every error raised by this SDK. */
export class NovaraFlexError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NovaraFlexError";
  }
}

/** Options accepted by the {@link NovaraFlexApiError} constructor. */
export interface NovaraFlexApiErrorOptions {
  /** The method that was called, without a leading slash. */
  method: string;
  /** The `error` code from the response envelope. */
  code: string;
  /** The human-readable `description` from the response envelope, if any. */
  description?: string | undefined;
  /** The `HZS-Request-ID` response header, if the server sent one. */
  requestId?: string | undefined;
  /**
   * Which attempt produced this failure, counting from 1. The error a call
   * throws is always its last failure, so this is the number of attempts the
   * call made. Defaults to `1`.
   */
  attempts?: number | undefined;
}

/**
 * A rejection reported by Novara Flex itself: `HTTP 200` with `ok: false`.
 *
 * The vendor documents a fixed set of codes, but the protocol page shows codes
 * that the contract does not list, so {@link code} is widened to `string` and
 * must not be treated as a closed set.
 */
export class NovaraFlexApiError extends NovaraFlexError {
  /** The `error` code reported by Novara Flex. */
  readonly code: NovaraFlexApiErrorCode | (string & {});
  /** The human-readable `description`, when the response included one. */
  readonly description: string | undefined;
  /** The method that was called, without a leading slash. */
  readonly method: string;
  /** The `HZS-Request-ID` response header; quote it in vendor support requests. */
  readonly requestId: string | undefined;
  /**
   * How many attempts the call made, counting the one that produced this
   * error: `1` unless the SDK retried a transient failure.
   */
  readonly attempts: number;

  constructor(options: NovaraFlexApiErrorOptions) {
    const { method, code, description, requestId, attempts } = options;
    super(
      `Novara Flex ${method} failed: ${code}${
        description ? ` (${description})` : ""
      }`,
    );
    this.name = "NovaraFlexApiError";
    this.code = code;
    this.description = description;
    this.method = method;
    this.requestId = requestId;
    this.attempts = attempts ?? 1;
  }
}

/** Options accepted by the {@link NovaraFlexRateLimitError} constructor. */
export interface NovaraFlexRateLimitErrorOptions
  extends Omit<NovaraFlexApiErrorOptions, "code"> {
  /**
   * The HTTP status the limit arrived with: `200` for a `rate_limit_exceeded`
   * envelope, `429` for an HTTP 429 response.
   */
  status: number;
  /**
   * The response's `Retry-After`, in milliseconds, or `undefined` when the
   * header was absent or could not be parsed.
   */
  retryAfterMs?: number | undefined;
}

/**
 * The vendor's rate limit: either an `HTTP 200` envelope with
 * `error: "rate_limit_exceeded"`, or an `HTTP 429` response, whatever its body
 * (a proxy may answer with HTML). {@link code} is always
 * `"rate_limit_exceeded"`; {@link status} says which of the two it was.
 *
 * Novara Flex allows about 80 requests a minute per customer, shared by every
 * token, and documents about 60 s of errors after a violation. Which shape the
 * live API actually uses, and whether it sends `Retry-After`, is unverified.
 */
export class NovaraFlexRateLimitError extends NovaraFlexApiError {
  declare readonly code: "rate_limit_exceeded";
  /** `200` for the `rate_limit_exceeded` envelope, `429` for HTTP 429. */
  readonly status: number;
  /**
   * The response's `Retry-After` in milliseconds — delta-seconds or an
   * HTTP-date — or `undefined` when it was absent or unparseable.
   */
  readonly retryAfterMs: number | undefined;

  constructor(options: NovaraFlexRateLimitErrorOptions) {
    const { status, retryAfterMs, ...rest } = options;
    super({ ...rest, code: "rate_limit_exceeded" });
    this.name = "NovaraFlexRateLimitError";
    if (status !== 200 && !rest.description) {
      this.message = `Novara Flex ${rest.method} failed: rate_limit_exceeded (HTTP ${status})`;
    }
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Why a {@link NovaraFlexTransportError} was raised. Every transport error
 * carries exactly one; it is what the retry layer branches on: `"timeout"`,
 * `"network"`, and an `"http_status"` of 5xx are retried for idempotent
 * methods, the rest never are. An HTTP 429 is not a transport error at all but
 * a {@link NovaraFlexRateLimitError}.
 *
 * - `"timeout"`: the client's own request timeout fired before the call
 *   finished, whether the response headers or the body were still pending.
 *   `status` and `requestId` are set when a response had already arrived.
 * - `"network"`: `fetch` itself rejected, so no response arrived at all, or
 *   the connection failed while the body was still being read (then `status`
 *   and `requestId` are set).
 * - `"http_status"`: the server answered with a status other than `200` or
 *   `429`, or — for the methods that return a file or a CSV document — with a
 *   redirect the SDK will not follow (no usable `Location`, a scheme other
 *   than `https:`, more than five hops, or a browser's opaque redirect).
 * - `"invalid_json"`: the response body was read in full but was not JSON.
 * - `"invalid_envelope"`: the body was JSON but not the documented
 *   `{ ok: ... }` envelope.
 * - `"content_type"`: the response's content type is not one the method
 *   called can return — for example HTML, or a JSON success, where a CSV
 *   document or an attachment file was expected. Raised only by the methods
 *   that return something other than JSON (`flex.responses.flatCsv()`,
 *   `flex.oshaHours.listCsv()`, `flex.attachment.load()`); a JSON body that
 *   would not parse is on `cause`. Never retried.
 */
export type NovaraFlexTransportErrorReason =
  | "timeout"
  | "network"
  | "http_status"
  | "invalid_json"
  | "invalid_envelope"
  | "content_type";

/** Options accepted by the {@link NovaraFlexTransportError} constructor. */
export interface NovaraFlexTransportErrorOptions extends ErrorOptions {
  /** The method that was called, without a leading slash. */
  method: string;
  /** Why the call failed. */
  reason: NovaraFlexTransportErrorReason;
  /** The HTTP status code, when a response was received at all. */
  status?: number | undefined;
  /** The `HZS-Request-ID` response header, if the server sent one. */
  requestId?: string | undefined;
  /**
   * Which attempt produced this failure, counting from 1. The error a call
   * throws is always its last failure, so this is the number of attempts the
   * call made. Defaults to `1`.
   */
  attempts?: number | undefined;
}

/**
 * A failure that never produced a well-formed Novara Flex envelope: the request
 * did not complete or timed out, the server answered with a non-`200` status,
 * the body was not JSON in the documented `{ ok: ... }` shape, or — for a
 * method that returns a CSV document or a file — the content type was not one
 * the method can return. {@link reason} says which.
 *
 * The underlying `fetch` or `JSON.parse` failure, when there was one, is
 * available as the standard `cause` property.
 */
export class NovaraFlexTransportError extends NovaraFlexError {
  /** The method that was called, without a leading slash. */
  readonly method: string;
  /** Why the call failed; see {@link NovaraFlexTransportErrorReason}. */
  readonly reason: NovaraFlexTransportErrorReason;
  /** The HTTP status code, or `undefined` if no response was received. */
  readonly status: number | undefined;
  /** The `HZS-Request-ID` response header, if the server sent one. */
  readonly requestId: string | undefined;
  /**
   * How many attempts the call made, counting the one that produced this
   * error: `1` unless the SDK retried a transient failure.
   */
  readonly attempts: number;

  constructor(message: string, options: NovaraFlexTransportErrorOptions) {
    const { method, reason, status, requestId, attempts, ...errorOptions } =
      options;
    super(message, errorOptions);
    this.name = "NovaraFlexTransportError";
    this.method = method;
    this.reason = reason;
    this.status = status;
    this.requestId = requestId;
    this.attempts = attempts ?? 1;
  }
}
