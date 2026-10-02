/**
 * The `api.*` area: connectivity checks and the echo test method.
 *
 * Reached through {@link NovaraFlexClient.api}, never constructed directly.
 * See `./index.ts` for the naming convention these resource classes follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `api.*` Novara Flex methods, exposed as `flex.api`. */
export class ApiResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Verifies API health, connectivity, and token validity.
   *
   * @see https://api.novaraflex.com/docs/method/api.ping
   */
  ping(
    ...rest: NovaraFlexCallArgs<"api.ping">
  ): Promise<NovaraFlexResult<"api.ping">> {
    return this.#client.call("api.ping", ...rest);
  }

  /**
   * Testing method that echoes the object provided in the `response` property.
   *
   * The echoed object becomes the *entire* response body, so the SDK's envelope
   * rules apply to whatever you send: echo `{ ok: true, ... }` and the call
   * resolves with it verbatim; echo `{ ok: false, error: "..." }` and the call
   * throws a `NovaraFlexApiError`; echo anything else and it throws a
   * `NovaraFlexTransportError` for an unrecognized envelope.
   *
   * @see https://api.novaraflex.com/docs/method/api.echo
   */
  echo(
    ...rest: NovaraFlexCallArgs<"api.echo">
  ): Promise<NovaraFlexResult<"api.echo">> {
    return this.#client.call("api.echo", ...rest);
  }
}
