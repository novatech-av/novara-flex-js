/**
 * The `fieldoffices.*` area: the organization's field offices.
 *
 * Reached through {@link NovaraFlexClient.fieldoffices}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `fieldoffices.*` Novara Flex methods, exposed as `flex.fieldoffices`. */
export class FieldOfficesResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns field offices for the organization.
   *
   * @see https://api.novaraflex.com/docs/method/fieldoffices.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"fieldoffices.list">
  ): Promise<NovaraFlexResult<"fieldoffices.list">> {
    return this.#client.call("fieldoffices.list", ...rest);
  }
}
