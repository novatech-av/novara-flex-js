/**
 * The `responses.*` area: the submitted responses to a form.
 *
 * Reached through {@link NovaraFlexClient.responses}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 *
 * `responses.flat` serves JSON or CSV, so it has two wrappers, and neither
 * takes the vendor's parameters verbatim: {@link ResponsesResource.flat}
 * narrows `format` to JSON ({@link ResponsesFlatParams}), because `call` parses
 * every response body as JSON, and {@link ResponsesResource.flatCsv} drops
 * `format` and asks for CSV itself ({@link ResponsesFlatCsvParams}).
 */

import type {
  NovaraFlexCallArgs,
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

/** `responses.flat` parameters with `format` narrowed to JSON; {@link ResponsesResource.flatCsv} is the CSV route. */
export type ResponsesFlatParams = Omit<
  NovaraFlexParams<"responses.flat">,
  "format"
> & { format?: "json" };

/** `responses.flat` parameters without `format`: {@link ResponsesResource.flatCsv} always asks for CSV. */
export type ResponsesFlatCsvParams = Omit<
  NovaraFlexParams<"responses.flat">,
  "format"
>;

/** The `responses.*` Novara Flex methods, exposed as `flex.responses`. */
export class ResponsesResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns the responses to one form, sorted newest first.
   *
   * `form_id` is required — an integer, from {@link FormsResource.list}. This
   * is one of the paged methods: `limit` (1–500, default 10) caps the number of
   * responses in the response body and `page` (1-based, default 1) selects the
   * page. The vendor's own documentation contradicts itself about the maximum —
   * the prose says 100 while the parameter table says 500 — and the table is
   * right: the live API accepts 500 and rejects 501 with `parameter_invalid`.
   *
   * The filters are `observer_id` (a user id) and `followups` (`"all"` or
   * `"pending"`, to select responses by their pending follow-ups). The four
   * time bounds — `before` and `after` for submission, `updated_before` and
   * `updated_after` for revision — are Unix epoch times in **milliseconds**,
   * not seconds. `latest` (default false) adds the latest revision's details
   * such as answers, location, and weather, and `deleted` (default false)
   * switches the result set to the deleted responses.
   *
   * The response body is returned whole, so the `paging` metadata stays
   * reachable — `paging.total` counts responses and `paging.last_page` counts
   * pages *at the requested `limit`*, so it changes when `limit` does.
   * {@link listAll} walks every page for you.
   *
   * @see https://api.novaraflex.com/docs/method/responses.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"responses.list">
  ): Promise<NovaraFlexResult<"responses.list">> {
    return this.#client.call("responses.list", ...rest);
  }

  /**
   * Walks every page of {@link list}: `for await` yields each response, one
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
   * @see https://api.novaraflex.com/docs/method/responses.list
   */
  listAll(
    ...rest: NovaraFlexCallArgs<"responses.list">
  ): NovaraFlexPaginator<
    PagedItem<"responses.list">,
    NovaraFlexResult<"responses.list">
  > {
    return paginate(this.#client, "responses.list", ...rest);
  }

  /**
   * Returns one form response.
   *
   * `response_id` is required — an integer, from the `id` of a
   * {@link list} item. The result carries the response's `latest` revision,
   * with the answers the observer submitted.
   *
   * @see https://api.novaraflex.com/docs/method/responses.info
   */
  info(
    ...rest: NovaraFlexCallArgs<"responses.info">
  ): Promise<NovaraFlexResult<"responses.info">> {
    return this.#client.call("responses.info", ...rest);
  }

  /**
   * Returns flattened form responses — the spreadsheet export, as JSON.
   *
   * **JSON only; {@link flatCsv} is the CSV route.** The vendor method also
   * serves CSV, but {@link NovaraFlexClient.call} parses every body as JSON, so
   * this wrapper narrows `format` at the type level: `"json"` (the vendor's
   * default) is accepted and `"csv"` is rejected by {@link ResponsesFlatParams}.
   * The escape hatch is still typed by the contract —
   * `flex.call("responses.flat", { form_id, format: "csv" })` type-checks — but
   * it throws `NovaraFlexTransportError` for the non-JSON body.
   *
   * `form_id` is required — an integer, from {@link FormsResource.list}.
   * `limit` (1–1000, default 100) and `page` (1-based, default 1) page the
   * export, `observer_id` filters by user, `response_ids` selects specific
   * responses, `columns` narrows the columns fetched, and `deleted` (default
   * false) switches to the deleted responses. The four time bounds — `before`,
   * `after`, `updated_before`, and `updated_after` — are Unix epoch times in
   * **milliseconds**, not seconds. `force_date_format` renders dates as
   * `YYYY-MM-DD HH:mm:ss`.
   *
   * Two parameters concern the field-ID to field-title mapping row the export
   * puts first: `skip_field_id_mapping_json` omits it from the JSON output, and
   * `skip_field_id_mapping` is the CSV-only equivalent, so it is accepted here
   * (the contract documents it) but has no effect on a JSON call; it is
   * {@link flatCsv}'s to use.
   *
   * The response body is returned whole. Its `responses` array holds the
   * flattened rows, keyed by the form's own field identifiers, and `paging`
   * stays reachable alongside them. {@link flatAll} walks every page for you.
   *
   * @see https://api.novaraflex.com/docs/method/responses.flat
   */
  flat(
    params: ResponsesFlatParams,
    options?: NovaraFlexCallOptions,
  ): Promise<NovaraFlexResult<"responses.flat">> {
    return this.#client.call("responses.flat", params, options);
  }

  /**
   * Returns one page of flattened form responses as a CSV document — the
   * spreadsheet export as the vendor renders it.
   *
   * It takes {@link flat}'s parameters minus `format`
   * ({@link ResponsesFlatCsvParams}): the SDK sends `format: "csv"` itself and
   * a caller cannot override it. `form_id` is required; `limit` (1–1000,
   * default 100) and `page` (1-based, default 1) page the export, and
   * `skip_field_id_mapping` omits the field-ID to field-title mapping row the
   * CSV otherwise starts with. `skip_field_id_mapping_json` is the JSON-only
   * equivalent and has no effect here.
   *
   * Resolves to a {@link NovaraFlexCsvPage}: `csv` is the document exactly as
   * sent, never parsed, and `paging` is read from the `novaraflex-total-results`
   * and `novaraflex-last-page` response headers. `paging` is present only when
   * both headers are non-negative integers; when either is missing or
   * malformed it is absent rather than guessed. One call fetches one page;
   * there is no CSV paginator, so walk `page` up to `paging.last_page`
   * yourself.
   *
   * An error envelope throws `NovaraFlexApiError` as usual. A response that is
   * not `text/csv` — HTML, a JSON success, no content type — is a
   * `NovaraFlexTransportError` with `reason: "content_type"`. The request never
   * lets `fetch` follow a redirect by itself; see
   * {@link AttachmentResource.load} for how redirects are followed, though the
   * live API has not been seen to redirect this method. Timeout, retries, and
   * rate-limit handling are exactly {@link flat}'s.
   *
   * @see https://api.novaraflex.com/docs/method/responses.flat
   */
  flatCsv(
    params: ResponsesFlatCsvParams,
    options?: NovaraFlexCallOptions,
  ): Promise<NovaraFlexCsvPage> {
    // `format` is spread last so the caller can never turn this into JSON.
    return requestRaw(
      this.#client,
      "csv",
      "responses.flat",
      { ...params, format: "csv" },
      options,
    );
  }

  /**
   * Walks every page of {@link flat}: `for await` yields each response row, one
   * request per page, and `.pages()` yields each page's full success body
   * instead. It takes the same arguments as {@link flat}, JSON only; `limit`
   * defaults to the maximum, 1000, rather than the vendor's default, an
   * explicit `limit` is passed through untouched, and `page` (default 1) is
   * where the walk starts. Nothing is sent until the result is iterated, and
   * the call options apply to every page.
   *
   * The item iterator yields response rows only, never a mapping row. For the
   * column titles, iterate `.pages()` instead: unless
   * `skip_field_id_mapping_json` is true, each non-empty page's `responses[0]`
   * is that page's field-ID to field-title mapping row, and it covers only the
   * columns present on that page, so merge the rows of every page to get every
   * title:
   *
   * ```ts
   * const titles: Record<string, unknown> = {};
   * for await (const page of flex.responses.flatAll({ form_id }).pages()) {
   *   Object.assign(titles, page.responses?.[0]);
   * }
   * ```
   *
   * `.count()` answers how many items match with one request instead of a
   * walk: your filters apply, while `limit` and `page` are ignored.
   *
   * Records created or removed during a walk can shift items across page
   * boundaries: an item may be yielded twice or missed.
   * Nothing is deduplicated. For bulk walks, give the client a `rateLimit` such
   * as `{ requestsPerMinute: 40 }`. See {@link NovaraFlexPaginator}.
   *
   * @see https://api.novaraflex.com/docs/method/responses.flat
   */
  flatAll(
    params: ResponsesFlatParams,
    options?: NovaraFlexCallOptions,
  ): NovaraFlexPaginator<
    PagedItem<"responses.flat">,
    NovaraFlexResult<"responses.flat">
  > {
    return paginate(this.#client, "responses.flat", params, options);
  }
}
