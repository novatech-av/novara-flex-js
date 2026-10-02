/**
 * The `datalists.*` area: the custom data lists an organization defines to back
 * its own list-valued fields.
 *
 * Reached through {@link NovaraFlexClient.datalists}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `datalists.*` Novara Flex methods, exposed as `flex.datalists`. */
export class DataListsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns the custom data lists the organization has created.
   *
   * Every parameter is optional: the method takes no filters and no paging
   * parameters, so it answers with all of them at once. Each entry is the list
   * itself — its `id`, `title`, and timestamps — and not its contents; a list's
   * `id` is the `data_list_id` that {@link DataListItemsResource.list} requires
   * to fetch the items.
   *
   * @see https://api.novaraflex.com/docs/method/datalists.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"datalists.list">
  ): Promise<NovaraFlexResult<"datalists.list">> {
    return this.#client.call("datalists.list", ...rest);
  }
}
