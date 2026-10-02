/**
 * The internal channel through which a resource class asks the client for a
 * response that is not a JSON envelope: a CSV document or a file.
 *
 * `NovaraFlexClient.call` parses every body as JSON and stays that way. The
 * CSV and file methods (`flex.responses.flatCsv()`, `flex.oshaHours.listCsv()`,
 * `flex.attachment.load()`) need the same request loop — timeout, retries,
 * cooldown, throttle, rate-limit handling — with a different ending, and that
 * loop reads the client's private fields. Rather than add a member to the
 * client's declared surface, each client registers a closure over its private
 * request loop here, in a `WeakMap` keyed by the instance, from its
 * constructor. The resource classes look it up by the client they were given.
 *
 * A `WeakMap` rather than a symbol-keyed method: a symbol-keyed member would
 * still appear in `dist/client.d.ts` and on the instance, while the map is
 * invisible to consumers — this module is not reachable through the package's
 * `exports` — and holds no client alive.
 *
 * Nothing here is public API.
 */

import type {
  NovaraFlexAttachment,
  NovaraFlexCallOptions,
  NovaraFlexClient,
  NovaraFlexCsvPage,
  NovaraFlexMethod,
} from "../client.js";

/** What a non-JSON request expects back: a CSV document or a file. */
export type RawResponseMode = "csv" | "blob";

/** The result of a non-JSON request, per mode. */
export type RawResult<K extends RawResponseMode> = K extends "csv"
  ? NovaraFlexCsvPage
  : NovaraFlexAttachment;

/** A client's private non-JSON request loop. */
export type RawRequester = <K extends RawResponseMode>(
  mode: K,
  method: NovaraFlexMethod,
  params: object | undefined,
  options: NovaraFlexCallOptions | undefined,
) => Promise<RawResult<K>>;

const requesters = new WeakMap<NovaraFlexClient, RawRequester>();

/** Called once, from the `NovaraFlexClient` constructor. */
export function registerRawRequester(
  client: NovaraFlexClient,
  requester: RawRequester,
): void {
  requesters.set(client, requester);
}

/**
 * Send `method` through `client`'s request loop and expect `mode` back.
 * `params` are sent as given, the token added last by the client.
 */
export function requestRaw<K extends RawResponseMode>(
  client: NovaraFlexClient,
  mode: K,
  method: NovaraFlexMethod,
  params: object | undefined,
  options: NovaraFlexCallOptions | undefined,
): Promise<RawResult<K>> {
  const requester = requesters.get(client);
  if (requester === undefined) {
    return Promise.reject(
      new TypeError("NovaraFlexClient was not constructed by the SDK"),
    );
  }
  return requester(mode, method, params, options);
}
