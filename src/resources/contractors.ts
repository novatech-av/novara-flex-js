/**
 * The `contractors.*` area: the contractors listed for the organization.
 *
 * Reached through {@link NovaraFlexClient.contractors}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
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

/** The `contractors.*` Novara Flex methods, exposed as `flex.contractors`. */
export class ContractorsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns contractors listed for the organization.
   *
   * This is one of the paged methods: `limit` (1–1000, default 100) caps the
   * number of contractors in the response and `page` (1-based, default 1)
   * selects the page. Note that the maximum differs from the one
   * {@link ContractorRequirementsResource.list} accepts (1–500). `status`
   * filters by approval status (`"new"`, `"pending"`, `"approved"`, or
   * `"denied"`).
   *
   * The response body is returned whole, so the `paging` metadata stays
   * reachable — `paging.total` counts contractors and `paging.last_page` counts
   * pages *at the requested `limit`*, so it changes when `limit` does.
   * {@link listAll} walks every page for you.
   *
   * @see https://api.novaraflex.com/docs/method/contractors.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"contractors.list">
  ): Promise<NovaraFlexResult<"contractors.list">> {
    return this.#client.call("contractors.list", ...rest);
  }

  /**
   * Walks every page of {@link list}: `for await` yields each contractor, one
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
   * @see https://api.novaraflex.com/docs/method/contractors.list
   */
  listAll(
    ...rest: NovaraFlexCallArgs<"contractors.list">
  ): NovaraFlexPaginator<
    PagedItem<"contractors.list">,
    NovaraFlexResult<"contractors.list">
  > {
    return paginate(this.#client, "contractors.list", ...rest);
  }
}
