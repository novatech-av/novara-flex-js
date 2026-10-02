/**
 * The `forms.*` area: the form definitions of the organization.
 *
 * Reached through {@link NovaraFlexClient.forms}, never constructed directly.
 * See `./index.ts` for the naming convention these resource classes follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `forms.*` Novara Flex methods, exposed as `flex.forms`. */
export class FormsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns the forms created by the organization.
   *
   * The method takes no filters and no paging parameters; it answers with every
   * form at once, each as a summary — `id`, `name`, `description`, `folder_id`,
   * `hidden`, `score`, and the timestamps — without its field definitions. A
   * form's `id` is the `form_id` that {@link info}, {@link ResponsesResource.list},
   * and {@link ResponsesResource.flat} take.
   *
   * @see https://api.novaraflex.com/docs/method/forms.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"forms.list">
  ): Promise<NovaraFlexResult<"forms.list">> {
    return this.#client.call("forms.list", ...rest);
  }

  /**
   * Returns one form's metadata, version information, and fields.
   *
   * `form_id` is required — an integer, from {@link list}. The result carries
   * everything the summary does plus `latest`, the current version with its
   * `version` number and its `fields` array: each field's `id`, `title`,
   * `shortTitle`, `type`, `description`, `required` flag, and `settings`. Those
   * field ids are the keys the flattened rows of
   * {@link ResponsesResource.flat} are built from.
   *
   * `include_versions` (default false) adds a `versions` array holding the
   * prior versions of the form.
   *
   * @see https://api.novaraflex.com/docs/method/forms.info
   */
  info(
    ...rest: NovaraFlexCallArgs<"forms.info">
  ): Promise<NovaraFlexResult<"forms.info">> {
    return this.#client.call("forms.info", ...rest);
  }
}
