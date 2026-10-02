/**
 * Classification of a parsed Novara Flex response body.
 *
 * Novara Flex answers every request with `HTTP 200`; success and failure are
 * distinguished by the `ok` field of the JSON body. These helpers are pure and
 * do no I/O so that the rules can be unit-tested on their own.
 *
 * Nothing here is public API.
 */

/** The result of classifying a parsed response body. */
export type EnvelopeClassification =
  | { readonly kind: "success"; readonly body: Record<string, unknown> }
  | {
      readonly kind: "error";
      readonly code: string;
      readonly description: string | undefined;
    }
  | { readonly kind: "invalid" };

/** `true` for a non-null, non-array object literal. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Classify a parsed JSON body as a success envelope, an application-level error
 * envelope, or something that is not a recognizable Novara Flex response.
 *
 * A success envelope is a plain object with `ok === true`. An error envelope is
 * a plain object with `ok === false` and a string `error` code. The `error`
 * code is deliberately not checked against the contract's enum: the vendor
 * documents codes that the contract does not list.
 */
export function classifyEnvelope(body: unknown): EnvelopeClassification {
  if (!isPlainObject(body)) return { kind: "invalid" };
  if (body.ok === true) return { kind: "success", body };
  if (body.ok === false && typeof body.error === "string") {
    return {
      kind: "error",
      code: body.error,
      description:
        typeof body.description === "string" ? body.description : undefined,
    };
  }
  return { kind: "invalid" };
}
