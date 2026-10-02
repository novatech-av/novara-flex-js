/**
 * The `driver-qualifications.*` area: each regulated driver's qualification
 * requirements and their status.
 *
 * The vendor spells this area with a hyphen, which cannot be a dotted property,
 * so the client exposes it camelCased as
 * {@link NovaraFlexClient.driverQualifications}. The vendor method name itself
 * is untouched wherever it is a value: `call` still takes
 * `"driver-qualifications.list"`, and that is the name an error reports. See
 * `./index.ts` for the naming convention these resource classes follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/**
 * The `driver-qualifications.*` Novara Flex methods, exposed as
 * `flex.driverQualifications`.
 */
export class DriverQualificationsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns employees and their driver qualification status.
   *
   * Every parameter is optional: the method takes no filters and no paging
   * parameters, so it answers with every qualifying employee at once. The
   * result array is named `users`, not `drivers`, and each entry pairs the
   * employee's `id` and `employeeNumber` with a `requirements` array — one entry
   * per qualification requirement, carrying its `status`, `expiration`, and
   * `lastCompleted`.
   *
   * @see https://api.novaraflex.com/docs/method/driver-qualifications.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"driver-qualifications.list">
  ): Promise<NovaraFlexResult<"driver-qualifications.list">> {
    return this.#client.call("driver-qualifications.list", ...rest);
  }
}
