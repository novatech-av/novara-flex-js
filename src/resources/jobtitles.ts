/**
 * The `jobtitles.*` area: the job titles users can hold.
 *
 * Reached through {@link NovaraFlexClient.jobtitles}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `jobtitles.*` Novara Flex methods, exposed as `flex.jobtitles`. */
export class JobTitlesResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns job titles for the organization.
   *
   * @see https://api.novaraflex.com/docs/method/jobtitles.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"jobtitles.list">
  ): Promise<NovaraFlexResult<"jobtitles.list">> {
    return this.#client.call("jobtitles.list", ...rest);
  }
}
