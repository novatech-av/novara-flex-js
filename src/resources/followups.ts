/**
 * The `followups.*` area: the follow-ups raised inside form responses.
 *
 * Reached through {@link NovaraFlexClient.followups}, never constructed
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

/** The `followups.*` Novara Flex methods, exposed as `flex.followups`. */
export class FollowupsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Searches follow-ups created within form responses, sorted newest first.
   *
   * Every parameter is optional, so the whole account's follow-ups are one
   * `flex.followups.list()` away. This is one of the paged methods: `limit`
   * (1–500, default 100) caps the number of follow-ups in the response and
   * `page` (1-based, default 1) selects the page — note that the default
   * differs from the 10 that {@link ResponsesResource.list} uses.
   *
   * The filters are `form_id` (an integer), `status` (`"all"`, `"open"`,
   * `"closed"`, or `"overdue"`), `observer_id` and `assignee_id` (user ids),
   * and `response_id` (the originating form response). The four time bounds —
   * `created_before`, `created_after`, `updated_before`, and `updated_after` —
   * are Unix epoch times in **milliseconds**, not seconds.
   *
   * The response body is returned whole, so the `paging` metadata stays
   * reachable — `paging.total` counts follow-ups and `paging.last_page` counts
   * pages *at the requested `limit`*, so it changes when `limit` does.
   * {@link listAll} walks every page for you.
   *
   * @see https://api.novaraflex.com/docs/method/followups.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"followups.list">
  ): Promise<NovaraFlexResult<"followups.list">> {
    return this.#client.call("followups.list", ...rest);
  }

  /**
   * Walks every page of {@link list}: `for await` yields each follow-up, one
   * request per page, and `.pages()` yields each page's full success body
   * instead. It takes the same arguments as {@link list}; `limit` defaults to
   * the maximum, 500, rather than the vendor's default, an explicit `limit` is
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
   * @see https://api.novaraflex.com/docs/method/followups.list
   */
  listAll(
    ...rest: NovaraFlexCallArgs<"followups.list">
  ): NovaraFlexPaginator<
    PagedItem<"followups.list">,
    NovaraFlexResult<"followups.list">
  > {
    return paginate(this.#client, "followups.list", ...rest);
  }
}
