/**
 * The `projects.*` area: the projects (jobs/sites) on the account.
 *
 * Reached through {@link NovaraFlexClient.projects}, never constructed
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

/** The `projects.*` Novara Flex methods, exposed as `flex.projects`. */
export class ProjectsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns projects, sorted newest first.
   *
   * This is one of the paged methods: `limit` (1–500, default 10) caps the
   * number of projects in the response and `page` (1-based, default 1) selects
   * the page. The response body is returned whole, so the `paging` metadata
   * stays reachable — `paging.total` counts projects and `paging.last_page`
   * counts pages *at the requested `limit`*, so it changes when `limit` does.
   * {@link listAll} walks every page for you.
   *
   * @see https://api.novaraflex.com/docs/method/projects.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"projects.list">
  ): Promise<NovaraFlexResult<"projects.list">> {
    return this.#client.call("projects.list", ...rest);
  }

  /**
   * Walks every page of {@link list}: `for await` yields each project, one
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
   * @see https://api.novaraflex.com/docs/method/projects.list
   */
  listAll(
    ...rest: NovaraFlexCallArgs<"projects.list">
  ): NovaraFlexPaginator<
    PagedItem<"projects.list">,
    NovaraFlexResult<"projects.list">
  > {
    return paginate(this.#client, "projects.list", ...rest);
  }

  /**
   * Returns a specific project.
   *
   * The identifier parameter is the vendor's `project_id`, an integer — not the
   * `id` that `users.info` takes. The SDK keeps the vendor's spelling for both.
   *
   * @see https://api.novaraflex.com/docs/method/projects.info
   */
  info(
    ...rest: NovaraFlexCallArgs<"projects.info">
  ): Promise<NovaraFlexResult<"projects.info">> {
    return this.#client.call("projects.info", ...rest);
  }
}
