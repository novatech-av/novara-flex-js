#!/usr/bin/env node
/**
 * Consumer smoke test: install the packed tarball into a throwaway project
 * outside this repository and use it the way a consumer would.
 *
 *   node scripts/consumer-smoke/run.mjs [path/to/novara-flex-js-x.y.z.tgz]
 *
 * Without an argument it packs the current `dist/` with `pnpm pack` first, so
 * build before running it (`pnpm test:consumer` does both). CI passes the
 * tarball the gates job packed, so every Node version tests the same bytes.
 *
 * The consumer project lives in the OS temp directory, not in this pnpm
 * workspace, and gets the package through `npm install <tarball>`. It then:
 *
 * - `import`s the package from an `.mjs` file and `require()`s it from a
 *   `.cjs` file, constructs a client with a dummy token and a fake `fetch`,
 *   makes one `call`, and checks `SDK_VERSION` against the installed
 *   `package.json`;
 * - type-checks an ESM (`.mts`) and a CommonJS (`.cts`) TypeScript consumer
 *   with `types: []` and `skipLibCheck: false`, so the run fails if the
 *   declarations ever need `@types/node`. It uses this repository's own
 *   TypeScript, which must be installed (`pnpm install`).
 *
 * Nothing here reads a credential or reaches the network beyond `npm install`
 * of a local tarball (which has no dependencies).
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

function run(command, args, cwd, { quiet = false } = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, {
    cwd,
    stdio: quiet ? ["ignore", "ignore", "inherit"] : "inherit",
  });
}

function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function findTsc() {
  const require = createRequire(join(repoRoot, "package.json"));
  try {
    return join(
      dirname(require.resolve("typescript/package.json")),
      "bin",
      "tsc",
    );
  } catch {
    throw new Error(
      "consumer smoke: TypeScript is not installed in this repository; run `pnpm install` first",
    );
  }
}

const tsc = findTsc();
const work = mkdtempSync(join(tmpdir(), "novara-flex-consumer-"));
if (isInside(work, repoRoot)) {
  throw new Error(
    `consumer smoke: the temp directory ${work} is inside the repository; point TMPDIR elsewhere`,
  );
}

let passed = false;
try {
  let tarball = process.argv[2];
  if (tarball === undefined) {
    const packDir = join(work, "pack");
    if (!existsSync(join(repoRoot, "dist", "index.js"))) {
      throw new Error(
        "consumer smoke: dist/ is missing; run `pnpm build` first",
      );
    }
    run("pnpm", ["pack", "--pack-destination", packDir], repoRoot, {
      quiet: true,
    });
    const packed = readdirSync(packDir).filter((name) => name.endsWith(".tgz"));
    if (packed.length !== 1) {
      throw new Error(
        `consumer smoke: expected one tarball, found ${packed.length}`,
      );
    }
    tarball = join(packDir, packed[0]);
  }
  tarball = resolve(tarball);
  if (!existsSync(tarball)) {
    throw new Error(`consumer smoke: no tarball at ${tarball}`);
  }

  const consumer = join(work, "consumer");
  cpSync(join(here, "fixture"), consumer, { recursive: true });
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify({ name: "novara-flex-consumer-smoke", private: true }, null, 2)}\n`,
  );

  console.log(`consumer smoke: Node ${process.version}, ${tarball}`);
  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--ignore-scripts",
      tarball,
    ],
    consumer,
  );
  run(process.execPath, ["esm.mjs"], consumer);
  run(process.execPath, ["cjs.cjs"], consumer);
  run(process.execPath, [tsc, "-p", "tsconfig.json"], consumer);
  console.log("consumer smoke: ok");
  passed = true;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    `consumer smoke: failed; the consumer project is kept at ${work}`,
  );
  process.exitCode = 1;
} finally {
  if (passed) rmSync(work, { recursive: true, force: true });
}
