# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An unofficial, zero-runtime-dependency TypeScript SDK for the Novara Flex API, shipped as an ESM-only package built with plain `tsc` (no bundler, no CJS build). `exports` has only `types` and `default`, so CommonJS consumers load the ESM build through Node's `require(esm)` (hence `engines.node` `>=22.12`); keep the package free of top-level `await`, which would break that. Novara Flex is JSON-over-POST: every method is `POST ${baseUrl}/${method}` with the token in the body, and application errors come back as `HTTP 200` with `ok: false`.

## Commands

Node and pnpm are pinned in `mise.toml` and provisioned through mise, never a global install; if mise is not activated in the shell, prefix commands with `mise exec --`.

```sh
mise install && pnpm install --frozen-lockfile
pnpm check                    # typecheck → lint → test → build; the pre-push gate
pnpm typecheck                # tsconfig.json (src + unit tests), then tsconfig.live.json (test/live)
pnpm lint                     # biome check . (lint + format + import order); pnpm lint:fix to write
pnpm test                     # offline unit tests only (vitest.config.ts pins src/**/*.test.ts)
pnpm test src/client.test.ts  # one file (no `--`)
pnpm test -t "pattern"        # tests matching a name
pnpm build                    # tsconfig.build.json → dist/
pnpm lint:package             # clean build, then publint + attw (esm-only) on the packed tarball
pnpm test:consumer            # clean build, pack, then import/require/typecheck it from a temp npm consumer
pnpm generate                 # openapi/*.yaml → src/generated/openapi.ts
pnpm generate:check           # regenerate and fail on any diff under src/generated
pnpm test:live                # opt-in, hits the real API, needs NOVARA_FLEX_TOKEN in .env
pnpm changeset                # add a changeset (pending release note + bump) to a PR
pnpm version-packages         # release branch only: consume changesets, bump, sync SDK_VERSION
```

- `pnpm test:live` is never part of `pnpm check` and must not be run casually: it spends the account's shared rate-limit budget.
- CI (`.github/workflows/ci.yml`) runs `pnpm check`, `pnpm generate:check`, `pnpm lint:package` and the consumer smoke test (`scripts/consumer-smoke/`, on the `engines` minimum, latest 22 and the mise pin). It never runs the live suite and holds no secrets. Its one required check is the `CI` job; pin every third-party action to a full commit SHA with a version comment.
- Releases go through Changesets (`docs/releasing.md`): consumer-visible PRs add a changeset, and a release is an ordinary PR made by `pnpm version-packages`. Never bump `version` or `SDK_VERSION` by hand, and never publish from a laptop except the one-time bootstrap described there.
- `release.yml` publishes from `main` through npm trusted publishing (OIDC, with provenance) behind the `npm` environment, reusing `ci.yml` via `workflow_call`. It holds no npm token and reads no secrets; keep it that way.
- The smoke test type-checks the installed tarball with `types: []` and `skipLibCheck: false`, so declarations that need `@types/node` fail it.
- The SDK reads no environment variables at runtime; `.env` (see `.env.example`) only feeds the live tests.
- `mise run worktree <branch>` creates a sibling worktree, copies `.env` and `CLAUDE.local.md` from the primary worktree when they exist, and installs the toolchain and dependencies.
- TypeScript resolves to the 7.x native compiler and vitest to 5.x; check new tooling against those, not TypeScript 5 / vitest 4 behavior.

## Layout and boundaries

- `src/index.ts` is the only public entry point (`package.json` `exports` has just `.`). Anything consumers may use is re-exported there; everything else is internal. `src/index.test.ts` asserts the exact runtime export list; new public types are exported `type`-only where possible so the runtime list stays fixed.
- `SDK_VERSION` in `src/version.ts` is generated from `package.json` `version` by `scripts/sync-version.mjs` (part of `pnpm version-packages`); `src/version.test.ts` fails on drift, reading `package.json` through a JSON import that `resolveJsonModule` allows in `tsconfig.json` and `tsconfig.build.json` turns off. It lives outside `index.ts` so `client.ts` can build its `user-agent` without an import cycle.
- Relative imports use the `.js` extension (`NodeNext`). `verbatimModuleSyntax`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on: omit optional keys rather than passing `undefined`.
- `lib` includes `DOM` only for the WHATWG fetch types and `tsconfig.json` sets `"types": []`, so `dist/*.d.ts` never gains `/// <reference types="node" />` and consumers never need `@types/node`. `@types/node` applies only to `test/live` via `tsconfig.live.json`.
- Under `src/`, the only globals beyond the language are the fetch types (`Blob` included), `AbortController`, `AbortSignal.any`, `URL` (for resolving a redirect `Location`), and `setTimeout`/`clearTimeout`. No Node globals, no runtime dependencies.
- The npm tarball holds only `dist/`, `LICENSE`, `README.md` and `package.json` (`files: ["dist"]`; npm adds the other three).
- Biome (`biome.json`) formats its own config file: keep it in Biome's canonical shape or `pnpm lint` fails.

## Generated contract

- `openapi/novara-flex-openapi-3.1.yaml` is a hand-maintained, unofficial description derived from the vendor's public docs and the source of every request/response type. Change the YAML, run `pnpm generate`, and commit both; never edit `src/generated/` (Biome ignores it so it stays byte-identical to generator output).
- **Example values** in the spec, README and test fixtures are invented or taken from the public vendor docs, never from a live account.
- **Evidence rule for `required`**: a response property is marked `required` only where every record observed on the live API, from every method that returns its schema, carried it (present-but-null counts as present). Shapes not yet observed on the wire stay optional and are listed as unverified in `docs/live-validation.md`. A live/spec disagreement is a defect in the YAML, not in the test.
- `src/internal/contract.ts` is the only module that may import `src/generated`. It exposes helper types (`NovaraMethod`, `NovaraRequest`, `NovaraSuccess`, `NovaraRequestFor`, `NovaraSuccessFor`, `NovaraSchema`, …); neither they nor the generated types are exported publicly.
- The generator lives in the private workspace package `openapi/` because `openapi-typescript` prints with TypeScript's JavaScript compiler API, which the TypeScript 7 native package no longer ships, so it needs TypeScript 5 while the SDK builds with TypeScript 7. `pnpm-workspace.yaml` (`resolvePeersFromWorkspaceRoot: false` plus the `openapi-typescript>typescript` override) keeps both; `pnpm why typescript` shows both. Don't collapse it.
- `FormField` is a `oneOf` with a `discriminator` on `type`, so each field type narrows `settings`. A new field type needs a variant schema, a mapping entry, and entries in both the live suite's `FORM_FIELD_TYPES` and `FORM_FIELD_SETTINGS_FIELDS`.

## Request pipeline (`src/client.ts`)

- `NovaraFlexClient.call(method, params?, options?)` reaches any contract method by name (no leading slash) and is the escape hatch for unwrapped methods. It and the non-JSON methods share one private loop (`#request` → `#attempt`) that applies the rate-limit cooldown, the opt-in throttle (`src/internal/throttle.ts`), the per-attempt timeout, fetch, envelope classification, and retries.
- `classifyEnvelope` (`src/internal/envelope.ts`) is pure and does no I/O: `success` returns the body, `error` throws `NovaraFlexApiError`, `invalid` throws `NovaraFlexTransportError`. It accepts any string `error` code on purpose, since the vendor documents codes the contract enum lacks.
- Error classes are in `src/errors.ts`. Every `NovaraFlexTransportError` has a `reason` (`timeout` / `network` / `http_status` / `invalid_json` / `invalid_envelope` / `content_type`) that the retry policy branches on; a body that fails mid-read without an abort is `network`, and `content_type` is raised only by the non-JSON methods and never retried. Both error classes carry `attempts`.
- **Timeouts** are per attempt (`timeoutMs` on the client or per call, which wins; `0`/`Infinity` disables; any other invalid value is a `TypeError`). They use a hand-rolled `AbortController` + `setTimeout` (not `AbortSignal.timeout()`, which vitest fake timers cannot drive), combined with the caller's signal via `AbortSignal.any` only when both exist, covering the body read and redirect hops, and cleared in a `finally`. Abort precedence: caller's signal aborted → rethrow unchanged; our timer fired → reason `timeout`; a foreign `AbortError` from fetch is also rethrown unchanged.
- **Retries**: the policy and its numbers are pure code in `src/internal/retry.ts`. Only read-shaped method names are retried by default, because every vendor method is a POST and a failed write may already have taken effect; `retry.idempotent` exists **per call only**, so no client setting can make writes retryable. `Retry-After` replaces the backoff, the backoff sleep is cancelled by the caller's signal, and the value is public only as `NovaraFlexRateLimitError.retryAfterMs`.
- **Rate limits**: HTTP 429 from the vendor (checked before the body is read) or a `rate_limit_exceeded` envelope throws `NovaraFlexRateLimitError`. A 429 from a redirect target (the attachment host) is an `http_status` transport error and starts no cooldown — for any new response path, check whose status it really is. Every rate limit pushes out the client-wide cooldown; a retryable call gets one rate-limit retry.
- The vendor's ~80 requests/minute pool is shared by every token on a customer account, while the SDK's throttle covers one client instance, so docs recommend a budget like `rateLimit: { requestsPerMinute: 40 }`. The live rate-limit response shape is deliberately unverified: never trigger it.

## Token safety (enforced by tests)

- The token is held in the true private field `#token` and spread **last** into the request body so caller params cannot override it. It must never appear in an error message, an error property, or a log; `src/client.test.ts` checks this with the distinctive `TOKEN` from `src/test-support/fake-fetch.ts`.
- A redirect `Location` or an attachment `key` must never reach an error either, so a failed redirect hop carries no `cause`.

## Endpoint namespaces (`src/resources/`)

- One module per vendor API area, exposed as a `readonly` property on the client (declared and constructed alphabetically). The naming rules are documented at the top of `src/resources/index.ts`; read them before adding an area. The vendor name is still what goes on the wire, into `call`, and into an error's `method`.
- Methods are hand-written one-line delegations to `this.#client.call(...)` (no factory or Proxy), each with a JSDoc summary and `@see` vendor docs URL. They take `NovaraFlexCallArgs<M>` (from `src/client.ts`) and return the whole `ok: true` body, nothing unwrapped. Resource classes import the client with `import type` and are not exported from `src/index.ts`.
- **Paged methods** get a `<method>All` companion delegating to `paginate` in `src/internal/paginate.ts`, plus a `PAGED_METHODS` entry there, in the same change. The paginator's semantics (`count()`, `pages()`, stop rules, the `responses.flat` mapping row) are documented in that file; it has no throttle or concurrency of its own.
- **Non-JSON responses**: `call` stays JSON-only. `responses.flat` and `osha-hours.list` keep JSON wrappers with `format` narrowed to `"json"` plus `…Csv` companions; `attachment.load` returns a `Blob`. The narrowed param types (`ResponsesFlatParams`, `OshaHoursListParams` and their `…CsvParams` variants) are exported from their resource module only, for declaration emit, never from `index.ts`; `flex.call("responses.flat", { format: "csv" })` still type-checks and throws a transport error.
- These reach the private loop through `requestRaw` in `src/internal/raw.ts`, a `WeakMap` the constructor registers, so the client's prototype exposes nothing but `call` (asserted in `client.test.ts`). The mode is chosen by the method, never by sniffing. They follow redirects themselves — at most 5 hops, bodiless `GET` with no headers, `https:` only (`http:` only when the base URL is), no userinfo — because fetch would re-send a 307/308 body, token included; an `opaqueredirect` is `http_status`. Vendor JSON not behind a redirect is still classified as an envelope. Media-type helpers are in `src/internal/media.ts`. The JSON path keeps fetch's default redirect handling and sends no `redirect` key.
- `dataload.create` is the SDK's only **write** method: it synchronizes account records from a CSV and can send email. It is not retried by default and must never be called against a live account.

## Tests

- Unit tests are colocated `src/**/*.test.ts` and fully offline. Shared transport fakes (`fakeFetch`, `jsonResponse`, `bodyOf`, `createClient`, `TOKEN`, `BASE_URL`, …) are in `src/test-support/fake-fetch.ts`, which is excluded from the build; only `*.test.ts` files may import it. `createClient` disables timeouts, retries and the rate-limit delay, so tests of those behaviors construct their own client.
- Some tests are type-level only (`expectTypeOf`): `src/form-fields.test.ts`, `src/required-properties.test.ts`, `src/nested-shapes.test.ts`. They pin the public response types derived from the spec, so a spec change can fail `pnpm test`/`pnpm typecheck`.
- The live suite (`test/live/`, run serially by `vitest.live.config.ts`):
  - It gets the credential only through `test/live/global-setup.ts` (`.env` → `provide`/`inject("novaraFlex")`). Tests never read `process.env` and never import `src/internal` or `src/generated`.
  - It calls read-only methods only; the list is in the header of `test/live/endpoints.test.ts`, which `CONTRIBUTING.md` points to — extend it when a new read method gets a wrapper. `dataload.info` is only asked about an id that cannot exist; `dataload.create` is never called.
  - Every request goes through one client throttled to `LIVE_REQUESTS_PER_MINUTE`, and `afterAll` fails the run if any rate limit was observed. Expensive or shared lookups go in cached module-level promises.
  - Live data is real people's safety data: never print CSV contents, attachment bytes or keys, redirect URLs, or response bodies; assert types, sizes and booleans only.
  - Each `*_FIELDS` table lists every required key of its schema; the compiler checks this against the public types in both directions.

## Local notes

Personal or maintainer workflow notes go in `CLAUDE.local.md`, which is gitignored and never published.
