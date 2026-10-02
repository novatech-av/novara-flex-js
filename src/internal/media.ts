/**
 * Pure rules for the responses that are not a JSON envelope: the CSV documents
 * of `responses.flat` and `osha-hours.list`, and the files `attachment.load`
 * leads to.
 *
 * Everything here is pure and does no I/O so the rules stay unit-testable; the
 * request loop that applies them lives in `NovaraFlexClient`.
 *
 * Nothing here is public API.
 */

/**
 * The paging headers the vendor sends with a CSV document, in place of the
 * JSON body's `paging` object. Confirmed on the live API 2026-09-29 for both
 * `responses.flat` and `osha-hours.list`. (`responses.flat` also sends
 * identical `iscout-` and `kpaehs-` pairs; `osha-hours.list` sends only this
 * one, despite the vendor's docs naming the `kpaehs-` pair for it.)
 */
export const CSV_TOTAL_HEADER = "novaraflex-total-results";
export const CSV_LAST_PAGE_HEADER = "novaraflex-last-page";

/** How many redirects one attempt follows before giving up. */
export const MAX_REDIRECTS = 5;

/** The statuses that redirect to a `Location`; `300`, `304`, … do not. */
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([
  301, 302, 303, 307, 308,
]);

/**
 * A media type that is safe to quote in an error message: `type/subtype`
 * built from token characters only, so a header can never smuggle anything
 * else into a message.
 */
const PRINTABLE_MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;

/**
 * The media type of a `Content-Type` header: lower-cased, parameters and
 * surrounding whitespace dropped, `""` when the header is absent or empty.
 * `"Text/CSV; charset=utf-8"` is `"text/csv"`.
 */
export function mediaTypeOf(contentType: string | null | undefined): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * `mediaType` when it may be quoted in an error message, else `undefined`: a
 * missing type, or anything that is not a plain `type/subtype`.
 */
export function printableMediaType(mediaType: string): string | undefined {
  return PRINTABLE_MEDIA_TYPE.test(mediaType) ? mediaType : undefined;
}

/** A header value that is a non-negative decimal integer, else `undefined`. */
function parseCount(value: string | null): number | undefined {
  const text = value?.trim();
  if (!text || !/^\d+$/.test(text)) return undefined;
  const count = Number(text);
  return Number.isSafeInteger(count) ? count : undefined;
}

/**
 * The paging of a CSV document, read from its two paging headers: present only
 * when both are non-negative integers, `undefined` when either is missing or
 * malformed.
 */
export function parseCsvPaging(
  headers: Headers,
): { total: number; last_page: number } | undefined {
  const total = parseCount(headers.get(CSV_TOTAL_HEADER));
  const lastPage = parseCount(headers.get(CSV_LAST_PAGE_HEADER));
  if (total === undefined || lastPage === undefined) return undefined;
  return { total, last_page: lastPage };
}

/** `true` for a status that redirects to its `Location`. */
export function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

/**
 * Where a redirect leads: `location` resolved against `from`, or `undefined`
 * when it is missing, does not parse, or uses a scheme the SDK will not
 * follow. `https:` is always allowed; `http:` only when `allowHttp` is set,
 * which the client does exactly when its own base URL is `http:`. Credentials
 * embedded in the URL are refused too.
 *
 * The result must never reach an error message or property: a redirect target
 * may be a signed URL, which is a credential.
 */
export function resolveRedirect(
  location: string | null,
  from: URL,
  allowHttp: boolean,
): URL | undefined {
  if (location === null || location.trim() === "") return undefined;
  let target: URL;
  try {
    target = new URL(location, from);
  } catch {
    return undefined;
  }
  const allowed =
    target.protocol === "https:" || (allowHttp && target.protocol === "http:");
  if (!allowed || target.username !== "" || target.password !== "") {
    return undefined;
  }
  return target;
}
