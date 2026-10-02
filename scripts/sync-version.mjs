#!/usr/bin/env node
/**
 * Write the `version` from package.json into the `SDK_VERSION` literal in
 * `src/version.ts`, and touch nothing else in that file.
 *
 *   node scripts/sync-version.mjs
 *
 * `pnpm version-packages` runs it right after `changeset version`, which bumps
 * package.json, so the release PR carries both. The unit test in
 * `src/version.test.ts` fails whenever the two disagree.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versionFile = join(repoRoot, "src", "version.ts");
const { version } = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
);

if (typeof version !== "string" || version === "") {
  throw new Error("sync-version: package.json has no version string");
}

const pattern = /^(export const SDK_VERSION = )"[^"]*"( as const;)$/gm;
const source = readFileSync(versionFile, "utf8");
const matches = source.match(pattern);
if (matches?.length !== 1) {
  throw new Error(
    `sync-version: expected one SDK_VERSION declaration in src/version.ts, found ${matches?.length ?? 0}`,
  );
}

const updated = source.replace(pattern, `$1${JSON.stringify(version)}$2`);
if (updated === source) {
  console.log(`sync-version: src/version.ts is already at ${version}`);
} else {
  writeFileSync(versionFile, updated);
  console.log(`sync-version: src/version.ts set to ${version}`);
}
