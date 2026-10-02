/**
 * The `resourcetags.*` area: the labels a resource is filed under.
 *
 * The vendor calls the same thing two names — a *tag* in the method name, a
 * *category* in its prose and in `Resource.category_id` — so the contract's
 * schema is still `ResourceCategory`. The wire settles the container: the
 * result array is named `resourcetags`, after the method.
 *
 * Reached through {@link NovaraFlexClient.resourcetags}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `resourcetags.*` Novara Flex methods, exposed as `flex.resourcetags`. */
export class ResourceTagsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns the resource tags, which the vendor's prose also calls categories.
   *
   * Every parameter is optional: the method takes no filters and no paging
   * parameters, so it answers with all of them at once. Each entry carries its
   * `name`, its `sequence`, and the `roles_id` the tag is visible to. A
   * {@link ResourcesResource.list} item's `tags` holds names, not ids, but not
   * every name a resource carries is one this method defines.
   *
   * @see https://api.novaraflex.com/docs/method/resourcetags.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"resourcetags.list">
  ): Promise<NovaraFlexResult<"resourcetags.list">> {
    return this.#client.call("resourcetags.list", ...rest);
  }
}
