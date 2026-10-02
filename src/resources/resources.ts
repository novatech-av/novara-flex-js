/**
 * The `resources.*` area: the PDFs and other reference documents an
 * organization publishes to its employees.
 *
 * Reached through {@link NovaraFlexClient.resources}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `resources.*` Novara Flex methods, exposed as `flex.resources`. */
export class ResourcesResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns the resources published to employees.
   *
   * Every parameter is optional: the method takes no filters and no paging
   * parameters, so it answers with the whole library at once. Each resource
   * carries a `versions` array rather than a single document — one entry per
   * published version, with its `version`, `description`, `creator_id`, and
   * `approvedOn` — and a `tags` array of label *names*, some of which
   * {@link ResourceTagsResource.list} defines.
   *
   * A version points at its document one of two ways: `file` names an uploaded
   * document, and `link` is a URL. `file` is `null` when the version is a link
   * instead of an upload. Fetching the uploaded document itself means
   * {@link AttachmentResource.load}, which answers with a file rather than a
   * JSON envelope. Whether `file` is the storage key `attachment.load` takes
   * has not been verified on the live API.
   *
   * @see https://api.novaraflex.com/docs/method/resources.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"resources.list">
  ): Promise<NovaraFlexResult<"resources.list">> {
    return this.#client.call("resources.list", ...rest);
  }
}
