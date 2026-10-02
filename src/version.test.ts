import { describe, expect, it } from "vitest";
// Test-only JSON import: `resolveJsonModule` is on in tsconfig.json for type
// checking and off in tsconfig.build.json, so no build input can import it.
import packageJson from "../package.json" with { type: "json" };
import { SDK_NAME, SDK_VERSION } from "./version.js";

describe("SDK identity", () => {
  it("matches the package name in package.json", () => {
    expect(SDK_NAME).toBe(packageJson.name);
  });

  // SDK_VERSION is generated: run `node scripts/sync-version.mjs` (or
  // `pnpm version-packages` when cutting a release) if this fails.
  it("matches the version in package.json", () => {
    expect(SDK_VERSION).toBe(packageJson.version);
  });
});
