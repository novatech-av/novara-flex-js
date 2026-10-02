/**
 * The `attachment.*` area: the files users upload — follow-up photos, resource
 * documents, and the like.
 *
 * Reached through {@link NovaraFlexClient.attachment}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 *
 * `attachment.load` answers with a file rather than a JSON envelope, so it
 * does not delegate to `call`, which parses every body as JSON. It goes
 * through the same request loop by the internal channel in
 * `../internal/raw.ts` instead.
 */

import type {
  NovaraFlexAttachment,
  NovaraFlexCallOptions,
  NovaraFlexClient,
  NovaraFlexParams,
} from "../client.js";
import { requestRaw } from "../internal/raw.js";

/** The `attachment.*` Novara Flex methods, exposed as `flex.attachment`. */
export class AttachmentResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Downloads an uploaded attachment.
   *
   * `key` is required — the attachment's storage key, e.g. the `key` of an
   * entry in a follow-up message's `attachments` (from
   * {@link FollowupsResource.list}). Treat keys as sensitive: the SDK never
   * puts one in an error.
   *
   * Resolves to `{ data, contentType }`: the file as a `Blob` and the
   * `Content-Type` it was served with, exactly as sent. Any media type is
   * accepted — the vendor documents `application/octet-stream`,
   * `application/pdf`, `image/jpeg`, and `image/png`, but uploads come in more
   * — except `text/html` or a missing type, which are a
   * `NovaraFlexTransportError` with `reason: "content_type"`.
   *
   * **Buffered.** The whole file is read into memory before the promise
   * resolves, inside the request timeout, exactly as a JSON body is. That keeps
   * the timeout, retries, and error handling identical to every other method,
   * at the cost of holding the file in memory; raise `timeoutMs` for a large
   * file on a slow link.
   *
   * **Redirects.** The live API answers a known key with an HTTP 302 to the
   * file on another origin. The SDK follows up to five redirects itself, each
   * with a `GET` that carries no body and no headers, so the token in the POST
   * body is never re-sent to the redirect target — which `fetch` would do for
   * a 307 or 308. Only `https:` targets are followed (or `http:` when the
   * client's `baseUrl` is itself `http:`). A redirect that cannot be followed
   * safely is a `NovaraFlexTransportError` with
   * `reason: "http_status"`; that includes every redirect in a browser, where
   * `fetch` hides the target of a manual redirect. The target URL may be
   * signed, so it never appears in an error either.
   *
   * An unknown key answers with an error envelope — live, the code is
   * `invalid_key_for_customer` — which throws `NovaraFlexApiError`. A
   * transient failure is retried like any other read.
   *
   * @see https://api.novaraflex.com/docs/method/attachment.load
   */
  load(
    params: NovaraFlexParams<"attachment.load">,
    options?: NovaraFlexCallOptions,
  ): Promise<NovaraFlexAttachment> {
    return requestRaw(this.#client, "blob", "attachment.load", params, options);
  }
}
