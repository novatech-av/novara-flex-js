/**
 * The `contractor-contacts.*` area: the contacts of one contractor.
 *
 * The vendor spells this area with a hyphen, which cannot be a dotted property,
 * so the client exposes it camelCased as {@link NovaraFlexClient.contractorContacts}.
 * The vendor method name itself is untouched wherever it is a value: `call`
 * still takes `"contractor-contacts.list"`, and that is the name an error
 * reports. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/**
 * The `contractor-contacts.*` Novara Flex methods, exposed as
 * `flex.contractorContacts`.
 */
export class ContractorContactsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns contacts for a contractor.
   *
   * `contractor_id` is required and comes from
   * {@link ContractorsResource.list}. The method takes no paging parameters; it
   * answers with every contact of that contractor at once. `only_mine` excludes
   * contacts created by other Novara clients when true (default false).
   *
   * @see https://api.novaraflex.com/docs/method/contractor-contacts.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"contractor-contacts.list">
  ): Promise<NovaraFlexResult<"contractor-contacts.list">> {
    return this.#client.call("contractor-contacts.list", ...rest);
  }
}
