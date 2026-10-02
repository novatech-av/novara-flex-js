// Shared by esm.mjs and cjs.cjs, which differ only in how they load the
// package. Runs inside the throwaway consumer project, never in the repo.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const installed = JSON.parse(
  readFileSync(
    join(__dirname, "node_modules", "novara-flex-js", "package.json"),
    "utf8",
  ),
);

/** Build a client on a fake `fetch`, make one call, and check the identity. */
async function exercise(sdk, loader) {
  assert.equal(sdk.SDK_NAME, installed.name);
  assert.equal(sdk.SDK_VERSION, installed.version);

  const requests = [];
  const flex = new sdk.NovaraFlexClient({
    token: "dummy-token",
    // `.invalid` never resolves, so nothing can leave the machine even if the
    // fake below were bypassed.
    baseUrl: "https://novara-flex.invalid/v1",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await flex.call("api.ping");
  assert.deepEqual(result, { ok: true });
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.url, "https://novara-flex.invalid/v1/api.ping");
  assert.equal(request.init.method, "POST");
  assert.deepEqual(JSON.parse(request.init.body), { token: "dummy-token" });
  assert.equal(
    request.init.headers["user-agent"],
    `${installed.name}/${installed.version}`,
  );

  console.log(`${loader}: ok (${installed.name}@${installed.version})`);
}

module.exports = { exercise };
