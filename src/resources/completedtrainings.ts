/**
 * The `completedtrainings.*` area: the record of who completed which training.
 *
 * The vendor versions this area's only current method —
 * `completedtrainings.v2.list` — and the SDK drops the version segment from the
 * method name: `flex.completedtrainings.list()`. That is naming only. The vendor
 * method name, `.v2` included, is unchanged everywhere it is a *value*: it is
 * the string passed to `call`, the URL in the `@see`, and the `method` an error
 * reports, so `flex.call("completedtrainings.v2.list")` keeps working and a
 * failure from `flex.completedtrainings.list()` still reports the versioned
 * name. Should the vendor publish a `v3`, this wrapper moves to it and the older
 * versions stay reachable through `call`.
 *
 * Reached through {@link NovaraFlexClient.completedtrainings}, never constructed
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

/**
 * The `completedtrainings.*` Novara Flex methods, exposed as
 * `flex.completedtrainings`.
 */
export class CompletedTrainingsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns training completion records, most recent first.
   *
   * This calls the vendor's **versioned** `completedtrainings.v2.list`: only the
   * SDK method name drops the `v2`. The request goes to
   * `${baseUrl}/completedtrainings.v2.list` and a failure reports
   * `method: "completedtrainings.v2.list"` on `NovaraFlexApiError` and
   * `NovaraFlexTransportError`.
   *
   * Every parameter is optional. `training_id` (from
   * {@link TrainingsResource.list}) and `user_id` filter the records, and
   * `has_attachments` selects records that have, or have not, a file attached.
   * This is one of the paged methods: `limit` (1–1000, default 100) caps the
   * number of records in the response body and `page` (1-based, default 1)
   * selects the page.
   *
   * The response body is returned whole, so the `paging` metadata stays
   * reachable — `paging.total` counts records and `paging.last_page` counts
   * pages *at the requested `limit`*, so it changes when `limit` does.
   * {@link listAll} walks every page for you.
   *
   * @see https://api.novaraflex.com/docs/method/completedtrainings.v2.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"completedtrainings.v2.list">
  ): Promise<NovaraFlexResult<"completedtrainings.v2.list">> {
    return this.#client.call("completedtrainings.v2.list", ...rest);
  }

  /**
   * Walks every page of {@link list}: `for await` yields each completion
   * record, one request per page, and `.pages()` yields each page's full
   * success body instead. It takes the same arguments as {@link list}; `limit`
   * defaults to the maximum, 1000, rather than the vendor's default, an
   * explicit `limit` is passed through untouched, and `page` (default 1) is
   * where the walk starts. Nothing is sent until the result is iterated, and
   * the call options apply to every page.
   *
   * `.count()` answers how many items match with one request instead of a
   * walk: your filters apply, while `limit` and `page` are ignored.
   *
   * Records created or removed during a walk can shift items across page
   * boundaries: an item may be yielded twice or missed.
   * Nothing is deduplicated. For bulk walks, give the client a `rateLimit` such
   * as `{ requestsPerMinute: 40 }`. See {@link NovaraFlexPaginator}.
   *
   * @see https://api.novaraflex.com/docs/method/completedtrainings.v2.list
   */
  listAll(
    ...rest: NovaraFlexCallArgs<"completedtrainings.v2.list">
  ): NovaraFlexPaginator<
    PagedItem<"completedtrainings.v2.list">,
    NovaraFlexResult<"completedtrainings.v2.list">
  > {
    return paginate(this.#client, "completedtrainings.v2.list", ...rest);
  }
}
