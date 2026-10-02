/**
 * The `establishments.*` area: the OSHA establishments an organization records
 * hours and incidents against.
 *
 * The vendor's documentation labels this area *coming soon*, and the contract
 * carries that marker (`x-novara-coming-soon`). The methods are wrapped anyway,
 * because they are documented and the live API answers them; what "coming soon"
 * changes is that the surface may still move.
 *
 * Reached through {@link NovaraFlexClient.establishments}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `establishments.*` Novara Flex methods, exposed as `flex.establishments`. */
export class EstablishmentsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns the establishments the organization has created.
   *
   * Every parameter is optional: the method takes no filters and no paging
   * parameters, so it answers with all of them at once. An establishment `id` is
   * what {@link info} takes as `establishment_id` and what
   * {@link OshaHoursResource.list} filters by through `establishment_ids`.
   *
   * @see https://api.novaraflex.com/docs/method/establishments.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"establishments.list">
  ): Promise<NovaraFlexResult<"establishments.list">> {
    return this.#client.call("establishments.list", ...rest);
  }

  /**
   * Returns one establishment, with its address.
   *
   * `establishment_id` is required — an integer, from an {@link list} item, and
   * not the `id` that `users.info` and {@link AcknowledgmentsResource.info}
   * take. The result adds the street address fields the list omits: `street`,
   * `city`, `state`, `zip`, and `industry_description`.
   *
   * Note the container: the vendor answers with `establishment` as an **array**
   * holding the single match, not as an object. That is the live shape, not a
   * contract slip, so nothing is unwrapped here either.
   *
   * @see https://api.novaraflex.com/docs/method/establishments.info
   */
  info(
    ...rest: NovaraFlexCallArgs<"establishments.info">
  ): Promise<NovaraFlexResult<"establishments.info">> {
    return this.#client.call("establishments.info", ...rest);
  }
}
