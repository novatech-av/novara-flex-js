# Releasing

Versions, the changelog and npm releases are driven by
[Changesets](https://github.com/changesets/changesets) and published by the
`Release` workflow (`.github/workflows/release.yml`) with
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers). No npm
token is stored anywhere: npm authenticates the workflow through GitHub's OIDC
token and signs a [provenance statement](https://docs.npmjs.com/generating-provenance-statements)
for every release.

## Adding a changeset to a pull request

Every pull request that changes what consumers get (the public API, runtime
behavior, the published types, the package metadata) adds a changeset:

```sh
pnpm changeset
```

Pick `novara-flex-js` (the `openapi` workspace package is private and never
versioned), choose the bump, and write a summary for consumers: it becomes the
package's `CHANGELOG.md` entry, word for word. This commits nothing; commit the
new `.changeset/*.md` file with the rest of the pull request. Pull requests that
only touch tests, CI, or docs that don't ship need no changeset.

## Cutting a release

1. Start a branch from an up-to-date `main`:

   ```sh
   git switch main && git pull
   git switch -c release-v<next-version>
   ```

2. Consume the pending changesets:

   ```sh
   pnpm version-packages
   ```

   This runs `changeset version`, which bumps `version` in `package.json`,
   writes the new section of `CHANGELOG.md` and deletes the consumed
   changesets; then `scripts/sync-version.mjs`, which writes the same version
   into `SDK_VERSION` in `src/version.ts`; then Biome on the two changed source
   files. It fails if there are no changesets to release.

3. Review the diff (`package.json`, `src/version.ts`, `CHANGELOG.md`, the
   removed `.changeset/*.md` files), run `pnpm check`, commit, push, and open
   an ordinary pull request. CI runs on it like any other.

4. Merge it. The `Release` workflow sees a version that npm doesn't have yet,
   runs the full CI gates again, and then waits for approval of the `npm`
   environment.

5. Approve the deployment (the run's page shows **Review deployments**). The
   job publishes the package, then creates the `v<version>` tag on the merge
   commit and a GitHub release whose notes are that version's
   `CHANGELOG.md` section.

The workflow publishes to the `latest` dist-tag only; it doesn't handle
prerelease versions (`1.0.0-beta.0`), which npm refuses to publish without an
explicit `--tag`.

## What the Release workflow does

It runs on every push to `main` and on a manual dispatch:

- **`check`** (read-only token, no environment) reads the version from
  `package.json` and asks npm whether it is published
  (`npm view novara-flex-js@<version>`; only a 404 counts as "not published",
  any other failure stops the run). A version needs publishing when npm
  doesn't have it **and** `CHANGELOG.md` has a `## <version>` section, so the
  unreleased `0.0.0` never goes out. Only `main` publishes. When nothing needs
  publishing, which is most pushes, the run ends here, green, without touching
  the `npm` environment.
- **`ci`** calls `ci.yml`, the same gates every pull request runs.
- **`publish`** runs in the `npm` environment with exactly
  `id-token: write` (trusted publishing and provenance) and `contents: write`
  (the tag and the release). It installs and builds with no cache, refuses to
  continue if the `CHANGELOG.md` section is missing or the tag already exists,
  runs `npm publish`, and then `gh release create v<version>`.

Releases run one at a time and are never cancelled mid-run. If a run publishes but
fails to create the release, create it by hand: re-running the job would fail,
because npm never accepts the same version twice.

```sh
awk -v heading="## <version>" '$0 == heading {f=1; next} f && /^## / {exit} f' CHANGELOG.md > notes.md
gh release create v<version> --target <merge-commit-sha> --title v<version> --notes-file notes.md
```

## Dry run

Run **Actions → Release → Run workflow** with **Dry run** checked (the
default), on `main`. It runs the gates and the `publish` job (which still needs
the `npm` environment's approval), and replaces the publish with
`npm publish --dry-run` and the tag and release with a printout of what they
would be. Nothing is uploaded, tagged or released.

A dry run shows the tarball's contents, the version, the dist-tag and the
access, and it attempts the OIDC token exchange: if npm prints
`This command requires you to be logged in` the exchange failed, so check the
trusted publisher. It can't show provenance: npm builds and signs the
provenance statement only on a real publish. If the version is already on npm,
the dry run adds `--force`, because npm otherwise refuses even to dry-run a
published version.

The same check works locally after `pnpm build`: `npm publish --dry-run`.

## One-time setup on the public repository

### The `npm` environment

**Settings → Environments → New environment**, named exactly `npm`:

- **Required reviewers**: the maintainer(s). Turn on **Prevent self-review**
  if more than one person can approve.
- **Deployment branches and tags**: **Selected branches and tags**, `main`
  only.
- Leave **Allow administrators to bypass configured protection rules** off.
- Add no secrets: the workflow needs none.

If a tag ruleset ever protects `v*`, let GitHub Actions bypass it, or the
workflow can't create the release tag.

### npm trusted publisher

Trusted publishing can only be configured for a package that already exists on
npm ([`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust): "The
package you're configuring must already exist on the npm registry"), so the
first version is published by hand once (below). Afterwards, on npmjs.com, open
**novara-flex-js → Settings → Trusted publishing → GitHub Actions** and enter:

| Field                    | Value            |
| ------------------------ | ---------------- |
| Organization or user     | `novatech-av`    |
| Repository               | `novara-flex-js` |
| Workflow filename        | `release.yml`    |
| Environment name         | `npm`            |
| Allowed actions          | `npm publish`    |

npm doesn't validate these when you save them; a mistake shows up only as a
failed publish (`ENEEDAUTH`). New trusted publishers allow only
`npm stage publish` unless you also allow `npm publish`, which the workflow
uses. `package.json`'s `repository.url` must keep matching the repository.

Then, under **Settings → Publishing access**, choose **Require two-factor
authentication and disallow tokens**. Trusted publishing keeps working, since
it uses no token.

### Bootstrapping the first publish

Until the package exists, the workflow can't authenticate. Publish the first
version by hand, from the merged release commit, with no token left behind:

1. Merge the release pull request as usual. When the `Release` run asks for
   the `npm` environment, **reject** the deployment.
2. In a fresh clone of the public repository at that commit:

   ```sh
   mise install && pnpm install --frozen-lockfile
   pnpm check && pnpm run clean && pnpm run build
   npm publish --dry-run
   npm login
   npm publish --provenance=false
   npm logout
   ```

   `--provenance=false` is needed because provenance can only be generated in
   CI, and `publishConfig.provenance` would otherwise make the publish fail.
   `npm logout` ends the login token's session everywhere. This first version
   has no provenance; every later one does.
3. Configure the trusted publisher and the publishing access as above.
4. Create the tag and the GitHub release by hand (the commands in
   [What the Release workflow does](#what-the-release-workflow-does)).
5. Dispatch a dry run: it should not print
   `This command requires you to be logged in`.

## Requirements

Trusted publishing needs npm CLI 11.5.1 or later and Node 22.14.0 or later, on
a GitHub-hosted runner. The workflow takes Node and npm from `mise.toml`, so
keep that pin above those minimums. Provenance is generated only when both the
repository and the package are public.
