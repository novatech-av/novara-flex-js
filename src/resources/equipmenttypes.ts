/**
 * The `equipmenttypes.*` area: the equipment types configured for the account.
 *
 * Reached through {@link NovaraFlexClient.equipmenttypes}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/**
 * The `equipmenttypes.*` Novara Flex methods, exposed as
 * `flex.equipmenttypes`.
 */
export class EquipmentTypesResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns equipment types, including metafields and inspection schedules.
   *
   * Each type's `id` is what {@link EquipmentsResource.list} takes as its
   * required `equipmentType_id`.
   *
   * @see https://api.novaraflex.com/docs/method/equipmenttypes.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"equipmenttypes.list">
  ): Promise<NovaraFlexResult<"equipmenttypes.list">> {
    return this.#client.call("equipmenttypes.list", ...rest);
  }
}
