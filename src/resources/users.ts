/**
 * The `users.*` area: the people on the account.
 *
 * Reached through {@link NovaraFlexClient.users}, never constructed directly.
 * See `./index.ts` for the naming convention these resource classes follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `users.*` Novara Flex methods, exposed as `flex.users`. */
export class UsersResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns employees/users for the organization.
   *
   * The method takes no paging parameters: it returns the entire roster in a
   * single response, which can be large. Fetch it once and reuse the result
   * rather than calling it per lookup.
   *
   * @see https://api.novaraflex.com/docs/method/users.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"users.list">
  ): Promise<NovaraFlexResult<"users.list">> {
    return this.#client.call("users.list", ...rest);
  }

  /**
   * Returns details for a specific user.
   *
   * @see https://api.novaraflex.com/docs/method/users.info
   */
  info(
    ...rest: NovaraFlexCallArgs<"users.info">
  ): Promise<NovaraFlexResult<"users.info">> {
    return this.#client.call("users.info", ...rest);
  }
}
