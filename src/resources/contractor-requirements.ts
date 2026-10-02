/**
 * The contractor requirement area, folded into one namespace.
 *
 * The vendor splits this resource across two areas: `contractor-requirements`
 * holds `list` and the *singular* `contractor-requirement` holds `info`. The
 * SDK exposes both methods on the plural namespace,
 * {@link NovaraFlexClient.contractorRequirements} — camelCased because a
 * hyphenated area cannot be a dotted property — so a caller does not have to
 * remember which method the vendor made singular.
 *
 * The fold is a naming convenience only. The vendor method name is unchanged
 * everywhere it is a value: it is the string passed to `call`, the URL in each
 * `@see`, and the `method` an error reports, so
 * `flex.call("contractor-requirement.info", ...)` keeps working and
 * `flex.contractorRequirements.info(...)` fails with that same singular name.
 *
 * Reached through the client property, never constructed directly. See
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
 * The contractor requirement Novara Flex methods, exposed as
 * `flex.contractorRequirements`.
 */
export class ContractorRequirementsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns contractor requirements.
   *
   * This is one of the paged methods: `limit` (1–500, default 100) caps the
   * number of requirements in the response and `page` (1-based, default 1)
   * selects the page. Note that the maximum differs from the one
   * {@link ContractorsResource.list} accepts (1–1000). `type` filters by
   * requirement type (`"Upload"`, `"Form"`, `"Signoff"`, or `"Training"`).
   *
   * The response body is returned whole, so the `paging` metadata stays
   * reachable — `paging.total` counts requirements and `paging.last_page`
   * counts pages *at the requested `limit`*, so it changes when `limit` does.
   * {@link listAll} walks every page for you.
   *
   * @see https://api.novaraflex.com/docs/method/contractor-requirements.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"contractor-requirements.list">
  ): Promise<NovaraFlexResult<"contractor-requirements.list">> {
    return this.#client.call("contractor-requirements.list", ...rest);
  }

  /**
   * Walks every page of {@link list}: `for await` yields each requirement, one
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
   * @see https://api.novaraflex.com/docs/method/contractor-requirements.list
   */
  listAll(
    ...rest: NovaraFlexCallArgs<"contractor-requirements.list">
  ): NovaraFlexPaginator<
    PagedItem<"contractor-requirements.list">,
    NovaraFlexResult<"contractor-requirements.list">
  > {
    return paginate(this.#client, "contractor-requirements.list", ...rest);
  }

  /**
   * Returns contractor statuses for a specific requirement.
   *
   * This method calls the vendor's **singular** `contractor-requirement.info`,
   * not `contractor-requirements.info`: it is only the SDK that folds the two
   * vendor areas into one namespace. A failure therefore reports
   * `method: "contractor-requirement.info"` on `NovaraFlexApiError` and
   * `NovaraFlexTransportError`, and the request goes to
   * `${baseUrl}/contractor-requirement.info`.
   *
   * `requirement_id` is required and comes from {@link list}. The response
   * carries the requirement's `contractors`, each with its compliance `status`.
   *
   * @see https://api.novaraflex.com/docs/method/contractor-requirement.info
   */
  info(
    ...rest: NovaraFlexCallArgs<"contractor-requirement.info">
  ): Promise<NovaraFlexResult<"contractor-requirement.info">> {
    return this.#client.call("contractor-requirement.info", ...rest);
  }
}
