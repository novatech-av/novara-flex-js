import type { TestProject } from "vitest/node";

/**
 * Global setup for the opt-in live API suite.
 *
 * Loads `.env` from the repo root (optional — the environment may already
 * carry the variables, for example when exported in the shell) and hands the
 * credential to the test files through vitest's `provide`/`inject` channel,
 * so no test file ever reads `process.env` itself.
 *
 * The token is never logged, never echoed into an error message, and never
 * written to disk.
 */

/** The name of the injected credential, shared with the test files. */
const KEY = "novaraFlex";

/** The credential and endpoint the live tests run against. */
export interface NovaraFlexLiveConfig {
  /** The Novara Flex API token. Never log this. */
  token: string;
  /** Overrides the client's default base URL when set. */
  baseUrl?: string;
}

declare module "vitest" {
  interface ProvidedContext {
    novaraFlex: NovaraFlexLiveConfig;
  }
}

/** The message shown when the suite is run without a credential. */
const MISSING_TOKEN_MESSAGE = [
  "The live API tests are opt-in and need a real Novara Flex credential.",
  "Set NOVARA_FLEX_TOKEN (copy .env.example to .env and fill it in), then rerun `pnpm test:live`.",
  "`pnpm test` and `pnpm check` do not need a token and stay fully offline.",
].join("\n");

/** Load `.env` if it exists. A missing file is fine; anything else is not. */
function loadDotEnv(): void {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
    throw error;
  }
}

export default function setup({ provide }: TestProject): void {
  loadDotEnv();

  const token = process.env.NOVARA_FLEX_TOKEN;
  if (token === undefined || token.length === 0) {
    throw new Error(MISSING_TOKEN_MESSAGE);
  }

  const baseUrl = process.env.NOVARA_FLEX_BASE_URL;
  provide(KEY, {
    token,
    // `exactOptionalPropertyTypes`: omit the key entirely rather than pass undefined.
    ...(baseUrl !== undefined && baseUrl.length > 0 ? { baseUrl } : {}),
  });
}
