/**
 * The `companies.*` area: the companies listed for the organization.
 *
 * Reached through {@link NovaraFlexClient.companies}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `companies.*` Novara Flex methods, exposed as `flex.companies`. */
export class CompaniesResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns companies listed for the organization.
   *
   * @see https://api.novaraflex.com/docs/method/companies.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"companies.list">
  ): Promise<NovaraFlexResult<"companies.list">> {
    return this.#client.call("companies.list", ...rest);
  }
}
