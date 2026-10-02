/**
 * The `osha-hours.*` area: the recorded work hours an OSHA incident rate is
 * calculated from.
 *
 * The vendor spells this area with a hyphen, which cannot be a dotted property,
 * so the client exposes it camelCased as {@link NovaraFlexClient.oshaHours}. The
 * vendor method name itself is untouched wherever it is a value: `call` still
 * takes `"osha-hours.list"`, and that is the name an error reports. See
 * `./index.ts` for the naming convention these resource classes follow.
 *
 * `osha-hours.list` serves JSON or CSV, so it has two wrappers, and neither
 * takes the vendor's parameters verbatim: {@link OshaHoursResource.list}
 * narrows `format` to JSON ({@link OshaHoursListParams}), because `call` parses
 * every response body as JSON, and {@link OshaHoursResource.listCsv} drops
 * `format` and asks for CSV itself ({@link OshaHoursListCsvParams}).
 */

import type {
  NovaraFlexCallOptions,
  NovaraFlexClient,
  NovaraFlexCsvPage,
  NovaraFlexParams,
  NovaraFlexResult,
} from "../client.js";
import {
  type NovaraFlexPaginator,
  type PagedItem,
  paginate,
} from "../internal/paginate.js";
import { requestRaw } from "../internal/raw.js";

/** `osha-hours.list` parameters with `format` narrowed to JSON; {@link OshaHoursResource.listCsv} is the CSV route. */
export type OshaHoursListParams = Omit<
  NovaraFlexParams<"osha-hours.list">,
  "format"
> & { format?: "json" };

/** `osha-hours.list` parameters without `format`: {@link OshaHoursResource.listCsv} always asks for CSV. */
export type OshaHoursListCsvParams = Omit<
  NovaraFlexParams<"osha-hours.list">,
  "format"
>;

/** The `osha-hours.*` Novara Flex methods, exposed as `flex.oshaHours`. */
export class OshaHoursResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns recorded OSHA hours, newest first — as JSON.
   *
   * **JSON only; {@link listCsv} is the CSV route.** The vendor method also
   * serves CSV, but {@link NovaraFlexClient.call} parses every body as JSON, so
   * this wrapper narrows `format` at the type level: `"json"` (the vendor's
   * default) is accepted and `"csv"` is rejected by {@link OshaHoursListParams},
   * exactly as {@link ResponsesResource.flat} does. The escape hatch is still
   * typed by the contract — `flex.call("osha-hours.list", { format: "csv" })`
   * type-checks — but it throws `NovaraFlexTransportError` for the non-JSON
   * body.
   *
   * Every parameter is optional, so `flex.oshaHours.list()` is a valid call.
   * `establishment_ids` (from {@link EstablishmentsResource.list}), `year`, and
   * `months` (1–12) filter the records. This is one of the paged methods:
   * `limit` (1–1000, default 1000) caps the number of records in the response
   * body and `page` (1-based, default 1) selects the page.
   *
   * The response body is returned whole, so the `paging` metadata stays
   * reachable — `paging.total` counts records and `paging.last_page` counts
   * pages *at the requested `limit`*, so it changes when `limit` does.
   * {@link listAll} walks every page for you. The records themselves
   * arrive in an `hours` array, one entry per establishment and month; the
   * vendor documents no JSON example for this method, so the contract's item
   * shape comes from the live API.
   *
   * @see https://api.novaraflex.com/docs/method/osha-hours.list
   */
  list(
    params?: OshaHoursListParams,
    options?: NovaraFlexCallOptions,
  ): Promise<NovaraFlexResult<"osha-hours.list">> {
    return this.#client.call("osha-hours.list", params, options);
  }

  /**
   * Returns one page of recorded OSHA hours as a CSV document.
   *
   * It takes {@link list}'s parameters minus `format`
   * ({@link OshaHoursListCsvParams}): the SDK sends `format: "csv"` itself and
   * a caller cannot override it. Every parameter is optional, so
   * `flex.oshaHours.listCsv()` is a valid call; `limit` (1–1000, default 1000)
   * and `page` (1-based, default 1) page the export.
   *
   * Resolves to a {@link NovaraFlexCsvPage}: `csv` is the document exactly as
   * sent, never parsed, and `paging` is read from the `novaraflex-total-results`
   * and `novaraflex-last-page` response headers — the pair the live API sends
   * for this method, not the `kpaehs-` names the vendor's docs give. `paging`
   * is present only when both headers are non-negative integers; when either
   * is missing or malformed it is absent rather than guessed. One call fetches
   * one page; there is no CSV paginator.
   *
   * An error envelope throws `NovaraFlexApiError` as usual. A response that is
   * not `text/csv` — HTML, a JSON success, no content type — is a
   * `NovaraFlexTransportError` with `reason: "content_type"`. The request never
   * lets `fetch` follow a redirect by itself, as for
   * {@link ResponsesResource.flatCsv}. Timeout, retries, and rate-limit
   * handling are exactly {@link list}'s.
   *
   * @see https://api.novaraflex.com/docs/method/osha-hours.list
   */
  listCsv(
    params?: OshaHoursListCsvParams,
    options?: NovaraFlexCallOptions,
  ): Promise<NovaraFlexCsvPage> {
    // `format` is spread last so the caller can never turn this into JSON.
    return requestRaw(
      this.#client,
      "csv",
      "osha-hours.list",
      { ...params, format: "csv" },
      options,
    );
  }

  /**
   * Walks every page of {@link list}: `for await` yields each hours record, one
   * request per page, and `.pages()` yields each page's full success body
   * instead. It takes the same arguments as {@link list}, JSON only; `limit`
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
   * @see https://api.novaraflex.com/docs/method/osha-hours.list
   */
  listAll(
    params?: OshaHoursListParams,
    options?: NovaraFlexCallOptions,
  ): NovaraFlexPaginator<
    PagedItem<"osha-hours.list">,
    NovaraFlexResult<"osha-hours.list">
  > {
    return paginate(this.#client, "osha-hours.list", params, options);
  }
}
