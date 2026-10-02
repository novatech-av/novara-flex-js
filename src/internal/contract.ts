/**
 * Internal boundary over the generated Novara Flex contract.
 *
 * `src/generated/openapi.ts` is produced by `pnpm generate` from
 * `openapi/novara-flex-openapi-3.1.yaml` and must never be edited by hand.
 * This module is the *only* place in the package that imports from it: the rest
 * of the SDK works with the named helper types below, so a regenerated contract
 * changes one import boundary instead of every call site.
 *
 * Nothing here is public API. These types are not re-exported from
 * `src/index.ts` and consumers must never import them directly.
 */

import type { components, paths } from "../generated/openapi.js";

/** The full generated path map, keyed by Novara Flex method URL. */
export type NovaraPaths = paths;

/** A Novara Flex method URL, e.g. `"/account.info"`. */
export type NovaraMethod = keyof paths & string;

/** The JSON request body for a method. Always includes the `token` field. */
export type NovaraRequest<M extends NovaraMethod> =
  paths[M]["post"]["requestBody"]["content"]["application/json"];

/**
 * The JSON body of the `HTTP 200` response for a method.
 *
 * Novara Flex reports application-level failures with `HTTP 200` and
 * `ok: false`, so this is a union of the success payload and {@link NovaraApiError}.
 */
export type NovaraResponse<M extends NovaraMethod> =
  paths[M]["post"]["responses"][200]["content"]["application/json"];

/** An application-level Novara Flex error (`ok: false`). */
export type NovaraApiError = components["schemas"]["ApiError"];

/** The `ok: true` member of a method's response union. */
export type NovaraSuccess<M extends NovaraMethod> = Exclude<
  NovaraResponse<M>,
  NovaraApiError
>;

/** Pagination metadata returned by the list methods. */
export type NovaraPaging = components["schemas"]["Paging"];

/** Every named schema in the contract. */
export type NovaraSchemas = components["schemas"];

/** A single named schema from the contract, e.g. `NovaraSchema<"User">`. */
export type NovaraSchema<K extends keyof NovaraSchemas> = NovaraSchemas[K];

/** A Novara Flex method name without the leading slash, e.g. `"api.ping"`. */
export type NovaraMethodName = NovaraMethod extends `/${infer N}` ? N : never;

/** The method URL for a method name, e.g. `NovaraMethodPath<"api.ping">`. */
export type NovaraMethodPath<N extends NovaraMethodName> = `/${N}` &
  NovaraMethod;

/** The JSON request body for a method name. */
export type NovaraRequestFor<N extends NovaraMethodName> = NovaraRequest<
  NovaraMethodPath<N>
>;

/** The `ok: true` response member for a method name. */
export type NovaraSuccessFor<N extends NovaraMethodName> = NovaraSuccess<
  NovaraMethodPath<N>
>;
