// Type-checked only (never run): a CommonJS TypeScript consumer, which
// resolves the ESM-only package through require(esm) under `nodenext`.
import { NovaraFlexClient, SDK_VERSION } from "novara-flex-js";

const flex = new NovaraFlexClient({
  token: "dummy-token",
  fetch: async () => new Response(JSON.stringify({ ok: true })),
});

export async function ping(): Promise<boolean> {
  const result = await flex.call("api.ping");
  return result.ok;
}

export const version: string = SDK_VERSION;
