// Type-checked only (never run): an ESM TypeScript consumer.
import {
  NovaraFlexApiError,
  NovaraFlexClient,
  type NovaraFlexClientOptions,
  type NovaraFlexResult,
  SDK_VERSION,
} from "novara-flex-js";

const options: NovaraFlexClientOptions = {
  token: "dummy-token",
  fetch: async () => new Response(JSON.stringify({ ok: true })),
  rateLimit: { requestsPerMinute: 40 },
};
const flex = new NovaraFlexClient(options);

const ping: NovaraFlexResult<"api.ping"> = await flex.api.ping();
const ok: true = ping.ok;
const version: string = SDK_VERSION;

try {
  await flex.call("users.list");
} catch (error) {
  if (error instanceof NovaraFlexApiError) {
    const code: string = error.code;
    console.log(code);
  }
}

console.log(ok, version);
