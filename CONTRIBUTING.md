# Contributing to novara-flex-js

Thanks for helping. This is an unofficial SDK, so changes are judged against two sources:
the vendor's [public API documentation](https://api.novaraflex.com/docs/) and what the live
API actually does. Bug reports and pull requests are welcome; report security issues
privately as described in [SECURITY.md](SECURITY.md), never in a public issue.

Never paste an API token, `.env` contents, or data from a real Novara Flex account into an
issue, a pull request, a commit, or a test fixture. Example values in code, tests, and docs
are invented or taken from the vendor's public documentation.

[CLAUDE.md](CLAUDE.md) holds the detailed architecture and code rules (the request
pipeline, token safety, the endpoint naming rules); read it before a non-trivial change.

## Toolchain

Node.js and pnpm are pinned in `mise.toml` and provisioned by [mise](https://mise.jdx.dev).
Never install them globally for this project.

```sh
mise install
pnpm install --frozen-lockfile
```

These commands assume [mise is activated in your shell](https://mise.jdx.dev/getting-started.html).
If it is not, prefix each command with `mise exec --`, for example
`mise exec -- pnpm check`.

The SDK builds with the TypeScript 7 native compiler and tests with vitest 5; check new
tooling against those versions.

## Gates

| Command                 | What it does                                                                   |
| ----------------------- | ------------------------------------------------------------------------------ |
| `pnpm check`            | typecheck, lint, test, build: run it before every push                         |
| `pnpm typecheck`        | type-checks `src/` and the unit tests, then `test/live`                        |
| `pnpm lint`             | Biome lint, format, and import-order check (`pnpm lint:fix` writes fixes)      |
| `pnpm test`             | the offline unit tests (`pnpm test src/client.test.ts` or `pnpm test -t "name"`) |
| `pnpm build`            | emits ESM and declarations to `dist/`                                          |
| `pnpm lint:package`     | a clean build, then `publint` and `attw` (ESM-only profile) on the package     |
| `pnpm test:consumer`    | a clean build, then installs the packed tarball into a temporary npm project and imports, requires, and type-checks it |
| `pnpm generate`         | regenerates `src/generated/` from the OpenAPI description                      |
| `pnpm generate:check`   | regenerates and fails if `src/generated/` changed                              |
| `pnpm test:live`        | the opt-in live suite; see [Live API tests](#live-api-tests)                   |

`pnpm test` and `pnpm check` are fully offline and need no credentials.

CI (`.github/workflows/ci.yml`) runs on every pull request to `main` and every push to it:
`pnpm check`, `pnpm generate:check`, `pnpm lint:package`, and the consumer smoke test
against the packed tarball on Node 22.12.0 (the `engines` minimum), the latest Node 22, and
the `mise.toml` pin (Node 24). The required status check is `CI`. CI never runs the live
suite and holds no secrets. Pin every third-party action to a full commit SHA with a
version comment.

## Project layout

```
.changeset/                pending changesets (release notes and version bumps)
.github/workflows/ci.yml   the offline gates and the consumer smoke test
.github/workflows/release.yml
                           publishes a new version to npm; see docs/releasing.md
docs/                      the live validation notes and the release procedure
openapi/                   the OpenAPI 3.1 description and the private workspace package
                           that runs the type generator
scripts/consumer-smoke/    installs the packed tarball into a temporary npm project and
                           exercises it (import, require, type-check with types: [])
scripts/sync-version.mjs   writes package.json's version into SDK_VERSION
src/index.ts               the only public entry point; everything public is re-exported here
src/client.ts              NovaraFlexClient: options, call(), and the request loop
src/errors.ts              NovaraFlexError and its subclasses
src/version.ts             SDK_NAME and SDK_VERSION (generated; never edit the version by hand)
src/resources/             one module per API area behind the client's namespaces;
                           index.ts documents the naming rules
src/internal/
  contract.ts              the only module that imports src/generated; helper types
  envelope.ts              classifies a parsed response body (success, error, invalid)
  retry.ts                 the retry policy: which methods and failures, and the backoff
  throttle.ts              the opt-in client-side throttle
  paginate.ts              the …All paginators and the PAGED_METHODS table
  raw.ts                   the internal channel for the CSV and attachment methods
  media.ts                 content-type, CSV paging header, and redirect rules
src/generated/             generated types; never edit by hand, never exported
src/test-support/          transport fakes shared by the unit tests; not built
src/**/*.test.ts           offline unit tests, colocated with the code
test/live/                 the opt-in live suite and its global setup
mise.toml                  pinned Node.js and pnpm versions
pnpm-workspace.yaml        workspace and dependency resolution settings
tsconfig.json              type-check config for src/ and the unit tests
tsconfig.build.json        build config (src/ → dist/)
tsconfig.live.json         type-check config for test/live (the only place @types/node applies)
vitest.config.ts           offline unit tests
vitest.live.config.ts      the live suite
```

## Adding or changing an endpoint

- Follow the naming rules at the top of `src/resources/index.ts`. Methods are hand-written
  one-line delegations to the client, each with a JSDoc summary and the vendor
  documentation URL.
- A paged method gets its `…All` companion and a `PAGED_METHODS` entry in
  `src/internal/paginate.ts` in the same change.
- Anything public is re-exported from `src/index.ts`, `type`-only where possible;
  `src/index.test.ts` asserts the exact runtime export list.
- The package has no runtime dependencies, and `src/` uses no Node globals, so it runs
  wherever the WHATWG `fetch` does.
- The token must never reach an error message, an error property, or a log, and neither
  may a redirect `Location` or an attachment key. `src/client.test.ts` checks this.

## Maintaining the OpenAPI description

`openapi/novara-flex-openapi-3.1.yaml` is a hand-maintained, unofficial description derived
from the vendor's public documentation, and the source of every request and response type.

- **The live API outranks the docs.** When the wire disagrees with the description, the
  description is wrong: fix the YAML, not the test.
- **Evidence rule for `required`.** A response property is `required` only where every
  record observed on the live API, from every method that returns its schema, carried it.
  Present-but-null counts as present. Anything not yet observed on the wire stays optional
  and is listed as unverified in [docs/live-validation.md](docs/live-validation.md).
- **Regenerate and commit both.** Change the YAML, run `pnpm generate`, review the diff in
  `src/generated/`, and commit the spec and the generated types together.
  `pnpm generate:check` fails when they disagree.
- **Never edit `src/generated/` by hand.** Biome ignores it so it stays byte-identical to
  the generator output. Only `src/internal/contract.ts` may import it.
- The generator runs in the private workspace package under `openapi/` with its own
  TypeScript 5, because `openapi-typescript` needs the JavaScript compiler API that the
  TypeScript 7 native compiler no longer ships.

## Live API tests

`pnpm test:live` runs an opt-in suite under `test/live/` against the real Novara Flex API.
It is never part of `pnpm check` or CI. Run it only when a change needs it: it spends the
account's shared rate-limit budget.

```sh
cp .env.example .env   # then set NOVARA_FLEX_TOKEN; .env is gitignored
pnpm test:live
```

- **Credentials.** `test/live/global-setup.ts` loads `.env` and hands the token to the
  tests through vitest's `provide`/`inject`. Tests never read `process.env`, and never
  import `src/internal` or `src/generated`. Without a token the suite fails at once and
  sends nothing. Prefer a dedicated test credential.
- **Rate limits.** Every request goes through one client throttled to 40 requests a
  minute, and the run fails if any response is a rate limit, rather than letting the SDK
  absorb it. A run takes about a minute or longer by design. Never trigger the rate limit
  on purpose.
- **Read-only methods only.** The full list is in the header of
  `test/live/endpoints.test.ts`; extend it when a new read method gets a wrapper.
  `dataload.create` writes to the account and can send email, so it is never called;
  `dataload.info` is only asked about an id that cannot exist.
- **Privacy.** Live data is real people's safety data. Never print CSV contents,
  attachment bytes or keys, redirect URLs, or response bodies; assert types, sizes, and
  booleans only. Never copy a live value into the spec, a fixture, the docs, a commit, or
  an issue; record findings in [docs/live-validation.md](docs/live-validation.md) in
  account-neutral terms.
- **Field tables.** Each `*_FIELDS` table lists every required key of its schema, and the
  compiler checks it against the public types in both directions.

## Releasing

If a pull request changes what consumers get (the public API, runtime behavior, the
published types, or the package metadata), add a changeset with `pnpm changeset` and commit
the new `.changeset/*.md` file with it. Its summary becomes the `CHANGELOG.md` entry. Pull
requests that only touch tests, CI, or docs that don't ship need none.

Cutting a release, the publish workflow, and its one-time setup are described in
[docs/releasing.md](docs/releasing.md).
