/**
 * The `trainings.*` area: the training courses an organization assigns.
 *
 * The vendor versions this area's only current method — `trainings.v2.list` —
 * and the SDK drops the version segment from the method name:
 * `flex.trainings.list()`. That is naming only. The vendor method name, `.v2`
 * included, is unchanged everywhere it is a *value*: it is the string passed to
 * `call`, the URL in the `@see`, and the `method` an error reports, so
 * `flex.call("trainings.v2.list")` keeps working and a failure from
 * `flex.trainings.list()` still reports `trainings.v2.list`.
 *
 * Nothing collides: the deprecated `trainings.list` has no path in the contract,
 * so the SDK name is free. Should the vendor publish a `v3`, this wrapper moves
 * to it and the older versions stay reachable through `call`.
 *
 * Reached through {@link NovaraFlexClient.trainings}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `trainings.*` Novara Flex methods, exposed as `flex.trainings`. */
export class TrainingsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns the organization's trainings.
   *
   * This calls the vendor's **versioned** `trainings.v2.list`, not
   * `trainings.list`: only the SDK method name drops the `v2`. The request goes
   * to `${baseUrl}/trainings.v2.list` and a failure reports
   * `method: "trainings.v2.list"` on `NovaraFlexApiError` and
   * `NovaraFlexTransportError`. The vendor's older `trainings.list` is
   * deprecated and is not part of the contract.
   *
   * Every parameter is optional: the method takes no filters and no paging
   * parameters, so it answers with the whole catalog at once. Each training
   * carries its renewal rules (`schedule_type`, `renewal_months`, the
   * `expires_on_*` and `window_*` day-and-month pairs) and the
   * `assigned_to_type` / `assigned_to_condition` pair that decides who has to
   * take it. A training `id` is what {@link CompletedTrainingsResource.list}
   * filters by.
   *
   * @see https://api.novaraflex.com/docs/method/trainings.v2.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"trainings.v2.list">
  ): Promise<NovaraFlexResult<"trainings.v2.list">> {
    return this.#client.call("trainings.v2.list", ...rest);
  }
}
