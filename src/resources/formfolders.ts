/**
 * The `formfolders.*` area: the folders forms are filed in.
 *
 * Reached through {@link NovaraFlexClient.formfolders}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `formfolders.*` Novara Flex methods, exposed as `flex.formfolders`. */
export class FormFoldersResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns form folders for the organization.
   *
   * The method takes no filters and no paging parameters; it answers with every
   * folder at once, under a `folders` key. A folder's `id` is the `folder_id` a
   * form carries in {@link FormsResource.list}.
   *
   * @see https://api.novaraflex.com/docs/method/formfolders.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"formfolders.list">
  ): Promise<NovaraFlexResult<"formfolders.list">> {
    return this.#client.call("formfolders.list", ...rest);
  }
}
