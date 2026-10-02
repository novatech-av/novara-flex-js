/**
 * The `dataload.*` area: bulk CSV synchronization of account records.
 *
 * This is the only area in the SDK with a **write** method. `dataload.create`
 * submits a CSV that Novara Flex applies to the account, and it can send email;
 * `dataload.info` polls the load it returned. Read the warning on
 * {@link DataLoadResource.create} before calling it.
 *
 * Reached through {@link NovaraFlexClient.dataload}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `dataload.*` Novara Flex methods, exposed as `flex.dataload`. */
export class DataLoadResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Submits a CSV data load. **This method writes: it MODIFIES ACCOUNT DATA**,
   * synchronizing employees or other supported records from the file, and it
   * **MAY SEND EMAIL** to every address passed in `failureEmails` and
   * `successEmails`.
   *
   * It is **not idempotent** — submitting the same file twice runs the
   * synchronization twice — so the SDK **never retries it automatically**, even
   * on a timeout, a network failure, or a 5xx: a failed attempt may still have
   * been applied on the server, and repeating it could sync twice or send the
   * email twice. Pass `retry: { idempotent: true }` in the options only if you
   * know this particular load is safe to repeat. It is the only write method
   * this SDK wraps; every other method is read-only, and {@link info} is
   * retried normally.
   *
   * The vendor requires **one of** `url` or `file`, which the contract cannot
   * express: `url` is a public or signed HTTPS URL to the CSV (a signed S3 URL
   * is what the vendor recommends), and `file` is the CSV inline as a
   * `data:text/csv;base64,` data URI, with a published limit of 12 MB. Because
   * both are optional in the contract, `flex.dataload.create()` with no
   * arguments type-checks; the SDK does no client-side validation and leaves
   * that rejection to the vendor. `adapter` selects the template applied to the
   * file, `name` is a display name for it, and `failureEmails` /
   * `successEmails` are the addresses notified when the load fails or finishes.
   *
   * The success body carries `dataload.id` — the id {@link info} takes to poll
   * the load's status.
   *
   * `url` and `file` can carry personal data. Like the token, they are never
   * logged and never placed in an error message or an error property.
   *
   * This SDK never exercises this method against a live account: it is
   * deliberately excluded from the live test suite, so its response shape is
   * modeled from the vendor's documentation and is **unverified against the
   * wire**.
   *
   * @see https://api.novaraflex.com/docs/method/dataload.create
   */
  create(
    ...rest: NovaraFlexCallArgs<"dataload.create">
  ): Promise<NovaraFlexResult<"dataload.create">> {
    return this.#client.call("dataload.create", ...rest);
  }

  /**
   * Returns the status of one submitted data load.
   *
   * `id` is required and is a **string** — the Mongo-style hex id from a
   * {@link create} result, not the integer id most other areas use. There is no
   * `dataload.list`, so an id can only come from a `create` call; an id that
   * names no load answers with the `content_not_found` error code.
   *
   * The result's `dataload` carries `status`, one of `dataload`,
   * `dataloading`, `dataloaded`, or `error`, plus a `history` string. Polling
   * this method is the way to follow a load submitted by {@link create}.
   *
   * @see https://api.novaraflex.com/docs/method/dataload.info
   */
  info(
    ...rest: NovaraFlexCallArgs<"dataload.info">
  ): Promise<NovaraFlexResult<"dataload.info">> {
    return this.#client.call("dataload.info", ...rest);
  }
}
