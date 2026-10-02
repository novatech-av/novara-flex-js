/**
 * The `roles.*` area: the permission roles users are assigned.
 *
 * Reached through {@link NovaraFlexClient.roles}, never constructed directly.
 * See `./index.ts` for the naming convention these resource classes follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `roles.*` Novara Flex methods, exposed as `flex.roles`. */
export class RolesResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns roles for the organization.
   *
   * @see https://api.novaraflex.com/docs/method/roles.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"roles.list">
  ): Promise<NovaraFlexResult<"roles.list">> {
    return this.#client.call("roles.list", ...rest);
  }
}
