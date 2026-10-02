/**
 * SDK identity constants.
 *
 * These live in their own module so that `src/client.ts` can build a
 * `user-agent` header without importing the public entry point, which would
 * create a cycle (`index.ts` -> `client.ts` -> `index.ts`).
 */

/** The published package name. */
export const SDK_NAME = "novara-flex-js" as const;

/**
 * The SDK version.
 *
 * The literal is written by `scripts/sync-version.mjs` from the `version` in
 * package.json (`pnpm version-packages` runs it); don't edit it by hand.
 * `src/version.test.ts` fails if the two ever differ.
 */
export const SDK_VERSION = "0.1.1" as const;
