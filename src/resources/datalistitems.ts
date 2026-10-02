/**
 * The `datalistitems.*` area: the entries of one custom data list.
 *
 * Reached through {@link NovaraFlexClient.datalistitems}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `datalistitems.*` Novara Flex methods, exposed as `flex.datalistitems`. */
export class DataListItemsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns the items of one custom data list.
   *
   * `data_list_id` is required — an integer, and the `id` of a
   * {@link DataListsResource.list} entry. The method takes no paging
   * parameters; it answers with every matching item at once, each carrying its
   * own `title`, `code`, `description`, `sequence`, and the `data_list_id` it
   * belongs to.
   *
   * `include_deleted` and `include_inactive` both default to `false`, so the
   * default result is the list as it stands today. Passing an id that names no
   * list is not an error: the vendor answers `ok: true` with an empty array, so
   * a wrong id is indistinguishable from an empty list.
   *
   * @see https://api.novaraflex.com/docs/method/datalistitems.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"datalistitems.list">
  ): Promise<NovaraFlexResult<"datalistitems.list">> {
    return this.#client.call("datalistitems.list", ...rest);
  }
}
