/**
 * The `equipments.*` area: the equipment records of one equipment type.
 *
 * Reached through {@link NovaraFlexClient.equipments}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `equipments.*` Novara Flex methods, exposed as `flex.equipments`. */
export class EquipmentsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns equipment for the specified equipment type, including inspection
   * status.
   *
   * `equipmentType_id` is required — the vendor's camelCased spelling is kept
   * verbatim — and comes from {@link EquipmentTypesResource.list}. The method
   * takes no paging parameters; it answers with every matching record at once.
   *
   * `service_type` filters by in-service state (`"in"`, the default, `"out"`,
   * or `"all"`), `columns` narrows the fields returned (omit it for all of
   * them), and `include_null_metavalues` adds empty metafield ids with `null`
   * values.
   *
   * @see https://api.novaraflex.com/docs/method/equipments.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"equipments.list">
  ): Promise<NovaraFlexResult<"equipments.list">> {
    return this.#client.call("equipments.list", ...rest);
  }
}
