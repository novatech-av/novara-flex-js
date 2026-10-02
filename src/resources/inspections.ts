/**
 * The `inspections.*` area: the completed inspections of one equipment item.
 *
 * Reached through {@link NovaraFlexClient.inspections}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `inspections.*` Novara Flex methods, exposed as `flex.inspections`. */
export class InspectionsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns the completed inspections of one equipment item.
   *
   * `equipment_id` is required — a string id, from
   * {@link EquipmentsResource.list}, not an equipment *type* id. The method
   * takes no filters and no paging parameters; it answers with every inspection
   * of that item at once, each naming the `schedule_id` it satisfied and the
   * `inspector_id` who performed it.
   *
   * @see https://api.novaraflex.com/docs/method/inspections.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"inspections.list">
  ): Promise<NovaraFlexResult<"inspections.list">> {
    return this.#client.call("inspections.list", ...rest);
  }
}
