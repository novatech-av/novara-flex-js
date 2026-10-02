/**
 * The `account.*` area: information about the account the token belongs to.
 *
 * Reached through {@link NovaraFlexClient.account}, never constructed directly.
 * See `./index.ts` for the naming convention these resource classes follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `account.*` Novara Flex methods, exposed as `flex.account`. */
export class AccountResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns details for the organization associated with the API token.
   *
   * Resolves with the full success body — `{ ok: true, account: {...} }`, not a
   * bare `account`.
   *
   * @see https://api.novaraflex.com/docs/method/account.info
   */
  info(
    ...rest: NovaraFlexCallArgs<"account.info">
  ): Promise<NovaraFlexResult<"account.info">> {
    return this.#client.call("account.info", ...rest);
  }
}
