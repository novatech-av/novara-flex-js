/**
 * The paging engine behind every `…All` companion method (`flex.projects.listAll()`,
 * `flex.responses.flatAll()`, …).
 *
 * Nine vendor methods page with `limit` and a 1-based `page`, and answer with
 * their items in one array-valued key plus `paging: { total, last_page }`,
 * where `last_page` counts pages at the requested `limit`. {@link paginate}
 * walks those pages strictly one after another through
 * {@link NovaraFlexClient.call}, so every page gets the client's timeout,
 * retries, rate-limit cooldown, and opt-in throttle exactly as a single call
 * would. There is no throttle and no concurrency of its own.
 *
 * Only {@link NovaraFlexPaginator} is public (re-exported from `src/index.ts`
 * as a type). The table, the helper types, and the implementing class are
 * internal.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexCallOptions,
  NovaraFlexClient,
  NovaraFlexParams,
  NovaraFlexResult,
} from "../client.js";
import { NovaraFlexTransportError } from "../errors.js";

/**
 * A lazy walk over every page of a paged Novara Flex method, returned by the
 * `…All` companion methods such as `flex.projects.listAll()`.
 *
 * Creating one sends nothing. Iterating it with `for await` yields the items of
 * each page in order, fetching the next page only once the previous page's
 * items have been consumed; {@link pages} yields each page's full, untouched
 * success body instead, `paging` and any undocumented field included. Every
 * iteration — of the items or of `pages()` — starts its own fresh walk from
 * the starting page, and leaving a `for await` early (`break`, `return`, or a
 * throw) stops the walk without another request.
 *
 * Pages are fetched one at a time through `NovaraFlexClient.call`, so the
 * client's timeout, retries, and rate-limit handling apply to each page, and
 * the call options passed to the `…All` method (`signal`, `timeoutMs`,
 * `retry`) apply to every page. An aborted `signal` stops the walk with the
 * signal's reason, unchanged.
 *
 * A record created or removed while a walk is in progress shifts later records
 * across page boundaries: an item can then be yielded twice, or skipped.
 * Nothing is deduplicated.
 *
 * {@link count} answers how many items the walk would yield without walking:
 * it sends one request for a single item and reads `paging.total`.
 *
 * @typeParam Item - One element of the method's item array.
 * @typeParam Page - The method's full `ok: true` response body.
 */
export interface NovaraFlexPaginator<Item, Page> extends AsyncIterable<Item> {
  /** Yields each page's full success body, one request per page. */
  pages(): AsyncIterable<Page>;

  /**
   * Counts the matching items with exactly one request, never a walk.
   *
   * It sends the `…All` method's arguments with `limit: 1` and `page: 1` and
   * resolves to the response's `paging.total`. The caller's filters (such as
   * `form_id` or the time bounds `after` and `updated_after`) are honored, the
   * caller's `limit` and `page` are ignored, and the call options (`signal`,
   * `timeoutMs`, `retry`) apply to that one request, so it gets the client's
   * retries, rate-limit cooldown, and opt-in throttle like any other call.
   * Every call sends a fresh request; nothing is cached.
   *
   * @throws {NovaraFlexTransportError} with `reason: "invalid_envelope"` when
   * the response has no `paging` object or its `total` is not a non-negative
   * integer.
   */
  count(): Promise<number>;
}

/** The vendor methods that page with `limit`/`page` and have an `…All` companion. */
export type PagedMethod =
  | "projects.list"
  | "contractors.list"
  | "contractor-requirements.list"
  | "responses.list"
  | "responses.flat"
  | "followups.list"
  | "completedtrainings.v2.list"
  | "training-employee-status.list"
  | "osha-hours.list";

/**
 * The declared keys of `T` whose value is a required array. Index signatures
 * are dropped first: the success bodies allow additional properties, and
 * indexing by `string` would otherwise collapse the result.
 */
type ArrayKeys<T> = keyof {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : T[K] extends readonly unknown[]
        ? K
        : never]: unknown;
} &
  string;

/** How one paged method is walked. */
interface PagedMethodSpec<M extends PagedMethod> {
  /** The success body's key holding the page's items, checked against the contract. */
  readonly items: ArrayKeys<NovaraFlexResult<M>>;
  /** The largest `limit` the vendor accepts, requested when the caller omits `limit`. */
  readonly maxLimit: number;
}

/**
 * Where each paged method keeps its items and how large a page it allows.
 *
 * Every maximum was confirmed against the live API on 2026-09-29: the value
 * itself is accepted and one more is rejected with `parameter_invalid`.
 */
export const PAGED_METHODS = {
  "projects.list": { items: "projects", maxLimit: 500 },
  "contractors.list": { items: "contractors", maxLimit: 1000 },
  "contractor-requirements.list": { items: "requirements", maxLimit: 500 },
  "responses.list": { items: "responses", maxLimit: 500 },
  "responses.flat": { items: "responses", maxLimit: 1000 },
  "followups.list": { items: "followups", maxLimit: 500 },
  "completedtrainings.v2.list": {
    items: "completedtrainings",
    maxLimit: 1000,
  },
  "training-employee-status.list": { items: "employees", maxLimit: 1000 },
  "osha-hours.list": { items: "hours", maxLimit: 1000 },
} as const satisfies { readonly [M in PagedMethod]: PagedMethodSpec<M> };

/** One item of a paged method's item array, e.g. a `Project` for `projects.list`. */
export type PagedItem<M extends PagedMethod> =
  NovaraFlexResult<M>[(typeof PAGED_METHODS)[M]["items"] &
    keyof NovaraFlexResult<M>] extends readonly (infer Item)[]
    ? Item
    : never;

/**
 * Build the paginator for `method`. `rest` is what the `…All` method received:
 * the same `params` and `options` its paired wrapper takes. Nothing is sent
 * until the paginator is iterated.
 */
export function paginate<M extends PagedMethod>(
  client: NovaraFlexClient,
  method: M,
  ...rest: NovaraFlexCallArgs<M>
): NovaraFlexPaginator<PagedItem<M>, NovaraFlexResult<M>> {
  const [params, options] = rest as [
    NovaraFlexParams<M> | undefined,
    NovaraFlexCallOptions | undefined,
  ];
  return new Paginator(client, method, params, options);
}

/** The paging parameters every paged method shares. */
interface PagingParams {
  limit?: number;
  page?: number;
  skip_field_id_mapping_json?: boolean;
}

/** One fetched page: the untouched body and its validated item array. */
interface FetchedPage<M extends PagedMethod> {
  readonly body: NovaraFlexResult<M>;
  readonly items: readonly unknown[];
}

class Paginator<M extends PagedMethod>
  implements NovaraFlexPaginator<PagedItem<M>, NovaraFlexResult<M>>
{
  readonly #client: NovaraFlexClient;
  readonly #method: M;
  readonly #params: NovaraFlexParams<M> | undefined;
  readonly #options: NovaraFlexCallOptions | undefined;

  constructor(
    client: NovaraFlexClient,
    method: M,
    params: NovaraFlexParams<M> | undefined,
    options: NovaraFlexCallOptions | undefined,
  ) {
    this.#client = client;
    this.#method = method;
    this.#params = params;
    this.#options = options;
  }

  async *pages(): AsyncGenerator<NovaraFlexResult<M>, void, undefined> {
    for await (const page of this.#walk()) yield page.body;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<
    PagedItem<M>,
    void,
    undefined
  > {
    for await (const { items } of this.#walk()) {
      yield* items as readonly PagedItem<M>[];
    }
  }

  async count(): Promise<number> {
    const method = this.#method;
    this.#options?.signal?.throwIfAborted();
    const args = [
      { ...this.#params, limit: 1, page: 1 },
      this.#options,
    ] as unknown as NovaraFlexCallArgs<M>;
    const body = await this.#client.call(method, ...args);

    const paging: unknown = (body as Record<string, unknown>).paging;
    if (typeof paging !== "object" || paging === null) {
      throw new NovaraFlexTransportError(
        `Novara Flex ${method}: count has no "paging" object`,
        { method, reason: "invalid_envelope" },
      );
    }
    const total: unknown = (paging as Record<string, unknown>).total;
    if (
      typeof total !== "number" ||
      !Number.isSafeInteger(total) ||
      total < 0
    ) {
      throw new NovaraFlexTransportError(
        `Novara Flex ${method}: count has no non-negative integer "paging.total"`,
        { method, reason: "invalid_envelope" },
      );
    }
    return total;
  }

  /**
   * Fetch the pages in order, from the caller's `page` (default 1), with the
   * caller's `limit` or else the method's maximum. After each page, stop when
   * it held no items or when it was `paging.last_page` or later; a page
   * without `paging` is followed by the next one, and the first empty page
   * ends the walk.
   *
   * For `responses.flat`, unless `skip_field_id_mapping_json` is true, every
   * page leads with its own field-ID to field-title mapping row. That row is
   * not an item: it is left out of `items` on every page, the starting page's
   * included, so the item iterator yields response rows only, and it never
   * counts toward the empty-page rule. The page body keeps it at
   * `responses[0]`.
   */
  async *#walk(): AsyncGenerator<FetchedPage<M>, void, undefined> {
    const method = this.#method;
    const { items: key, maxLimit } = PAGED_METHODS[method];
    const params = (this.#params ?? {}) as PagingParams;
    const limit = params.limit ?? maxLimit;
    const signal = this.#options?.signal;
    const mappingRow =
      method === "responses.flat" && params.skip_field_id_mapping_json !== true;

    for (let page = params.page ?? 1; ; page++) {
      signal?.throwIfAborted();
      const args = [
        { ...params, limit, page },
        this.#options,
      ] as unknown as NovaraFlexCallArgs<M>;
      const body = await this.#client.call(method, ...args);

      const rows: unknown = (body as Record<string, unknown>)[key];
      if (!Array.isArray(rows)) {
        throw new NovaraFlexTransportError(
          `Novara Flex ${method}: page ${page} has no "${key}" array`,
          { method, reason: "invalid_envelope" },
        );
      }
      const dataRows = mappingRow ? rows.slice(1) : rows;
      yield { body, items: dataRows };

      if (dataRows.length === 0) return;
      const lastPage = (body as { paging?: { last_page?: unknown } }).paging
        ?.last_page;
      if (typeof lastPage === "number" && page >= lastPage) return;
    }
  }
}
