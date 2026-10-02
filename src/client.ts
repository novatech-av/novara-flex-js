/**
 * The core Novara Flex client.
 *
 * Novara Flex is a method-per-path JSON-over-POST API: every call is a `POST`
 * to `${baseUrl}/${method}` whose body carries the API token alongside the
 * method parameters, and every response arrives as `HTTP 200` regardless of
 * outcome. {@link NovaraFlexClient} owns that shape so that consumers never
 * touch the generated contract types or the token plumbing.
 *
 * {@link NovaraFlexClient.call} is the low-level surface: it reaches every
 * method in the contract by name. On top of it the client exposes one
 * namespace property per API area — `flex.api.ping()`, `flex.account.info()` —
 * built from the thin resource classes in `./resources/`. `call` stays the
 * escape hatch for any method a later vendor release adds before it has a
 * wrapper.
 *
 * `call` parses every body as JSON. The three methods that answer with
 * something else — the CSV documents of `responses.flat` and `osha-hours.list`,
 * and the file behind `attachment.load` — are reached through their resource
 * methods (`flex.responses.flatCsv()`, `flex.oshaHours.listCsv()`,
 * `flex.attachment.load()`), which share `call`'s request loop through the
 * internal channel in `./internal/raw.ts`. Those requests never let `fetch`
 * follow a redirect on its own: a 307 or 308 would re-send the POST body, and
 * with it the token, to the redirect target.
 *
 * Every attempt is bounded by a request timeout (60 s by default,
 * configurable per client and per call) that covers the whole attempt, body
 * included. A read-only method that fails transiently — a timeout, a network
 * failure, an HTTP 5xx, a `server_error` envelope — is retried with jittered
 * exponential backoff (twice by default); a write is never retried unless the
 * call asserts it is safe to repeat. A caller can also cancel a request,
 * including any wait before it, by passing an `AbortSignal`.
 *
 * The vendor's rate limit — an HTTP 429 or a `rate_limit_exceeded` envelope —
 * surfaces as a {@link NovaraFlexRateLimitError}. A read waits out the penalty
 * window and retries once; every call on the client pauses until that window
 * has passed; and an opt-in throttle spaces request starts evenly. All three
 * bound this client instance only: the vendor's pool is shared by every token
 * and integration of the customer.
 */

import {
  NovaraFlexApiError,
  NovaraFlexRateLimitError,
  NovaraFlexTransportError,
} from "./errors.js";
import type {
  NovaraMethodName,
  NovaraRequestFor,
  NovaraSuccessFor,
} from "./internal/contract.js";
import {
  classifyEnvelope,
  type EnvelopeClassification,
} from "./internal/envelope.js";
import {
  isRedirectStatus,
  MAX_REDIRECTS,
  mediaTypeOf,
  parseCsvPaging,
  printableMediaType,
  resolveRedirect,
} from "./internal/media.js";
import {
  type RawResponseMode,
  type RawResult,
  registerRawRequester,
} from "./internal/raw.js";
import {
  DEFAULT_RETRY_SETTINGS,
  isIdempotentMethod,
  isRetryableError,
  parseRetryAfter,
  type RetrySettings,
  rateLimitCooldownMs,
  rateLimitRetryDelayMs,
  resolveRetrySettings,
  retryDelayMs,
} from "./internal/retry.js";
import { Throttle } from "./internal/throttle.js";
import {
  AccountResource,
  AcknowledgmentsResource,
  ApiResource,
  AttachmentResource,
  CompaniesResource,
  CompletedTrainingsResource,
  ContractorContactsResource,
  ContractorRequirementsResource,
  ContractorsResource,
  DataListItemsResource,
  DataListsResource,
  DataLoadResource,
  DriverQualificationsResource,
  EquipmentsResource,
  EquipmentTypesResource,
  EstablishmentsResource,
  FieldOfficesResource,
  FollowupsResource,
  FormFoldersResource,
  FormsResource,
  GroupTrainingsResource,
  InspectionsResource,
  JobTitlesResource,
  LinesOfBusinessResource,
  OshaHoursResource,
  ProjectsResource,
  ResourcesResource,
  ResourceTagsResource,
  ResponsesResource,
  RolesResource,
  TrainingEmployeeStatusResource,
  TrainingsResource,
  UsersResource,
} from "./resources/index.js";
import { SDK_NAME, SDK_VERSION } from "./version.js";

/** The default Novara Flex API base URL. */
const DEFAULT_BASE_URL = "https://api.novaraflex.com/v1";

/** The response header carrying the vendor's request identifier. */
const REQUEST_ID_HEADER = "HZS-Request-ID";

/** The response header in which a server asks the client to wait. */
const RETRY_AFTER_HEADER = "Retry-After";

/**
 * The default request timeout. The live API has been seen answering ordinary
 * calls in 25-38 s (2026-09-20), so 30 s would fail real calls, while 60 s
 * still bounds a request that hangs outright (the live API has stalled on
 * calls that never answered until retried).
 */
const DEFAULT_TIMEOUT_MS = 60_000;

/** The longest delay `setTimeout` accepts: 2^31 - 1 ms, about 24.8 days. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** The highest `rateLimit.requestsPerMinute` accepted: 100 a second. */
const MAX_REQUESTS_PER_MINUTE = 6_000;

/**
 * What an invalid per-call option's `TypeError` starts with. It names the
 * options type, not a method, because `call`, every wrapper, every paginator,
 * and the non-JSON methods all share this check.
 */
const CALL_OPTIONS_PREFIX = "NovaraFlexCallOptions.";

/**
 * Validate the `rateLimit` option and build its throttle: `undefined` or
 * `false` means no throttle.
 */
function createThrottle(option: unknown): Throttle | undefined {
  if (option === undefined || option === false) return undefined;
  const requestsPerMinute =
    typeof option === "object" && option !== null
      ? (option as Record<string, unknown>).requestsPerMinute
      : undefined;
  if (
    typeof requestsPerMinute !== "number" ||
    !Number.isFinite(requestsPerMinute) ||
    requestsPerMinute <= 0 ||
    requestsPerMinute > MAX_REQUESTS_PER_MINUTE
  ) {
    throw new TypeError(
      `NovaraFlexClient rateLimit must be false or { requestsPerMinute } with a finite number greater than 0 and no greater than ${MAX_REQUESTS_PER_MINUTE}`,
    );
  }
  return new Throttle(requestsPerMinute);
}

/** `0` and `Infinity` disable the timeout; otherwise a finite positive delay `setTimeout` can honour. */
function isValidTimeout(value: unknown): value is number {
  return (
    value === 0 ||
    value === Number.POSITIVE_INFINITY ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0 &&
      value <= MAX_TIMEOUT_MS)
  );
}

/**
 * The `TypeError` message for an out-of-range `timeoutMs`. `prefix` is the
 * text before the property name, separator included: `"NovaraFlexClient "`
 * or `"NovaraFlexCallOptions."`.
 */
function invalidTimeoutMessage(prefix: string): string {
  return `${prefix}timeoutMs must be a positive number of milliseconds no greater than ${MAX_TIMEOUT_MS}; use Infinity or 0 to disable the timeout`;
}

/**
 * Wait `ms`, or reject with the signal's reason, unchanged, the moment
 * `signal` aborts. The timer never outlives the wait.
 */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** What a request expects back: a JSON envelope, a CSV document, or a file. */
type ResponseMode = "json" | RawResponseMode;

/** The `Accept` header sent for each response mode. */
const ACCEPT: Readonly<Record<ResponseMode, string>> = {
  json: "application/json",
  csv: "text/csv, application/json",
  blob: "*/*",
};

/** What one attempt saw of the response, for the retry loop. */
interface AttemptMeta {
  /** The `Retry-After` header, once a response has arrived. */
  retryAfter?: string | null;
}

/**
 * How transient failures are retried. Every field is optional and falls back
 * to the client's setting, then to the default.
 */
export interface NovaraFlexRetryOptions {
  /**
   * Extra attempts after the first. Default `2`. An integer from 0 to 10; `0`
   * disables retries.
   */
  maxRetries?: number;
  /**
   * The backoff base in milliseconds. Default `500`. Retry `n` waits a random
   * delay below `min(maxDelayMs, baseDelayMs * 2 ** (n - 1))`.
   */
  baseDelayMs?: number;
  /** The backoff cap in milliseconds. Default `10_000`. */
  maxDelayMs?: number;
  /**
   * How long a rate-limited read waits before its one retry when the response
   * carries no `Retry-After`, and how long a rate limit pauses every call on
   * the client, in milliseconds. Default `60_000`, the vendor's documented
   * penalty window; the retry adds up to 10 % (at most 5 s) of jitter. `0`
   * with no `Retry-After` means neither waits.
   */
  rateLimitDelayMs?: number;
}

/** Per-call retry options: the client's, plus an idempotency override. */
export interface NovaraFlexCallRetryOptions extends NovaraFlexRetryOptions {
  /**
   * Overrides the method's idempotency for this call only. `true` asserts the
   * call is safe to repeat and enables retries for a method outside the read
   * allowlist (e.g. `dataload.create`); `false` disables retries for this call
   * even for a read.
   */
  idempotent?: boolean;
}

/**
 * The opt-in client-side throttle: request starts are spaced at least
 * `60_000 / requestsPerMinute` ms apart, in first-in, first-out order.
 */
export interface NovaraFlexRateLimitOptions {
  /**
   * The most requests this client starts per minute: a finite number greater
   * than 0 and no greater than 6000. Retries count too. Choose it well below
   * the vendor's roughly 80 a minute, which every integration of the customer
   * shares — for example 40.
   */
  requestsPerMinute: number;
}

/** Configuration for a {@link NovaraFlexClient}. */
export interface NovaraFlexClientOptions {
  /** Novara Flex API token. Sent in every request body. Never logged or included in errors. */
  token: string;
  /** Defaults to `"https://api.novaraflex.com/v1"`. Trailing slashes are stripped. */
  baseUrl?: string;
  /** Defaults to `globalThis.fetch`. Provided for testing and custom transports. */
  fetch?: typeof globalThis.fetch;
  /**
   * How long one attempt may take, in milliseconds, before it fails with a
   * {@link NovaraFlexTransportError} whose `reason` is `"timeout"`. The bound
   * covers the whole attempt, including reading the response body, and applies
   * to each retry afresh rather than to the call as a whole. `0` or
   * `Infinity` disables it; anything else must be a positive number no greater
   * than 2147483647 (the longest delay `setTimeout` accepts), or the
   * constructor throws a `TypeError`. {@link NovaraFlexCallOptions.timeoutMs}
   * overrides it per call.
   *
   * Defaults to `60_000` (60 s). The live API has been seen answering ordinary
   * calls in 25-38 s (2026-09-20), so 30 s would fail real calls, while 60 s
   * still bounds a request that hangs outright (the live API has stalled on
   * calls that never answered until retried).
   */
  timeoutMs?: number;
  /**
   * How transient failures of read-only methods are retried; see
   * {@link NovaraFlexRetryOptions}. Defaults to 2 retries with full-jitter
   * exponential backoff from 500 ms, capped at 10 s. Only methods named
   * `*.list`, `*.info`, `*.ping`, `*.echo`, `*.flat`, or `*.load` are retried:
   * every method is a `POST`, a failed write may already have been applied, and the
   * vendor has no idempotency key. There is deliberately no client-wide way to
   * retry writes; see {@link NovaraFlexCallRetryOptions.idempotent}. An
   * invalid value makes the constructor throw a `TypeError`.
   *
   * A rate limit is treated apart: a read waits out `rateLimitDelayMs` (or a
   * `Retry-After`) and retries **once**, and every call on this client pauses
   * until that window has passed, writes included.
   */
  retry?: NovaraFlexRetryOptions;
  /**
   * An opt-in throttle, off by default: `{ requestsPerMinute }` spaces request
   * starts at least `60_000 / requestsPerMinute` ms apart, retries included;
   * `false` or omitted leaves requests unthrottled. An invalid value makes the
   * constructor throw a `TypeError`.
   *
   * The vendor allows about 80 requests a minute **per customer**, shared by
   * every token, process, and integration. This throttle bounds only this one
   * client instance, so it cannot guarantee compliance on its own. Pick a
   * budget well below the vendor's maximum that leaves headroom for the
   * customer's other integrations — for example `{ requestsPerMinute: 40 }`.
   */
  rateLimit?: NovaraFlexRateLimitOptions | false;
}

/** Per-call options. */
export interface NovaraFlexCallOptions {
  /**
   * Aborts the in-flight request, the wait before a retry, or the wait for a
   * rate-limit cooldown or a throttle slot. Once this signal
   * has aborted, the rejection is rethrown unchanged — the `AbortError`, or
   * whatever custom reason was passed to `abort()` — even when a timeout is
   * also configured, so cancellation stays distinguishable from a transport
   * failure, and no further attempt is made.
   */
  signal?: AbortSignal;
  /**
   * Overrides the client's {@link NovaraFlexClientOptions.timeoutMs} for this
   * call, with the same rules: `0` or `Infinity` disables the timeout, and an
   * invalid value rejects with a `TypeError` before any request is sent. Like
   * the client's, it bounds each attempt, not the call as a whole.
   */
  timeoutMs?: number;
  /**
   * Overrides the client's {@link NovaraFlexClientOptions.retry} field by
   * field for this call, and can override the method's idempotency with
   * {@link NovaraFlexCallRetryOptions.idempotent}. An invalid value rejects
   * with a `TypeError` before any request is sent.
   */
  retry?: NovaraFlexCallRetryOptions;
}

/** A Novara Flex method name, without a leading slash, e.g. `"api.ping"`. */
export type NovaraFlexMethod = NovaraMethodName;

/** The parameters a method accepts, minus the token the client supplies. */
export type NovaraFlexParams<M extends NovaraFlexMethod> = Omit<
  NovaraRequestFor<M>,
  "token"
>;

/** The successful (`ok: true`) response body of a method. */
export type NovaraFlexResult<M extends NovaraFlexMethod> = NovaraSuccessFor<M>;

/**
 * The trailing arguments of {@link NovaraFlexClient.call}: `params` is optional
 * exactly when every parameter of the method is optional.
 *
 * Exported so the resource classes in `./resources/` can reuse the rule and so
 * their declaration emit can name it. It is deliberately *not* re-exported from
 * `src/index.ts`.
 */
export type NovaraFlexCallArgs<M extends NovaraFlexMethod> =
  // biome-ignore lint/complexity/noBannedTypes: `{} extends T` is the idiomatic "every property is optional" test.
  {} extends NovaraFlexParams<M>
    ? [params?: NovaraFlexParams<M>, options?: NovaraFlexCallOptions]
    : [params: NovaraFlexParams<M>, options?: NovaraFlexCallOptions];

/**
 * One page of a CSV export: what `flex.responses.flatCsv()` and
 * `flex.oshaHours.listCsv()` resolve to.
 */
export interface NovaraFlexCsvPage {
  /** The CSV document, exactly as the server sent it. Never parsed. */
  csv: string;
  /**
   * The page's paging metadata, read from the `novaraflex-total-results` and
   * `novaraflex-last-page` response headers, since a CSV document has no
   * `paging` object of its own. Present only when both headers are
   * non-negative integers; absent when either is missing or malformed. As in
   * JSON, `last_page` counts pages *at the requested `limit`*.
   */
  paging?: { total: number; last_page: number };
}

/** An attachment file: what `flex.attachment.load()` resolves to. */
export interface NovaraFlexAttachment {
  /** The file's bytes, read in full. */
  data: Blob;
  /**
   * The `Content-Type` header of the response that carried the file, exactly
   * as sent, parameters included (e.g. `"image/jpeg"`).
   */
  contentType: string;
}

/**
 * A configured Novara Flex API client.
 *
 * @example
 * ```ts
 * const flex = new NovaraFlexClient({ token: process.env.NOVARA_FLEX_TOKEN! });
 * const pong = await flex.api.ping();
 * const account = await flex.call("account.info");
 * ```
 */
export class NovaraFlexClient {
  /** The base URL every request is issued against, without a trailing slash. */
  readonly baseUrl: string;

  /** The `account.*` methods: {@link AccountResource.info}. */
  readonly account: AccountResource;

  /**
   * The `acknowledgments.*` methods: {@link AcknowledgmentsResource.list},
   * {@link AcknowledgmentsResource.info}.
   */
  readonly acknowledgments: AcknowledgmentsResource;

  /** The `api.*` methods: {@link ApiResource.ping}, {@link ApiResource.echo}. */
  readonly api: ApiResource;

  /**
   * The `attachment.*` methods: {@link AttachmentResource.load}, which
   * downloads an uploaded file.
   */
  readonly attachment: AttachmentResource;

  /** The `companies.*` methods: {@link CompaniesResource.list}. */
  readonly companies: CompaniesResource;

  /**
   * The `completedtrainings.*` methods:
   * {@link CompletedTrainingsResource.list}, which calls the vendor's versioned
   * `completedtrainings.v2.list`.
   */
  readonly completedtrainings: CompletedTrainingsResource;

  /**
   * The `contractor-contacts.*` methods:
   * {@link ContractorContactsResource.list}. Camel-cased because the vendor's
   * hyphenated area name cannot be a dotted property.
   */
  readonly contractorContacts: ContractorContactsResource;

  /**
   * The contractor requirement methods:
   * {@link ContractorRequirementsResource.list} (`contractor-requirements.list`)
   * and {@link ContractorRequirementsResource.info}, which calls the vendor's
   * singular `contractor-requirement.info`.
   */
  readonly contractorRequirements: ContractorRequirementsResource;

  /** The `contractors.*` methods: {@link ContractorsResource.list}. */
  readonly contractors: ContractorsResource;

  /** The `datalistitems.*` methods: {@link DataListItemsResource.list}. */
  readonly datalistitems: DataListItemsResource;

  /** The `datalists.*` methods: {@link DataListsResource.list}. */
  readonly datalists: DataListsResource;

  /**
   * The `dataload.*` methods: {@link DataLoadResource.create},
   * {@link DataLoadResource.info}. `create` is the SDK's only **write**
   * method — it synchronizes account records from a CSV and can send email.
   */
  readonly dataload: DataLoadResource;

  /**
   * The `driver-qualifications.*` methods:
   * {@link DriverQualificationsResource.list}. Camel-cased because the vendor's
   * hyphenated area name cannot be a dotted property.
   */
  readonly driverQualifications: DriverQualificationsResource;

  /** The `equipments.*` methods: {@link EquipmentsResource.list}. */
  readonly equipments: EquipmentsResource;

  /** The `equipmenttypes.*` methods: {@link EquipmentTypesResource.list}. */
  readonly equipmenttypes: EquipmentTypesResource;

  /**
   * The `establishments.*` methods: {@link EstablishmentsResource.list},
   * {@link EstablishmentsResource.info}. The vendor labels this area coming
   * soon.
   */
  readonly establishments: EstablishmentsResource;

  /** The `fieldoffices.*` methods: {@link FieldOfficesResource.list}. */
  readonly fieldoffices: FieldOfficesResource;

  /** The `followups.*` methods: {@link FollowupsResource.list}. */
  readonly followups: FollowupsResource;

  /** The `formfolders.*` methods: {@link FormFoldersResource.list}. */
  readonly formfolders: FormFoldersResource;

  /** The `forms.*` methods: {@link FormsResource.list}, {@link FormsResource.info}. */
  readonly forms: FormsResource;

  /** The `grouptrainings.*` methods: {@link GroupTrainingsResource.list}. */
  readonly grouptrainings: GroupTrainingsResource;

  /** The `inspections.*` methods: {@link InspectionsResource.list}. */
  readonly inspections: InspectionsResource;

  /** The `jobtitles.*` methods: {@link JobTitlesResource.list}. */
  readonly jobtitles: JobTitlesResource;

  /** The `linesofbusiness.*` methods: {@link LinesOfBusinessResource.list}. */
  readonly linesofbusiness: LinesOfBusinessResource;

  /**
   * The `osha-hours.*` methods: {@link OshaHoursResource.list}. Camel-cased
   * because the vendor's hyphenated area name cannot be a dotted property.
   */
  readonly oshaHours: OshaHoursResource;

  /** The `projects.*` methods: {@link ProjectsResource.list}, {@link ProjectsResource.info}. */
  readonly projects: ProjectsResource;

  /** The `resources.*` methods: {@link ResourcesResource.list}. */
  readonly resources: ResourcesResource;

  /**
   * The `resourcetags.*` methods: {@link ResourceTagsResource.list}. The
   * vendor's prose calls these categories; the wire names them tags.
   */
  readonly resourcetags: ResourceTagsResource;

  /**
   * The `responses.*` methods: {@link ResponsesResource.list},
   * {@link ResponsesResource.info}, {@link ResponsesResource.flat}.
   */
  readonly responses: ResponsesResource;

  /** The `roles.*` methods: {@link RolesResource.list}. */
  readonly roles: RolesResource;

  /**
   * The `training-employee-status.*` methods:
   * {@link TrainingEmployeeStatusResource.list}. Camel-cased because the
   * vendor's hyphenated area name cannot be a dotted property.
   */
  readonly trainingEmployeeStatus: TrainingEmployeeStatusResource;

  /**
   * The `trainings.*` methods: {@link TrainingsResource.list}, which calls the
   * vendor's versioned `trainings.v2.list`.
   */
  readonly trainings: TrainingsResource;

  /** The `users.*` methods: {@link UsersResource.list}, {@link UsersResource.info}. */
  readonly users: UsersResource;

  /**
   * The API token. A true private field, so it is invisible to
   * `JSON.stringify`, `Object.keys`, and console inspection.
   */
  readonly #token: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  readonly #retry: RetrySettings;
  readonly #throttle: Throttle | undefined;
  /**
   * No attempt starts before this time (a `Date.now()` value): pushed out by
   * every rate limit any call on this client meets. It covers this instance
   * only.
   */
  #cooldownUntil = 0;

  constructor(options: NovaraFlexClientOptions) {
    if (typeof options?.token !== "string" || options.token.length === 0) {
      throw new TypeError("NovaraFlexClient requires a non-empty token");
    }
    if (options.baseUrl !== undefined) {
      if (typeof options.baseUrl !== "string" || options.baseUrl.length === 0) {
        throw new TypeError(
          "NovaraFlexClient baseUrl must be a non-empty string",
        );
      }
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError(
        "NovaraFlexClient requires a fetch implementation: this runtime has no global fetch, so pass one as options.fetch",
      );
    }
    if (options.timeoutMs !== undefined && !isValidTimeout(options.timeoutMs)) {
      throw new TypeError(invalidTimeoutMessage("NovaraFlexClient "));
    }
    const retry = resolveRetrySettings(
      DEFAULT_RETRY_SETTINGS,
      options.retry,
      "NovaraFlexClient ",
    );
    const throttle = createThrottle(options.rateLimit);
    this.#token = options.token;
    this.#fetch = fetchImpl;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#retry = retry;
    this.#throttle = throttle;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.account = new AccountResource(this);
    this.acknowledgments = new AcknowledgmentsResource(this);
    this.api = new ApiResource(this);
    this.attachment = new AttachmentResource(this);
    this.companies = new CompaniesResource(this);
    this.completedtrainings = new CompletedTrainingsResource(this);
    this.contractorContacts = new ContractorContactsResource(this);
    this.contractorRequirements = new ContractorRequirementsResource(this);
    this.contractors = new ContractorsResource(this);
    this.datalistitems = new DataListItemsResource(this);
    this.datalists = new DataListsResource(this);
    this.dataload = new DataLoadResource(this);
    this.driverQualifications = new DriverQualificationsResource(this);
    this.equipments = new EquipmentsResource(this);
    this.equipmenttypes = new EquipmentTypesResource(this);
    this.establishments = new EstablishmentsResource(this);
    this.fieldoffices = new FieldOfficesResource(this);
    this.followups = new FollowupsResource(this);
    this.formfolders = new FormFoldersResource(this);
    this.forms = new FormsResource(this);
    this.grouptrainings = new GroupTrainingsResource(this);
    this.inspections = new InspectionsResource(this);
    this.jobtitles = new JobTitlesResource(this);
    this.linesofbusiness = new LinesOfBusinessResource(this);
    this.oshaHours = new OshaHoursResource(this);
    this.projects = new ProjectsResource(this);
    this.resources = new ResourcesResource(this);
    this.resourcetags = new ResourceTagsResource(this);
    this.responses = new ResponsesResource(this);
    this.roles = new RolesResource(this);
    this.trainingEmployeeStatus = new TrainingEmployeeStatusResource(this);
    this.trainings = new TrainingsResource(this);
    this.users = new UsersResource(this);
    // The non-JSON methods reach the request loop through this closure, so it
    // needs no member on the client's declared surface.
    registerRawRequester(
      this,
      <K extends RawResponseMode>(
        mode: K,
        method: NovaraFlexMethod,
        params: object | undefined,
        options: NovaraFlexCallOptions | undefined,
      ) =>
        this.#request(mode, method, params, options) as Promise<RawResult<K>>,
    );
  }

  /**
   * Call a Novara Flex method.
   *
   * The token is injected automatically and cannot be overridden by `params`.
   * This is the escape hatch for methods that have no namespace wrapper yet;
   * `flex.api.ping()` and `flex.call("api.ping")` are otherwise equivalent.
   *
   * Every body is parsed as JSON, so a CSV document or a file surfaces as a
   * {@link NovaraFlexTransportError}; use `flex.responses.flatCsv()`,
   * `flex.oshaHours.listCsv()`, or `flex.attachment.load()` for those.
   *
   * Each attempt is bounded by the client's `timeoutMs`, or the per-call
   * override, including the time spent reading the response body. A read-only
   * method that fails transiently is retried per the `retry` options, waiting
   * out a `Retry-After` of up to 60 s; the error thrown is the last failure,
   * and its `attempts` says how many were made. A rate limit is retried at
   * most once, after `rateLimitDelayMs` or the `Retry-After`, and pauses every
   * call on the client for that long. Every attempt first waits out that
   * pause, then for a slot from the `rateLimit` throttle when one is set;
   * neither wait counts toward the timeout. If the caller's own `signal`
   * aborts, during a request or any of these waits, that rejection is
   * rethrown unchanged and no further attempt is made.
   *
   * @throws {NovaraFlexRateLimitError} on an HTTP 429 or a
   *   `rate_limit_exceeded` envelope.
   * @throws {NovaraFlexApiError} when Novara Flex answers with `ok: false`.
   * @throws {NovaraFlexTransportError} when no well-formed envelope came back,
   *   including when the timeout fired; `reason` says which.
   * @throws {TypeError} when `options.timeoutMs` or `options.retry` is invalid.
   */
  call<M extends NovaraFlexMethod>(
    method: M,
    ...rest: NovaraFlexCallArgs<M>
  ): Promise<NovaraFlexResult<M>> {
    const [params, options] = rest as [
      NovaraFlexParams<M> | undefined,
      NovaraFlexCallOptions | undefined,
    ];
    return this.#request("json", method, params, options) as Promise<
      NovaraFlexResult<M>
    >;
  }

  /**
   * The request loop behind `call` and the non-JSON methods: validate the
   * options, then attempt, gate, and retry until an attempt succeeds or a
   * failure is final. `mode` only changes how an attempt reads the response.
   */
  async #request(
    mode: ResponseMode,
    method: NovaraFlexMethod,
    params: object | undefined,
    options: NovaraFlexCallOptions | undefined,
  ): Promise<unknown> {
    if (
      options?.timeoutMs !== undefined &&
      !isValidTimeout(options.timeoutMs)
    ) {
      throw new TypeError(invalidTimeoutMessage(CALL_OPTIONS_PREFIX));
    }
    const retry = resolveRetrySettings(
      this.#retry,
      options?.retry,
      CALL_OPTIONS_PREFIX,
    );
    const idempotent = options?.retry?.idempotent;
    if (idempotent !== undefined && typeof idempotent !== "boolean") {
      throw new TypeError(
        `${CALL_OPTIONS_PREFIX}retry.idempotent must be a boolean`,
      );
    }
    const maxRetries =
      (idempotent ?? isIdempotentMethod(method)) ? retry.maxRetries : 0;
    const timeoutMs = options?.timeoutMs ?? this.#timeoutMs;
    const callerSignal = options?.signal;
    // `token` is spread last so a caller-supplied `token` can never win.
    const body = JSON.stringify({ ...params, token: this.#token });

    let rateLimitRetries = 0;
    for (let attempt = 1; ; attempt++) {
      // Skipped when there is nothing to wait for, so an idle client still
      // sends synchronously.
      if (this.#throttle || this.#cooldownUntil > Date.now()) {
        await this.#gate(callerSignal);
      }
      const meta: AttemptMeta = {};
      try {
        return await this.#attempt(mode, method, body, {
          attempt,
          timeoutMs,
          callerSignal,
          meta,
        });
      } catch (error) {
        let delay: number | undefined;
        if (error instanceof NovaraFlexRateLimitError) {
          // Every rate limit pauses the whole client, retried or not.
          this.#cooldownUntil = Math.max(
            this.#cooldownUntil,
            Date.now() + rateLimitCooldownMs(error.retryAfterMs, retry),
          );
          if (attempt <= maxRetries) {
            delay = rateLimitRetryDelayMs(
              error.retryAfterMs,
              rateLimitRetries,
              retry,
            );
            rateLimitRetries += 1;
          }
        } else if (attempt <= maxRetries && isRetryableError(error)) {
          delay = retryDelayMs(attempt, retry, meta.retryAfter);
        }
        if (delay === undefined) throw error;
        // Rejects with the caller's reason, unchanged, if it aborts meanwhile.
        await sleep(delay, callerSignal);
        callerSignal?.throwIfAborted();
      }
    }
  }

  /**
   * Wait until this attempt may be sent: first until the client's rate-limit
   * cooldown has passed — rechecked on waking, since another call may have
   * extended it meanwhile — then for a throttle slot. A slot granted while a
   * new cooldown began is given up and the wait starts over, so no request is
   * sent inside a cooldown and the spacing holds after it. Rejects with the
   * caller's reason, unchanged, if `signal` aborts.
   */
  async #gate(signal: AbortSignal | undefined): Promise<void> {
    for (;;) {
      for (
        let wait = this.#cooldownUntil - Date.now();
        wait > 0;
        wait = this.#cooldownUntil - Date.now()
      ) {
        await sleep(wait, signal);
      }
      if (!this.#throttle) return;
      await this.#throttle.acquire(signal);
      if (this.#cooldownUntil <= Date.now()) return;
    }
  }

  /**
   * One request: POST, read, and classify. Every failure is thrown as the
   * error `call` would report, stamped with `attempt`; `meta` receives what
   * the retry loop needs from the response.
   *
   * In `"json"` mode this is `call`'s attempt. In `"csv"` and `"blob"` mode
   * the POST is sent with `redirect: "manual"` and a redirect is followed here
   * instead, by a `GET` with no body and no headers, so the token never
   * leaves for another origin; the response is then read as a CSV document or
   * a file, see {@link #readRaw}. Either way the timeout covers the whole
   * attempt, redirects and body included.
   */
  async #attempt(
    mode: ResponseMode,
    method: NovaraFlexMethod,
    body: string,
    context: {
      attempt: number;
      timeoutMs: number;
      callerSignal: AbortSignal | undefined;
      meta: AttemptMeta;
    },
  ): Promise<unknown> {
    const { attempt: attempts, timeoutMs, callerSignal, meta } = context;
    const url = `${this.baseUrl}/${method}`;

    // Our own controller and timer rather than `AbortSignal.timeout()`, so the
    // timer can be cleared the moment the attempt settles (and faked in tests).
    let timeoutSignal: AbortSignal | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs !== 0 && timeoutMs !== Number.POSITIVE_INFINITY) {
      const controller = new AbortController();
      timeoutSignal = controller.signal;
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }
    const signal =
      callerSignal && timeoutSignal
        ? AbortSignal.any([callerSignal, timeoutSignal])
        : (callerSignal ?? timeoutSignal);

    /**
     * The abort precedence shared by the request and the body read: the
     * caller's own abort is rethrown untouched, then our timeout becomes a
     * `"timeout"` transport error; otherwise this returns and the call site
     * classifies the failure itself.
     */
    const throwIfAborted = (
      cause: unknown,
      status?: number,
      requestId?: string,
    ): void => {
      if (callerSignal?.aborted) throw cause;
      if (timeoutSignal?.aborted) {
        throw new NovaraFlexTransportError(
          `Novara Flex ${method} timed out after ${timeoutMs} ms`,
          { method, reason: "timeout", status, requestId, cause, attempts },
        );
      }
    };

    try {
      let response: Response;
      try {
        response = await this.#fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: ACCEPT[mode],
            "user-agent": `${SDK_NAME}/${SDK_VERSION}`,
          },
          body,
          // The JSON path keeps fetch's default redirect handling.
          ...(mode === "json" ? {} : { redirect: "manual" as const }),
          ...(signal ? { signal } : {}),
        });
      } catch (cause) {
        throwIfAborted(cause);
        // An abort we did not cause, e.g. from a custom fetch: surface it untouched.
        if (cause instanceof Error && cause.name === "AbortError") throw cause;
        throw new NovaraFlexTransportError(
          `Novara Flex ${method}: network request failed`,
          { method, reason: "network", cause, attempts },
        );
      }

      let requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
      let redirected = false;
      if (mode !== "json") {
        const followed = await this.#followRedirects(method, url, response, {
          attempts,
          requestId,
          signal,
          throwIfAborted,
        });
        response = followed.response;
        requestId = followed.requestId;
        redirected = followed.redirected;
      }

      const status = response.status;
      meta.retryAfter = response.headers.get(RETRY_AFTER_HEADER);

      // Checked before the body is read: a proxy may answer 429 with HTML.
      // Only the vendor's own 429 is a rate limit. Behind a redirect it comes
      // from the file's host, a limit that is not the vendor's pool, so it is
      // an ordinary `http_status` failure below and never starts a cooldown.
      if (status === 429 && !redirected) {
        throw new NovaraFlexRateLimitError({
          method,
          status,
          retryAfterMs: parseRetryAfter(meta.retryAfter),
          requestId,
          attempts,
        });
      }

      if (!response.ok) {
        throw new NovaraFlexTransportError(
          `Novara Flex ${method}: responded with HTTP ${status}`,
          { method, reason: "http_status", status, requestId, attempts },
        );
      }

      /** Read the body; a failure mid-read follows the abort precedence. */
      const read = async <T>(reader: () => Promise<T>): Promise<T> => {
        try {
          return await reader();
        } catch (cause) {
          throwIfAborted(cause, status, requestId);
          throw new NovaraFlexTransportError(
            `Novara Flex ${method}: could not read the response body`,
            { method, reason: "network", status, requestId, cause, attempts },
          );
        }
      };

      if (mode !== "json") {
        return await this.#readRaw(mode, method, response, {
          attempts,
          requestId,
          redirected,
          read,
          retryAfter: meta.retryAfter,
        });
      }

      const text = await read(() => response.text());

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (cause) {
        throw new NovaraFlexTransportError(
          `Novara Flex ${method}: returned a non-JSON body`,
          {
            method,
            reason: "invalid_json",
            status,
            requestId,
            cause,
            attempts,
          },
        );
      }

      const envelope = classifyEnvelope(parsed);
      throwIfErrorEnvelope(envelope, method, {
        status,
        requestId,
        attempts,
        retryAfter: meta.retryAfter,
      });
      if (envelope.kind === "invalid") {
        throw new NovaraFlexTransportError(
          `Novara Flex ${method}: returned an unrecognized response envelope`,
          { method, reason: "invalid_envelope", status, requestId, attempts },
        );
      }

      // The payload past `ok: true` is not validated at runtime: the contract
      // types it, and the opt-in live suite checks it against the wire.
      return envelope.body;
    } finally {
      // No timer may outlive the attempt, whichever way it settled.
      clearTimeout(timer);
    }
  }

  /**
   * Follow the redirects of a non-JSON request by hand, at most
   * {@link MAX_REDIRECTS} of them: each hop is a `GET` with no body and no
   * headers, so neither the token nor the parameters leave for the target,
   * whatever the status (a 307 or 308 would make `fetch` itself re-send the
   * POST body). Only `https:` targets are followed, or `http:` when the base
   * URL is itself `http:`.
   *
   * A redirect that cannot be followed — no usable `Location`, another
   * scheme, too many hops, or a browser's opaque redirect whose `Location` is
   * hidden — is an `"http_status"` transport error. The target URL may be
   * signed, so it never appears in an error message or property, and a failed
   * hop carries no `cause` for the same reason.
   */
  async #followRedirects(
    method: NovaraFlexMethod,
    url: string,
    first: Response,
    context: {
      attempts: number;
      requestId: string | undefined;
      signal: AbortSignal | undefined;
      throwIfAborted: (cause: unknown) => void;
    },
  ): Promise<{
    response: Response;
    requestId: string | undefined;
    redirected: boolean;
  }> {
    const { attempts, signal, throwIfAborted } = context;
    let { requestId } = context;
    let response = first;
    let from: URL | undefined;
    let allowHttp = false;
    for (let hops = 0; ; hops++) {
      if (response.type === "opaqueredirect") {
        throw new NovaraFlexTransportError(
          `Novara Flex ${method}: redirected, but this environment hides the redirect target, so the SDK cannot follow it safely`,
          { method, reason: "http_status", requestId, attempts },
        );
      }
      const status = response.status;
      if (!isRedirectStatus(status)) {
        return { response, requestId, redirected: hops > 0 };
      }
      // Nothing is read from a redirect's body.
      void response.body?.cancel().catch(() => undefined);
      if (hops >= MAX_REDIRECTS) {
        throw new NovaraFlexTransportError(
          `Novara Flex ${method}: redirected more than ${MAX_REDIRECTS} times`,
          { method, reason: "http_status", status, requestId, attempts },
        );
      }
      if (from === undefined) {
        try {
          from = new URL(url);
          allowHttp = from.protocol === "http:";
        } catch {
          // A base URL that is not absolute leaves nothing to resolve against.
        }
      }
      const target =
        from === undefined
          ? undefined
          : resolveRedirect(response.headers.get("location"), from, allowHttp);
      if (target === undefined) {
        throw new NovaraFlexTransportError(
          `Novara Flex ${method}: responded with HTTP ${status} and a redirect the SDK cannot follow safely`,
          { method, reason: "http_status", status, requestId, attempts },
        );
      }
      try {
        response = await this.#fetch(target.href, {
          method: "GET",
          redirect: "manual",
          ...(signal ? { signal } : {}),
        });
      } catch (cause) {
        throwIfAborted(cause);
        if (cause instanceof Error && cause.name === "AbortError") throw cause;
        throw new NovaraFlexTransportError(
          `Novara Flex ${method}: network request failed while following a redirect`,
          { method, reason: "network", attempts },
        );
      }
      requestId = response.headers.get(REQUEST_ID_HEADER) ?? requestId;
      from = target;
    }
  }

  /**
   * Read a non-JSON request's `200` response as what `mode` expects, matching
   * the media type case-insensitively and ignoring its parameters:
   *
   * - `application/json` from the vendor itself (not behind a redirect) is
   *   parsed and classified as `call` would: an error envelope throws
   *   {@link NovaraFlexApiError} or {@link NovaraFlexRateLimitError}; a success
   *   envelope, anything else, or a body that will not parse is a
   *   `"content_type"` transport error, the parse failure on `cause`.
   * - `"csv"`: `text/csv` is the document; anything else, a missing type
   *   included, is `"content_type"`.
   * - `"blob"`: `text/html` or a missing type is `"content_type"`; any other
   *   type is the file, since real attachments come in more types than the
   *   vendor documents. Behind a redirect that includes `application/json`: it
   *   is a file the target serves, not a vendor envelope.
   */
  async #readRaw(
    mode: RawResponseMode,
    method: NovaraFlexMethod,
    response: Response,
    context: {
      attempts: number;
      requestId: string | undefined;
      redirected: boolean;
      read: <T>(reader: () => Promise<T>) => Promise<T>;
      retryAfter: string | null | undefined;
    },
  ): Promise<NovaraFlexCsvPage | NovaraFlexAttachment> {
    const { attempts, requestId, redirected, read, retryAfter } = context;
    const status = response.status;
    const contentType = response.headers.get("content-type");
    const mediaType = mediaTypeOf(contentType);
    const expected = mode === "csv" ? "a CSV document" : "a file";
    const wrongType = (seen: string, cause?: unknown): never => {
      throw new NovaraFlexTransportError(
        `Novara Flex ${method}: expected ${expected} but the response was ${seen}`,
        {
          method,
          reason: "content_type",
          status,
          requestId,
          attempts,
          ...(cause === undefined ? {} : { cause }),
        },
      );
    };
    const discardAndThrow = (): never => {
      void response.body?.cancel().catch(() => undefined);
      const printable = printableMediaType(mediaType);
      return wrongType(
        printable === undefined ? "missing a content type" : printable,
      );
    };

    if (mediaType === "application/json" && !redirected) {
      const text = await read(() => response.text());
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (cause) {
        return wrongType("application/json that did not parse", cause);
      }
      const envelope = classifyEnvelope(parsed);
      throwIfErrorEnvelope(envelope, method, {
        status,
        requestId,
        attempts,
        retryAfter,
      });
      return wrongType(
        envelope.kind === "success"
          ? "a JSON success envelope"
          : "JSON that is not a Novara Flex envelope",
      );
    }

    if (mode === "csv") {
      if (mediaType !== "text/csv") return discardAndThrow();
      const csv = await read(() => response.text());
      const paging = parseCsvPaging(response.headers);
      return paging === undefined ? { csv } : { csv, paging };
    }

    if (mediaType === "" || mediaType === "text/html") {
      return discardAndThrow();
    }
    const data = await read(() => response.blob());
    return { data, contentType: contentType ?? mediaType };
  }
}

/**
 * Throw the error an `ok: false` envelope stands for: a
 * {@link NovaraFlexRateLimitError} for `rate_limit_exceeded`, otherwise a
 * {@link NovaraFlexApiError}. Returns for any other envelope.
 */
function throwIfErrorEnvelope(
  envelope: EnvelopeClassification,
  method: string,
  context: {
    status: number;
    requestId: string | undefined;
    attempts: number;
    retryAfter: string | null | undefined;
  },
): asserts envelope is Exclude<EnvelopeClassification, { kind: "error" }> {
  if (envelope.kind !== "error") return;
  const { status, requestId, attempts, retryAfter } = context;
  if (envelope.code === "rate_limit_exceeded") {
    throw new NovaraFlexRateLimitError({
      method,
      status,
      retryAfterMs: parseRetryAfter(retryAfter),
      description: envelope.description,
      requestId,
      attempts,
    });
  }
  throw new NovaraFlexApiError({
    method,
    code: envelope.code,
    description: envelope.description,
    requestId,
    attempts,
  });
}
