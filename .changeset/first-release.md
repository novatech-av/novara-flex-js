---
"novara-flex-js": minor
---

First release of the unofficial TypeScript SDK for the Novara Flex API.

- `NovaraFlexClient` with a namespaced, typed wrapper for every documented API area (`flex.users.list()`, `flex.forms.info()`, …), plus `call(method, params)` to reach any method by its vendor name.
- Request and response types generated from a hand-maintained OpenAPI description of the API.
- Typed errors: `NovaraFlexApiError` for `ok: false` responses, `NovaraFlexRateLimitError` for rate limits, and `NovaraFlexTransportError`, whose `reason` tells timeouts, network and HTTP failures, and malformed responses apart. The API token never appears in an error.
- Per-attempt timeouts (`timeoutMs`) and `AbortSignal` cancellation.
- Retries with backoff for read methods only. A write is retried only when that call opts in, because a failed write may already have taken effect.
- Rate-limit handling that honors `Retry-After` and pauses the whole client, plus an opt-in client-side throttle (`rateLimit: { requestsPerMinute }`).
- `…All` paging helpers that iterate every record, or every page, of a paged method.
- CSV exports (`responses.flatCsv()`, `oshaHours.listCsv()`) and attachment downloads (`attachment.load()`).
- An ESM package that CommonJS can also `require()` on Node 22.12 and later, with zero runtime dependencies.
