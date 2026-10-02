/**
 * The `linesofbusiness.*` area: the organization's lines of business.
 *
 * Reached through {@link NovaraFlexClient.linesofbusiness}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/**
 * The `linesofbusiness.*` Novara Flex methods, exposed as
 * `flex.linesofbusiness`.
 */
export class LinesOfBusinessResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns lines of business for the organization.
   *
   * @see https://api.novaraflex.com/docs/method/linesofbusiness.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"linesofbusiness.list">
  ): Promise<NovaraFlexResult<"linesofbusiness.list">> {
    return this.#client.call("linesofbusiness.list", ...rest);
  }
}
