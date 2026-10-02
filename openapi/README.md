# OpenAPI contract

`novara-flex-openapi-3.1.yaml` is an unofficial OpenAPI 3.1 description of the Novara Flex
API, derived from the public vendor documentation at <https://api.novaraflex.com/docs/>. It
is not a vendor artifact and is not endorsed by or supported by them.

This file is the single source for the generated types in `src/generated/openapi.ts`. To
change the contract, replace this YAML, run `pnpm generate` from the repo root, review the
diff, and commit the spec and the regenerated types together. Hand edits belong in this
YAML only; `pnpm generate` overwrites `src/generated/` on every run, so nothing in that
directory may be edited by hand.

`package.json` in this directory is a private workspace package that exists only to run
`openapi-typescript`; see CLAUDE.md for why the generator needs its own TypeScript.
