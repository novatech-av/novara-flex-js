/**
 * The `acknowledgments.*` area: the acknowledgment notices an organization
 * sends its employees, and who has acknowledged them.
 *
 * Reached through {@link NovaraFlexClient.acknowledgments}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `acknowledgments.*` Novara Flex methods, exposed as `flex.acknowledgments`. */
export class AcknowledgmentsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns the acknowledgments the organization has sent.
   *
   * Every parameter is optional: the method takes no filters and no paging
   * parameters, so it answers with all of them at once. Each acknowledgment
   * names its `author_id` and the audience it was sent to —
   * `specificEmployees_id`, `fieldOffices_id`, `linesOfBusiness_id`, and
   * `jobTitles_id`. The per-recipient `recipients` array is what
   * {@link info} adds.
   *
   * @see https://api.novaraflex.com/docs/method/acknowledgments.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"acknowledgments.list">
  ): Promise<NovaraFlexResult<"acknowledgments.list">> {
    return this.#client.call("acknowledgments.list", ...rest);
  }

  /**
   * Returns one acknowledgment, its recipients included.
   *
   * `id` is required — a string id, from an {@link list} item, and spelled `id`
   * the way `users.info` spells it rather than `acknowledgment_id`. The result
   * adds the `recipients` array: one entry per employee, each with the
   * `acknowledgedOn` timestamp, which is null until that employee acknowledges.
   *
   * @see https://api.novaraflex.com/docs/method/acknowledgments.info
   */
  info(
    ...rest: NovaraFlexCallArgs<"acknowledgments.info">
  ): Promise<NovaraFlexResult<"acknowledgments.info">> {
    return this.#client.call("acknowledgments.info", ...rest);
  }
}
