/**
 * Public entry point for the `novara-flex-js` SDK.
 *
 * This module is the *only* public entry point of the package: everything that
 * consumers are allowed to use must be re-exported from here. Internal modules
 * are implementation details and are not part of the public API surface.
 */

/**
 * The configured client and its option, parameter, and result types, including
 * the results of the CSV methods (`NovaraFlexCsvPage`) and of
 * `flex.attachment.load()` (`NovaraFlexAttachment`).
 */
export {
  type NovaraFlexAttachment,
  type NovaraFlexCallOptions,
  type NovaraFlexCallRetryOptions,
  NovaraFlexClient,
  type NovaraFlexClientOptions,
  type NovaraFlexCsvPage,
  type NovaraFlexMethod,
  type NovaraFlexParams,
  type NovaraFlexRateLimitOptions,
  type NovaraFlexResult,
  type NovaraFlexRetryOptions,
} from "./client.js";
/** The error types every SDK failure is reported through. */
export {
  NovaraFlexApiError,
  type NovaraFlexApiErrorCode,
  NovaraFlexError,
  NovaraFlexRateLimitError,
  NovaraFlexTransportError,
  type NovaraFlexTransportErrorReason,
} from "./errors.js";
/** The lazy walk the `…All` companion methods return, e.g. `flex.projects.listAll()`. */
export type { NovaraFlexPaginator } from "./internal/paginate.js";
/** The package name and version. */
export { SDK_NAME, SDK_VERSION } from "./version.js";
