# novara-flex-js

An unofficial TypeScript SDK for the Novara Flex API. This project is not affiliated with,
endorsed by, or supported by the vendor of Novara Flex.
Novara Flex and KPA Flex are trademarks of their respective owners and are used here only
to identify the API this SDK talks to.

The client covers every method in the vendor's published API documentation with typed
parameters and results, and adds request timeouts, safe retries for reads, rate-limit
handling, paging helpers, CSV exports, and attachment downloads. It has no runtime
dependencies.

- [Install](#install)
- [Quickstart](#quickstart)
- [Server-side only](#server-side-only)
- [Usage](#usage): [methods and `call`](#namespaced-methods-and-call),
  [errors](#errors), [timeouts](#timeouts-and-cancellation), [retries](#retries),
  [rate limits](#rate-limits), [paging](#paging), [CSV exports](#csv-exports),
  [attachments](#attachment-downloads)
- [Method reference](#method-reference)
- [Form field definitions](#form-field-definitions)
- [Status](#status)
- [More](#more)

## Install

```sh
npm install novara-flex-js
```

- **Node.js 22.12 or newer** (`engines.node` is `>=22.12`).
- **ESM only**, with no separate CommonJS build. CommonJS code can still `require()` it,
  because Node 22.12 and later load ES modules through `require`.
- **TypeScript types are included.** They need no `@types/node`, and work with
  `"types": []`; the `DOM` lib (or another source of the `fetch` types) is enough.
- **Zero runtime dependencies.** The client uses the global `fetch`, or one you pass in.

```js
// CommonJS
const { NovaraFlexClient } = require("novara-flex-js");
```

## Quickstart

You need a Novara Flex API token. Keep it in an environment variable or a secret store and
pass it to the client; the SDK reads no environment variables itself.

```ts
import { NovaraFlexClient } from "novara-flex-js";

const token = process.env.NOVARA_FLEX_TOKEN;
if (!token) throw new Error("Set NOVARA_FLEX_TOKEN");

const flex = new NovaraFlexClient({
  token,
  rateLimit: { requestsPerMinute: 40 }, // see "Rate limits"
});

const pong = await flex.api.ping();
console.log(pong.ok); // true

const { account } = await flex.account.info();
console.log(account.name);
```

The examples below assume this `flex` client and `token`.

`NovaraFlexClient` takes these options:

| Option      | Default                         | Meaning                                                           |
| ----------- | ------------------------------- | ----------------------------------------------------------------- |
| `token`     | required                        | Your API token. Sent in every request body, never in an error.    |
| `baseUrl`   | `https://api.novaraflex.com/v1` | Trailing slashes are stripped.                                    |
| `fetch`     | the global `fetch`              | A custom `fetch` implementation, for testing or a custom transport. |
| `timeoutMs` | `60_000`                        | Per-attempt timeout; see [Timeouts](#timeouts-and-cancellation).  |
| `retry`     | 2 retries                       | Retry and backoff settings; see [Retries](#retries).              |
| `rateLimit` | off                             | Opt-in client-side throttle; see [Rate limits](#rate-limits).     |

An invalid option makes the constructor throw a `TypeError` whose message names it, such
as `NovaraFlexClient timeoutMs …`.

## Server-side only

Use this SDK from a server, a script, or a job, not from a browser.

- **The token travels in the request body.** Every Novara Flex method is a `POST` whose
  JSON body carries the API token, so shipping the client to a browser hands the token to
  anyone who opens the developer tools. Keep it on a server and expose only what your
  users need through your own API.
- **`attachment.load` cannot work in a browser.** The live API answers a known attachment
  key with a redirect to the file on another origin. The SDK follows redirects itself (see
  [Attachment downloads](#attachment-downloads)), and a browser's `fetch` hides a manual
  redirect's target behind an opaque response, so in a browser the call fails with a
  `NovaraFlexTransportError` whose `reason` is `"http_status"`.

## Usage

### Namespaced methods and `call`

Every API area is a namespace on the client, with one method per vendor method. A method
takes the vendor's parameters (minus the token, which the client adds) and resolves to the
whole `ok: true` response body, with nothing unwrapped, so paging metadata and any field
the types do not name stay reachable.

```ts
const { users } = await flex.users.list();
console.log(users.length);

const { user } = await flex.users.info({ id: "5804f0f30ef50473af5870c6" });
console.log(user.email);

// Paged methods take limit and a 1-based page, and answer with paging.
const page = await flex.projects.list({ limit: 100, page: 1 });
console.log(page.projects.length, page.paging.total, page.paging.last_page);
```

`flex.call(method, params?, options?)` reaches the same methods by their vendor name, with
the same types. It is also the escape hatch for any method the vendor adds before the SDK
wraps it:

```ts
const same = await flex.call("users.info", { id: "5804f0f30ef50473af5870c6" });
const trainings = await flex.call("trainings.v2.list");
```

Parameters are checked at compile time: a missing required parameter or a field name the
method does not document is a type error. The vendor method name is what goes on the wire
and what an error's `method` reports, even where the namespace spells it differently; see
the [Method reference](#method-reference).

### Errors

Novara Flex answers application errors with `HTTP 200` and `ok: false` in the body. The
SDK turns every failure into one of these classes, all extending `NovaraFlexError`:

- **`NovaraFlexApiError`**: the API rejected the call. `code` is the vendor's error code
  (such as `token_invalid` or `parameter_invalid`; treat it as an open set), plus
  `description`, `method`, `requestId` (the `HZS-Request-ID` header, for vendor support),
  and `attempts`.
- **`NovaraFlexRateLimitError`**: a subclass of `NovaraFlexApiError` for the vendor's rate
  limit, whether it arrived as an `HTTP 429` or a `rate_limit_exceeded` envelope. `code`
  is always `"rate_limit_exceeded"`, `status` is `429` or `200`, and `retryAfterMs` is the
  response's `Retry-After` in milliseconds, or `undefined` when there was none.
- **`NovaraFlexTransportError`**: no well-formed Novara Flex response came back. `reason`
  says why, and `status`, `requestId`, `cause`, and `attempts` are set when they apply.

```ts
import {
  NovaraFlexApiError,
  NovaraFlexRateLimitError,
  NovaraFlexTransportError,
} from "novara-flex-js";

try {
  await flex.projects.info({ project_id: 21 });
} catch (err) {
  if (err instanceof NovaraFlexRateLimitError) {
    // Check this before NovaraFlexApiError, which it extends.
    console.error("rate limited; Retry-After (ms):", err.retryAfterMs);
  } else if (err instanceof NovaraFlexApiError) {
    console.error(err.method, err.code, err.description, err.requestId);
  } else if (err instanceof NovaraFlexTransportError) {
    console.error(err.method, err.reason, err.status, err.attempts);
  } else {
    throw err; // e.g. your own AbortSignal's reason, rethrown unchanged
  }
}
```

| `reason`             | Meaning                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `"timeout"`          | The SDK's timeout fired, while waiting for headers or the body       |
| `"network"`          | `fetch` rejected, or the connection failed while reading the body    |
| `"http_status"`      | A status other than `200` or `429`, or a redirect not safe to follow |
| `"invalid_json"`     | The body arrived in full but was not JSON                            |
| `"invalid_envelope"` | The body was JSON but not the documented `{ ok: ... }` envelope      |
| `"content_type"`     | A CSV or attachment method got a response of the wrong content type  |

The API token never appears in an error message, property, or serialization.

### Timeouts and cancellation

Every attempt is bounded by a timeout, **60 s by default**, covering the whole attempt
including the response body. A retried call gets the full timeout on each attempt. Set it
per client or per call (the call wins); `0` or `Infinity` disables it. Every call also
accepts an `AbortSignal`:

```ts
import { NovaraFlexClient } from "novara-flex-js";

const patient = new NovaraFlexClient({ token, timeoutMs: 90_000 });
await patient.users.list(undefined, { timeoutMs: 120_000 }); // this call only

const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);
await flex.forms.list(undefined, { signal: controller.signal });
```

When the SDK's timeout fires, the call throws a `NovaraFlexTransportError` with
`reason: "timeout"`. When your signal aborts, during a request or any wait before one, its
rejection (an `AbortError`, or the reason you passed to `abort()`) is rethrown unchanged
and nothing further is sent. An invalid per-call option rejects with a `TypeError` before
anything is sent, naming the option as `NovaraFlexCallOptions.timeoutMs …`.

### Retries

Every Novara Flex method is a `POST`, so the HTTP verb says nothing about whether a call is
safe to repeat, and a write that failed (after a timeout, a dropped connection, or a 5xx)
may already have taken effect. The SDK therefore retries by method name, default-deny:

- **Retried by default:** methods named `*.list`, `*.info`, `*.ping`, `*.echo`, `*.flat`,
  or `*.load`, which is every wrapped method except `dataload.create`. A method name the
  SDK does not recognize is not retried.
- **`dataload.create` is a write.** It synchronizes account records from a CSV and can
  send email, so it is never retried automatically.
- **`retry.idempotent` exists per call only.** Pass `{ retry: { idempotent: true } }` on a
  call you know is safe to repeat, or `false` to switch retries off for one read. No
  client-wide setting can make writes retryable.

A retryable call is retried after a timeout, a network failure, an HTTP 5xx, or a
`server_error` code: **2 retries by default**, with full-jitter exponential backoff
(`baseDelayMs` 500, `maxDelayMs` 10 000). A `Retry-After` header replaces the backoff, and
one longer than 60 s is thrown instead of waited out. Other error codes, other statuses,
malformed bodies, and your own abort are never retried. The error thrown is the last
failure, and its `attempts` says how many attempts were made.

```ts
import { NovaraFlexClient } from "novara-flex-js";

const persistent = new NovaraFlexClient({
  token,
  retry: { maxRetries: 4, baseDelayMs: 250, maxDelayMs: 5_000 }, // maxRetries: 0 disables
});

await persistent.users.list(undefined, { retry: { maxRetries: 1 } }); // per call
await persistent.projects.list({ limit: 100 }, { retry: { idempotent: false } }); // no retries
```

`maxRetries` must be an integer from 0 to 10, and the delays finite numbers of
milliseconds from 0 to 2147483647.

### Rate limits

Novara Flex allows about **80 requests a minute per customer account**, and that pool is
shared by every token, process, and integration on the account. The vendor documents about
a minute of errors after a violation, for all of them, not only for the client that went
over.

- **Set a budget.** `rateLimit: { requestsPerMinute }` spaces this client's request starts
  evenly, retries included. It is off by default. Pick a budget well below the vendor's
  limit that leaves room for the account's other integrations, such as **40 a minute**.
  The throttle covers one client instance only, so it cannot guarantee compliance on its
  own.
- **One retry, then a cooldown.** A read that hits the limit waits out `Retry-After`, or
  `retry.rateLimitDelayMs` (60 s by default) plus a little jitter, and retries once.
  Meanwhile every call on the same client, writes included, holds its next attempt until
  that window has passed. Your `AbortSignal` cancels either wait.

```ts
import { NovaraFlexClient, NovaraFlexRateLimitError } from "novara-flex-js";

const budgeted = new NovaraFlexClient({
  token,
  rateLimit: { requestsPerMinute: 40 },
  retry: { rateLimitDelayMs: 90_000 }, // default 60_000
});

try {
  await budgeted.forms.list();
} catch (err) {
  if (err instanceof NovaraFlexRateLimitError) {
    console.error(err.status, err.retryAfterMs, err.attempts);
  }
}
```

The vendor documents the limit, but which of the two shapes the live API sends (`HTTP 429`
or a `rate_limit_exceeded` envelope), and whether it sends `Retry-After`, has not been
verified. The SDK handles both, with or without the header. A 429 from the host an
attachment redirects to is not the vendor's limit: it is a `NovaraFlexTransportError` with
`reason: "http_status"` and starts no cooldown.

### Paging

Nine methods are paged: they take `limit` and a 1-based `page` and answer with
`paging: { total, last_page }`. Each has a companion named after it plus `All` that returns
a lazy `NovaraFlexPaginator`:

```ts
// Items, every page, one request at a time.
for await (const project of flex.projects.listAll()) {
  console.log(project.id, project.name);
}

// Whole pages, paging metadata included.
for await (const page of flex.responses.listAll({ form_id: 3987 }).pages()) {
  console.log(page.responses.length, page.paging.last_page);
}

// How many items match, in one request.
const dayAgo = Date.now() - 24 * 60 * 60 * 1000; // epoch milliseconds
const recent = await flex.responses.listAll({ form_id: 3987, after: dayAgo }).count();
```

| Paged method                       | Companion                             | Items key            | Max `limit` |
| ---------------------------------- | ------------------------------------- | -------------------- | ----------- |
| `flex.projects.list`               | `flex.projects.listAll`               | `projects`           | 500         |
| `flex.contractors.list`            | `flex.contractors.listAll`            | `contractors`        | 1000        |
| `flex.contractorRequirements.list` | `flex.contractorRequirements.listAll` | `requirements`       | 500         |
| `flex.responses.list`              | `flex.responses.listAll`              | `responses`          | 500         |
| `flex.responses.flat`              | `flex.responses.flatAll`              | `responses`          | 1000        |
| `flex.followups.list`              | `flex.followups.listAll`              | `followups`          | 500         |
| `flex.completedtrainings.list`     | `flex.completedtrainings.listAll`     | `completedtrainings` | 1000        |
| `flex.trainingEmployeeStatus.list` | `flex.trainingEmployeeStatus.listAll` | `employees`          | 1000        |
| `flex.oshaHours.list`              | `flex.oshaHours.listAll`              | `hours`              | 1000        |

- A companion takes exactly its method's arguments, so `responses.listAll` still needs a
  `form_id`. Without a `limit` it asks for the method's maximum; a `page` is where the walk
  starts.
- Nothing is sent until you iterate. Each `for await` starts a fresh walk, and leaving the
  loop early stops it. Pages go through the client one at a time, so the timeout, retries,
  rate-limit handling, and throttle apply to each; give the client a `rateLimit` budget
  for bulk walks.
- The walk ends after an empty page or at `paging.last_page`. Records created or removed
  during a walk can shift across pages, so an item can be yielded twice or skipped;
  nothing is deduplicated.
- `.count()` sends one request with `limit: 1` and resolves to `paging.total`; your
  filters apply.
- `responses.flatAll` yields response rows only. Unless you pass
  `skip_field_id_mapping_json: true`, every page of the flattened export starts with a
  field-ID-to-title mapping row covering that page's columns; `.pages()` keeps it at
  `responses[0]`, so merging those rows gives every title.

### CSV exports

`responses.flat` and `osha-hours.list` can answer with a CSV document instead of JSON. Their
JSON wrappers accept only `format: "json"`; the CSV has its own methods, which send
`format: "csv"` themselves and resolve to a `NovaraFlexCsvPage`, `{ csv, paging? }`:

```ts
// One page of a form's flattened responses, as CSV.
const first = await flex.responses.flatCsv({ form_id: 3987, limit: 1000, page: 1 });
console.log(first.csv.length, first.paging?.total);

// There is no CSV paginator: walk page up to paging.last_page yourself.
const lastPage = first.paging?.last_page ?? 1;
for (let page = 2; page <= lastPage; page++) {
  const next = await flex.responses.flatCsv({ form_id: 3987, limit: 1000, page });
  console.log(next.csv.length);
}

const hours = await flex.oshaHours.listCsv({ year: 2026 });
console.log(hours.csv.length);
```

`csv` is the document exactly as sent; the SDK does not parse it. `paging` comes from the
`novaraflex-total-results` and `novaraflex-last-page` response headers and is present only
when both are non-negative integers. A response that is not `text/csv` is a
`NovaraFlexTransportError` with `reason: "content_type"`. Calling
`flex.call("responses.flat", { form_id, format: "csv" })` type-checks but throws a
transport error, because `call` parses every body as JSON.

### Attachment downloads

`flex.attachment.load({ key })` downloads an uploaded file by its storage key and resolves
to a `NovaraFlexAttachment`, `{ data, contentType }`: the file as a `Blob` and the
`Content-Type` it was served with.

```ts
const { followups } = await flex.followups.list({ limit: 10 });
const key = followups[0]?.messages?.[0]?.attachments?.[0]?.key;
if (key !== undefined) {
  const file = await flex.attachment.load({ key });
  console.log(file.contentType, file.data.size); // e.g. "image/jpeg" and a byte count
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  console.log(bytes.byteLength);
}
```

- **Buffered.** The whole file is read into memory inside the request timeout; raise
  `timeoutMs` for a large file on a slow link.
- **Redirects are followed safely.** `fetch` would re-send a `POST` body, token included,
  to the target of a 307 or 308 redirect, so the SDK follows redirects itself: at most
  five, each a bodiless `GET` with no headers, and only to `https:` targets (or `http:`
  when your `baseUrl` is). A redirect it will not follow is a `NovaraFlexTransportError`
  with `reason: "http_status"`. Neither a redirect target nor an attachment key ever
  appears in an error. In a browser this always fails; see
  [Server-side only](#server-side-only).
- **Content types.** Any type is accepted except `text/html` or none, which are a
  `NovaraFlexTransportError` with `reason: "content_type"`. An unknown key is a
  `NovaraFlexApiError` (`invalid_key_for_customer`).

## Method reference

Each namespace is the vendor method name's first segment. A hyphenated area is camelCased
(`contractor-contacts` → `contractorContacts`), the singular `contractor-requirement.info`
lives on the plural namespace, and a version segment is dropped from the method name
(`trainings.v2.list` → `flex.trainings.list()`). The vendor name is what `flex.call` takes
and what errors report.

| Namespace                     | Methods                                    | Vendor methods                                               |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `flex.account`                | `info`                                     | `account.info`                                               |
| `flex.acknowledgments`        | `list`, `info`                             | `acknowledgments.list`, `acknowledgments.info`               |
| `flex.api`                    | `ping`, `echo`                             | `api.ping`, `api.echo`                                       |
| `flex.attachment`             | `load` (a file)                            | `attachment.load`                                            |
| `flex.companies`              | `list`                                     | `companies.list`                                             |
| `flex.completedtrainings`     | `list`, `listAll`                          | `completedtrainings.v2.list`                                 |
| `flex.contractorContacts`     | `list`                                     | `contractor-contacts.list`                                   |
| `flex.contractorRequirements` | `list`, `listAll`, `info`                  | `contractor-requirements.list`, `contractor-requirement.info` |
| `flex.contractors`            | `list`, `listAll`                          | `contractors.list`                                           |
| `flex.datalistitems`          | `list`                                     | `datalistitems.list`                                         |
| `flex.datalists`              | `list`                                     | `datalists.list`                                             |
| `flex.dataload`               | `create` (a write), `info`                 | `dataload.create`, `dataload.info`                           |
| `flex.driverQualifications`   | `list`                                     | `driver-qualifications.list`                                 |
| `flex.equipments`             | `list`                                     | `equipments.list`                                            |
| `flex.equipmenttypes`         | `list`                                     | `equipmenttypes.list`                                        |
| `flex.establishments`         | `list`, `info`                             | `establishments.list`, `establishments.info`                 |
| `flex.fieldoffices`           | `list`                                     | `fieldoffices.list`                                          |
| `flex.followups`              | `list`, `listAll`                          | `followups.list`                                             |
| `flex.formfolders`            | `list`                                     | `formfolders.list`                                           |
| `flex.forms`                  | `list`, `info`                             | `forms.list`, `forms.info`                                   |
| `flex.grouptrainings`         | `list`                                     | `grouptrainings.list`                                        |
| `flex.inspections`            | `list`                                     | `inspections.list`                                           |
| `flex.jobtitles`              | `list`                                     | `jobtitles.list`                                             |
| `flex.linesofbusiness`        | `list`                                     | `linesofbusiness.list`                                       |
| `flex.oshaHours`              | `list`, `listCsv`, `listAll`               | `osha-hours.list`                                            |
| `flex.projects`               | `list`, `listAll`, `info`                  | `projects.list`, `projects.info`                             |
| `flex.resources`              | `list`                                     | `resources.list`                                             |
| `flex.resourcetags`           | `list`                                     | `resourcetags.list`                                          |
| `flex.responses`              | `list`, `listAll`, `info`, `flat`, `flatCsv`, `flatAll` | `responses.list`, `responses.info`, `responses.flat` |
| `flex.roles`                  | `list`                                     | `roles.list`                                                 |
| `flex.trainingEmployeeStatus` | `list`, `listAll`                          | `training-employee-status.list`                              |
| `flex.trainings`              | `list`                                     | `trainings.v2.list`                                          |
| `flex.users`                  | `list`, `info`                             | `users.list`, `users.info`                                   |

Each method's JSDoc links the vendor's documentation page for it, and the parameter and
result types come from the [OpenAPI description](openapi/novara-flex-openapi-3.1.yaml) in
this repository. A few vendor quirks the types carry:

- `projects.info` takes `project_id` and `establishments.info` takes `establishment_id`
  (integers), where `users.info` and `acknowledgments.info` take `id`.
- `responses.list` and `responses.flat` need a `form_id`, and their time bounds (`after`,
  `before`, …) are Unix epoch **milliseconds**.
- `establishments.info` answers with `establishment` as an array holding the match, and
  `driver-qualifications.list` answers under a `users` key.
- `api.echo` returns whatever object you pass as `response` as the entire response body.

## Form field definitions

`forms.info` answers with the form's current version in `form.latest`, and every earlier
version in `form.versions` when you pass `include_versions: true`. Each version's `fields`
array is a union discriminated on `type`, so checking `type` narrows `settings`:

```ts
const { form } = await flex.forms.info({ form_id: 1234 });
for (const field of form.latest.fields) {
  if (field.type === "select") {
    console.log(field.title, field.settings.style, field.settings.items.length);
  } else if (field.type === "datetime") {
    console.log(field.title, field.settings.date, field.settings.time);
  }
}
```

The vendor documents neither the field types nor their settings, so the union was built
from forms observed on the live API: `attachments`, `calculation`, `checkbox`, `counter`,
`datetime`, `description`, `followup`, `groupsignature`, `heading`, `select`, `sketch`,
`subreport`, and `text`.

- `select`, `text`, `checkbox`, `description`, `attachments`, `groupsignature`,
  `datetime`, and `sketch` have typed settings. `heading`, `counter`, `calculation`,
  `followup`, and `subreport` keep `settings` as an open object, but still narrow.
- Known string values, such as a `select` field's `style` (`rating`, `select`, `list`),
  are listed in the type descriptions rather than as closed enums.
- Every object stays open, and nothing is validated at runtime: keys the types do not
  name still arrive, and a field type outside the union would arrive too, without
  narrowing.

## Status

- **Pre-1.0.** The API may still change between minor versions.
- **Unofficial.** This project is not affiliated with or supported by the vendor.
- **Coverage.** Every method in the vendor's published documentation has a typed wrapper,
  and `flex.call` reaches all of them by name. `dataload.create` is the only method that
  writes.
- **Verification.** The types come from an OpenAPI description derived from the vendor's
  public documentation and checked against the live API with read-only calls. Where the
  live API and the docs disagree, the types follow the live API. Shapes that have not been
  observed on the wire, including the rate-limit response and everything `dataload.create`
  returns, are typed from the docs alone and listed in
  [docs/live-validation.md](docs/live-validation.md).

## More

- Vendor API documentation: <https://api.novaraflex.com/docs/>
- [Live validation notes](docs/live-validation.md): what the live API was observed to do,
  and which shapes remain unverified
- [Contributing](CONTRIBUTING.md): toolchain, tests, and how the contract is maintained
- [Security policy](SECURITY.md): how to report a vulnerability
- [License](LICENSE): MIT
