/**
 * The `training-employee-status.*` area: each employee's training completion
 * status, rolled up.
 *
 * The vendor spells this area with hyphens, which cannot be a dotted property,
 * so the client exposes it camelCased as
 * {@link NovaraFlexClient.trainingEmployeeStatus}. The vendor method name itself
 * is untouched wherever it is a value: `call` still takes
 * `"training-employee-status.list"`, and that is the name an error reports. See
 * `./index.ts` for the naming convention these resource classes follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";
import {
  type NovaraFlexPaginator,
  type PagedItem,
  paginate,
} from "../internal/paginate.js";

/**
 * The `training-employee-status.*` Novara Flex methods, exposed as
 * `flex.trainingEmployeeStatus`.
 */
export class TrainingEmployeeStatusResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns training completion percentages and status by employee.
   *
   * Every parameter is optional. `training_ids` and `m_user_ids` narrow the
   * roll-up to specific trainings or employees, and `include_all_completions`
   * (default false) widens `last_completed` to non-required trainings as well.
   * This is one of the paged methods: `limit` (1–1000, default 1000) caps the
   * number of employees in the response body and `page` (1-based, default 1)
   * selects the page.
   *
   * The response body is returned whole, so the `paging` metadata stays
   * reachable — `paging.total` counts employees and `paging.last_page` counts
   * pages *at the requested `limit`*, so it changes when `limit` does.
   * {@link listAll} walks every page for you. The body also carries a
   * top-level `last_updated` timestamp, because the vendor documents these
   * results as cacheable for up to 15 minutes: a completion recorded a moment
   * ago need not be reflected yet.
   *
   * @see https://api.novaraflex.com/docs/method/training-employee-status.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"training-employee-status.list">
  ): Promise<NovaraFlexResult<"training-employee-status.list">> {
    return this.#client.call("training-employee-status.list", ...rest);
  }

  /**
   * Walks every page of {@link list}: `for await` yields each employee, one
   * request per page, and `.pages()` yields each page's full success body
   * instead. It takes the same arguments as {@link list}; `limit` defaults to
   * the maximum, 1000, rather than the vendor's default, an explicit `limit` is
   * passed through untouched, and `page` (default 1) is where the walk starts.
   * Nothing is sent until the result is iterated, and the call options apply to
   * every page.
   *
   * `.count()` answers how many items match with one request instead of a
   * walk: your filters apply, while `limit` and `page` are ignored.
   *
   * Records created or removed during a walk can shift items across page
   * boundaries: an item may be yielded twice or missed.
   * Nothing is deduplicated. For bulk walks, give the client a `rateLimit` such
   * as `{ requestsPerMinute: 40 }`. See {@link NovaraFlexPaginator}.
   *
   * @see https://api.novaraflex.com/docs/method/training-employee-status.list
   */
  listAll(
    ...rest: NovaraFlexCallArgs<"training-employee-status.list">
  ): NovaraFlexPaginator<
    PagedItem<"training-employee-status.list">,
    NovaraFlexResult<"training-employee-status.list">
  > {
    return paginate(this.#client, "training-employee-status.list", ...rest);
  }
}
