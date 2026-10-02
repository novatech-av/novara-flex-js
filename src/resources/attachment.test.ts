import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { type NovaraFlexAttachment, NovaraFlexClient } from "../client.js";
import {
  NovaraFlexApiError,
  NovaraFlexRateLimitError,
  NovaraFlexTransportError,
} from "../errors.js";
import {
  BASE_URL,
  bodyOf,
  type Capture,
  createClient,
  fakeFetch,
  hang,
  jsonResponse,
  type Responder,
  stalledBodyResponse,
  TOKEN,
} from "../test-support/fake-fetch.js";

/** An attachment key that must never surface in an error. */
const KEY = "c0ffee00/public/KEY_do_not_leak_7f3a/photo.jpg";

/** A signed redirect target that must never surface in an error. */
const LOCATION =
  "https://files.example.test/bucket/photo.jpg?X-Signature=SIG_do_not_leak_91b2";

/** The bytes every fake attachment carries. */
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** A file response with the given `Content-Type`, or none. */
function fileResponse(contentType?: string): Response {
  return new Response(BYTES, {
    status: 200,
    ...(contentType === undefined
      ? {}
      : { headers: { "content-type": contentType } }),
  });
}

/** A redirect with the given status and `Location`, or none. */
function redirectResponse(status: number, location?: string): Response {
  return new Response(null, {
    status,
    ...(location === undefined ? {} : { headers: { location } }),
  });
}

/**
 * A responder that answers the POST with `first`, then every GET that follows
 * a redirect with `then` (a file by default).
 */
function redirecting(
  first: () => Response,
  then: Responder = () => fileResponse("image/jpeg"),
): Responder {
  return (capture) =>
    capture.init?.method === "POST" ? first() : then(capture);
}

/** Settle `promise` to its rejection, failing the test if it resolves. */
async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: unknown) => error,
  );
}

/**
 * Assert that neither the token, the key, nor the redirect target appears in
 * the error's message, string form, serialization, stack, or any property —
 * its `cause` included.
 */
function expectNoSecrets(error: unknown): void {
  const err = error as Error & Record<string, unknown>;
  const cause = err.cause as (Error & Record<string, unknown>) | undefined;
  const texts = [
    err.message,
    String(err),
    JSON.stringify(err),
    String(err.stack),
    ...Object.values(err).map((value) => String(value)),
    ...(cause === undefined
      ? []
      : [String(cause), JSON.stringify(cause), cause.message]),
  ];
  for (const secret of [
    TOKEN,
    KEY,
    LOCATION,
    "SIG_do_not_leak",
    "KEY_do_not",
  ]) {
    for (const text of texts) {
      expect(text.includes(secret), "an error leaked a secret").toBe(false);
    }
  }
}

/** `true` when a captured request carries the token anywhere. */
function carriesToken(capture: Capture): boolean {
  return JSON.stringify({
    url: capture.url,
    body: capture.init?.body === undefined ? "" : String(capture.init.body),
    headers: capture.init?.headers ?? {},
  }).includes(TOKEN);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("flex.attachment.load", () => {
  it("posts the key to attachment.load with the token last and manual redirects", async () => {
    const { client, calls } = createClient(() => fileResponse("image/jpeg"));
    await client.attachment.load({ key: KEY });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/attachment.load`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.redirect).toBe("manual");
    expect(calls[0]?.init?.headers).toMatchObject({
      "content-type": "application/json",
      accept: "*/*",
    });
    expect(bodyOf(calls[0])).toEqual({ key: KEY, token: TOKEN });
    expect(Object.keys(bodyOf(calls[0])).at(-1)).toBe("token");
  });

  it("forwards the call options, signal included", async () => {
    const { client, calls } = createClient(() => fileResponse("image/png"));
    const controller = new AbortController();
    await client.attachment.load(
      { key: KEY, pretty: true },
      { signal: controller.signal },
    );
    expect(calls[0]?.init?.signal).toBe(controller.signal);
    expect(bodyOf(calls[0])).toEqual({ key: KEY, pretty: true, token: TOKEN });
  });

  it("rejects an invalid option, naming NovaraFlexCallOptions rather than call, before sending anything", async () => {
    const { client, calls } = createClient(() => fileResponse("image/jpeg"));
    const err = await failureOf(
      client.attachment.load({ key: KEY }, { timeoutMs: -1 }),
    );
    expect(err).toBeInstanceOf(TypeError);
    expect((err as Error).message).toMatch(
      /^NovaraFlexCallOptions\.timeoutMs must be a positive number/,
    );
    expect((err as Error).message).not.toContain("NovaraFlexClient.call");
    expectNoSecrets(err);
    expect(calls).toHaveLength(0);
  });

  for (const contentType of [
    "application/octet-stream",
    "application/pdf",
    "image/jpeg",
    "image/png",
    // Undocumented, but real uploads come in more types than the vendor lists.
    "image/heic",
    "text/plain; charset=utf-8",
    "IMAGE/JPEG",
  ]) {
    it(`resolves a ${contentType} file as a Blob with its content type`, async () => {
      const { client } = createClient(() => fileResponse(contentType));
      const file = await client.attachment.load({ key: KEY });

      expect(file.data).toBeInstanceOf(Blob);
      expect(file.data.size).toBe(BYTES.length);
      expect(new Uint8Array(await file.data.arrayBuffer())).toEqual(BYTES);
      expect(file.contentType).toBe(contentType);
      expect(Object.keys(file).sort()).toEqual(["contentType", "data"]);
    });
  }

  it("throws the vendor's error envelope as a NovaraFlexApiError", async () => {
    const { client } = createClient(() =>
      jsonResponse({
        ok: false,
        error: "invalid_key_for_customer",
        description: "Unknown key",
      }),
    );
    const err = await failureOf(client.attachment.load({ key: KEY }));

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err).not.toBeInstanceOf(NovaraFlexRateLimitError);
    const apiError = err as NovaraFlexApiError;
    expect(apiError.code).toBe("invalid_key_for_customer");
    expect(apiError.method).toBe("attachment.load");
    expect(apiError.description).toBe("Unknown key");
    expectNoSecrets(err);
  });

  it("throws a rate_limit_exceeded envelope as a NovaraFlexRateLimitError", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "rate_limit_exceeded" }),
    );
    const err = await failureOf(client.attachment.load({ key: KEY }));
    expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
    expect((err as NovaraFlexRateLimitError).status).toBe(200);
    expect((err as NovaraFlexRateLimitError).method).toBe("attachment.load");
  });

  it("throws an HTTP 429 as a NovaraFlexRateLimitError before reading the body", async () => {
    const { client } = createClient(
      () =>
        new Response("<html>slow down</html>", {
          status: 429,
          headers: { "content-type": "text/html", "Retry-After": "7" },
        }),
    );
    const err = await failureOf(client.attachment.load({ key: KEY }));
    expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
    const limit = err as NovaraFlexRateLimitError;
    expect(limit.status).toBe(429);
    expect(limit.retryAfterMs).toBe(7_000);
    expect(limit.method).toBe("attachment.load");
  });

  it("treats an HTTP 429 from a redirect target as http_status, not a rate limit", async () => {
    const { client, calls } = createClient(
      redirecting(
        () => redirectResponse(302, LOCATION),
        () =>
          new Response("slow down", {
            status: 429,
            headers: { "content-type": "text/plain", "Retry-After": "7" },
          }),
      ),
    );
    const err = await failureOf(client.attachment.load({ key: KEY }));
    expect(err).not.toBeInstanceOf(NovaraFlexRateLimitError);
    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect((err as NovaraFlexTransportError).reason).toBe("http_status");
    expect((err as NovaraFlexTransportError).status).toBe(429);
    expect(calls).toHaveLength(2);
    // No client-wide cooldown: the next request is sent at once.
    await client.attachment.load({ key: KEY }).catch(() => undefined);
    expect(calls).toHaveLength(4);
  });

  const wrongTypes: ReadonlyArray<[string, () => Response, string]> = [
    [
      "an HTML page",
      () =>
        new Response("<html></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      "Novara Flex attachment.load: expected a file but the response was text/html",
    ],
    [
      "no content type",
      () => fileResponse(),
      "Novara Flex attachment.load: expected a file but the response was missing a content type",
    ],
    [
      "a JSON success envelope",
      () => jsonResponse({ ok: true }),
      "Novara Flex attachment.load: expected a file but the response was a JSON success envelope",
    ],
    [
      "JSON that is not an envelope",
      () => jsonResponse([1, 2]),
      "Novara Flex attachment.load: expected a file but the response was JSON that is not a Novara Flex envelope",
    ],
  ];

  for (const [label, respond, message] of wrongTypes) {
    it(`rejects ${label} with reason content_type`, async () => {
      const { client, calls } = createClient(respond);
      const err = await failureOf(client.attachment.load({ key: KEY }));

      expect(err).toBeInstanceOf(NovaraFlexTransportError);
      const transport = err as NovaraFlexTransportError;
      expect(transport.reason).toBe("content_type");
      expect(transport.method).toBe("attachment.load");
      expect(transport.status).toBe(200);
      expect(transport.message).toBe(message);
      expect(calls).toHaveLength(1);
      expectNoSecrets(err);
    });
  }

  it("puts the parse failure of a JSON body on cause", async () => {
    const { client } = createClient(
      () =>
        new Response("{not json", {
          headers: { "content-type": "application/json" },
        }),
    );
    const err = (await failureOf(
      client.attachment.load({ key: KEY }),
    )) as NovaraFlexTransportError;
    expect(err.reason).toBe("content_type");
    expect(err.message).toBe(
      "Novara Flex attachment.load: expected a file but the response was application/json that did not parse",
    );
    expect(err.cause).toBeInstanceOf(SyntaxError);
  });

  it("never quotes a content type that is not a plain type/subtype", async () => {
    const { client } = createClient(() => fileResponse("text/html"));
    const err = (await failureOf(
      client.attachment.load({ key: KEY }),
    )) as NovaraFlexTransportError;
    expect(err.message).toContain("text/html");

    const odd = createClient(() => fileResponse("not a media type"));
    const blob = await odd.client.attachment.load({ key: KEY });
    expect(blob.contentType).toBe("not a media type");
  });

  it("reports any other status as http_status", async () => {
    const { client } = createClient(
      () => new Response("gone", { status: 404 }),
    );
    const err = (await failureOf(
      client.attachment.load({ key: KEY }),
    )) as NovaraFlexTransportError;
    expect(err.reason).toBe("http_status");
    expect(err.status).toBe(404);
  });

  it("keeps the token and the key out of every failure", async () => {
    const failing: Responder[] = [
      () => jsonResponse({ ok: false, error: "invalid_key_for_customer" }),
      () => fileResponse("text/html"),
      () => new Response("boom", { status: 500 }),
      () => {
        throw new TypeError(`fetch failed for ${TOKEN} and ${KEY}`);
      },
    ];
    for (const respond of failing) {
      const { client } = createClient(respond);
      const err = await failureOf(client.attachment.load({ key: KEY }));
      expect(err).toBeInstanceOf(Error);
      // A rejected fetch keeps its own failure on `cause`, as `call` does; the
      // canary here lives only in that cause, which the SDK did not write.
      if ((err as NovaraFlexTransportError).reason === "network") {
        expect((err as Error).message.includes(TOKEN)).toBe(false);
        expect((err as Error).message.includes(KEY)).toBe(false);
        continue;
      }
      expectNoSecrets(err);
    }
  });

  it("does not change call, which still parses a file as JSON and follows redirects itself", async () => {
    const { client, calls } = createClient(() => fileResponse("image/jpeg"));
    const err = (await failureOf(
      client.call("attachment.load", { key: KEY }),
    )) as NovaraFlexTransportError;
    expect(err.reason).toBe("invalid_json");
    expect(calls[0]?.init && "redirect" in calls[0].init).toBe(false);
    expect(calls[0]?.init?.headers).toMatchObject({
      accept: "application/json",
    });
  });
});

describe("flex.attachment.load redirects", () => {
  for (const status of [301, 302, 303, 307, 308]) {
    it(`follows a ${status} with a GET that carries no body, headers, or token`, async () => {
      const { client, calls } = createClient(
        redirecting(() => redirectResponse(status, LOCATION)),
      );
      const file = await client.attachment.load({ key: KEY });

      expect(file.contentType).toBe("image/jpeg");
      expect(file.data.size).toBe(BYTES.length);
      expect(calls).toHaveLength(2);
      expect(calls[1]?.url).toBe(LOCATION);
      expect(calls[1]?.init?.method).toBe("GET");
      expect(calls[1]?.init?.body).toBeUndefined();
      expect(calls[1]?.init?.headers).toBeUndefined();
      expect(calls[1]?.init?.redirect).toBe("manual");
      // Only the POST to the vendor ever carries the token.
      expect(calls.map(carriesToken)).toEqual([true, false]);
    });
  }

  it("resolves a relative Location against the request URL", async () => {
    const { client, calls } = createClient(
      redirecting(() => redirectResponse(302, "/files/photo.jpg")),
    );
    await client.attachment.load({ key: KEY });
    expect(calls[1]?.url).toBe("https://example.test/files/photo.jpg");
  });

  it("follows up to five redirects, resolving each against the last", async () => {
    let hop = 0;
    const { client, calls } = createClient((capture) => {
      if (capture.init?.method === "POST") {
        return redirectResponse(307, "https://hop.example.test/1");
      }
      hop += 1;
      return hop < 5
        ? redirectResponse(308, `/${hop + 1}`)
        : fileResponse("application/pdf");
    });
    const file = await client.attachment.load({ key: KEY });

    expect(file.contentType).toBe("application/pdf");
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE_URL}/attachment.load`,
      "https://hop.example.test/1",
      "https://hop.example.test/2",
      "https://hop.example.test/3",
      "https://hop.example.test/4",
      "https://hop.example.test/5",
    ]);
    expect(calls.map(carriesToken)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("gives up after five redirects with http_status", async () => {
    const { client, calls } = createClient(() =>
      redirectResponse(302, LOCATION),
    );
    const err = (await failureOf(
      client.attachment.load({ key: KEY }),
    )) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.reason).toBe("http_status");
    expect(err.status).toBe(302);
    expect(err.message).toBe(
      "Novara Flex attachment.load: redirected more than 5 times",
    );
    expect(calls).toHaveLength(6);
    expectNoSecrets(err);
  });

  const unfollowable: ReadonlyArray<[string, string | undefined]> = [
    ["a missing Location", undefined],
    ["an empty Location", ""],
    ["a javascript: Location", "javascript:alert(1)"],
    ["an ftp: Location", "ftp://files.example.test/photo.jpg"],
    ["a data: Location", "data:image/jpeg;base64,AAAA"],
    [
      "an http: Location from an https: base URL",
      "http://files.example.test/x",
    ],
    [
      "a Location with credentials",
      "https://user:SIG_do_not_leak@files.example.test/x",
    ],
    ["a Location that does not parse", "https://[bad"],
  ];

  for (const [label, location] of unfollowable) {
    it(`refuses ${label} with http_status and never follows it`, async () => {
      const { client, calls } = createClient(() =>
        redirectResponse(302, location),
      );
      const err = (await failureOf(
        client.attachment.load({ key: KEY }),
      )) as NovaraFlexTransportError;

      expect(err).toBeInstanceOf(NovaraFlexTransportError);
      expect(err.reason).toBe("http_status");
      expect(err.status).toBe(302);
      expect(err.message).toBe(
        "Novara Flex attachment.load: responded with HTTP 302 and a redirect the SDK cannot follow safely",
      );
      expect(calls).toHaveLength(1);
      expectNoSecrets(err);
    });
  }

  it("follows an http: Location when the base URL is itself http:", async () => {
    const { fetch, calls } = fakeFetch(
      redirecting(() => redirectResponse(302, "http://files.localhost.test/x")),
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      baseUrl: "http://localhost.test/v1",
      retry: { maxRetries: 0 },
    });
    await client.attachment.load({ key: KEY });
    expect(calls[1]?.url).toBe("http://files.localhost.test/x");
  });

  it("does not follow a 300 or a 304, which are not redirects to a Location", async () => {
    for (const status of [300, 304]) {
      const { client, calls } = createClient(() =>
        redirectResponse(status, LOCATION),
      );
      const err = (await failureOf(
        client.attachment.load({ key: KEY }),
      )) as NovaraFlexTransportError;
      expect(err.reason).toBe("http_status");
      expect(err.status).toBe(status);
      expect(calls).toHaveLength(1);
    }
  });

  it("refuses a browser's opaque redirect with http_status", async () => {
    const { client } = createClient(() => {
      // A browser hides a manual redirect's status and Location behind an
      // `opaqueredirect` response with status 0, which no constructor makes.
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "type", { value: "opaqueredirect" });
      return response;
    });
    const err = (await failureOf(
      client.attachment.load({ key: KEY }),
    )) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.reason).toBe("http_status");
    expect(err.message).toBe(
      "Novara Flex attachment.load: redirected, but this environment hides the redirect target, so the SDK cannot follow it safely",
    );
  });

  it("treats JSON behind a redirect as the file, not as a vendor envelope", async () => {
    const { client } = createClient(
      redirecting(
        () => redirectResponse(302, LOCATION),
        () => jsonResponse({ ok: false, error: "server_error" }),
      ),
    );
    const file = await client.attachment.load({ key: KEY });
    expect(file.contentType).toBe("application/json");
    expect(JSON.parse(await file.data.text())).toEqual({
      ok: false,
      error: "server_error",
    });
  });

  it("reports the target's own failure status as http_status", async () => {
    const { client } = createClient(
      redirecting(
        () => redirectResponse(302, LOCATION),
        () =>
          new Response("<Error>AccessDenied</Error>", {
            status: 403,
            headers: { "content-type": "application/xml" },
          }),
      ),
    );
    const err = (await failureOf(
      client.attachment.load({ key: KEY }),
    )) as NovaraFlexTransportError;
    expect(err.reason).toBe("http_status");
    expect(err.status).toBe(403);
    expectNoSecrets(err);
  });

  it("keeps the vendor's request id when the target sends none", async () => {
    const { client } = createClient(
      redirecting(
        () =>
          new Response(null, {
            status: 302,
            headers: { location: LOCATION, "HZS-Request-ID": "req-302" },
          }),
        () => new Response("nope", { status: 403 }),
      ),
    );
    const err = (await failureOf(
      client.attachment.load({ key: KEY }),
    )) as NovaraFlexTransportError;
    expect(err.requestId).toBe("req-302");
  });

  it("reports a failed hop as network without its cause, which may hold the URL", async () => {
    const { client } = createClient(
      redirecting(
        () => redirectResponse(302, LOCATION),
        ({ url }) => {
          throw new TypeError(`fetch failed for ${url}`);
        },
      ),
    );
    const err = (await failureOf(
      client.attachment.load({ key: KEY }),
    )) as NovaraFlexTransportError;
    expect(err.reason).toBe("network");
    expect(err.message).toBe(
      "Novara Flex attachment.load: network request failed while following a redirect",
    );
    expect(err.cause).toBeUndefined();
    expectNoSecrets(err);
  });
});

describe("flex.attachment.load reliability", () => {
  it("retries a 5xx, as a read, and then follows the redirect", async () => {
    let posts = 0;
    const { fetch, calls } = fakeFetch((capture) => {
      if (capture.init?.method !== "POST") return fileResponse("image/png");
      posts += 1;
      return posts === 1
        ? new Response("unavailable", { status: 503 })
        : redirectResponse(302, LOCATION);
    });
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      baseUrl: BASE_URL,
      retry: { baseDelayMs: 0 },
    });
    const file = await client.attachment.load({ key: KEY });

    expect(file.contentType).toBe("image/png");
    expect(calls.map((c) => c.init?.method)).toEqual(["POST", "POST", "GET"]);
    expect(calls.map(carriesToken)).toEqual([true, true, false]);
  });

  it("never retries a content_type failure", async () => {
    const { fetch, calls } = fakeFetch(() => fileResponse("text/html"));
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: { baseDelayMs: 0 },
    });
    const err = (await failureOf(
      client.attachment.load({ key: KEY }),
    )) as NovaraFlexTransportError;
    expect(err.reason).toBe("content_type");
    expect(err.attempts).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("times out while the file body is still arriving", async () => {
    vi.useFakeTimers();
    const { fetch } = fakeFetch(({ init }) =>
      stalledBodyResponse(init?.signal, {
        "content-type": "image/jpeg",
        "HZS-Request-ID": "req-slow",
      }),
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      timeoutMs: 1_000,
      retry: { maxRetries: 0 },
    });
    const outcome = failureOf(client.attachment.load({ key: KEY }));
    await vi.advanceTimersByTimeAsync(1_000);

    const err = (await outcome) as NovaraFlexTransportError;
    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.reason).toBe("timeout");
    expect(err.status).toBe(200);
    expect(err.requestId).toBe("req-slow");
    expect(err.message).toBe(
      "Novara Flex attachment.load timed out after 1000 ms",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out while a redirect hop hangs, within the same attempt", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch(
      redirecting(() => redirectResponse(302, LOCATION), hang),
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      timeoutMs: 1_000,
      retry: { maxRetries: 0 },
    });
    const outcome = failureOf(client.attachment.load({ key: KEY }));
    await vi.advanceTimersByTimeAsync(1_000);

    const err = (await outcome) as NovaraFlexTransportError;
    expect(err.reason).toBe("timeout");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.init?.signal).toBe(calls[0]?.init?.signal);
    expectNoSecrets(err);
  });

  it("rethrows the caller's abort unchanged, even mid-redirect", async () => {
    for (const first of [
      hang,
      redirecting(() => redirectResponse(302, LOCATION), hang),
    ]) {
      const { client } = createClient(first);
      const controller = new AbortController();
      const reason = new Error("caller gave up");
      const outcome = failureOf(
        client.attachment.load({ key: KEY }, { signal: controller.signal }),
      );
      await Promise.resolve();
      controller.abort(reason);
      expect(await outcome).toBe(reason);
    }
  });
});

describe("flex.attachment types", () => {
  const { client } = createClient(() => fileResponse("image/jpeg"));

  it("requires a key and resolves to a NovaraFlexAttachment", () => {
    expectTypeOf(client.attachment.load({ key: KEY })).toEqualTypeOf<
      Promise<NovaraFlexAttachment>
    >();
    expectTypeOf<NovaraFlexAttachment>().toEqualTypeOf<{
      data: Blob;
      contentType: string;
    }>();
    // @ts-expect-error attachment.load requires a `key`
    void client.attachment.load({});
    // @ts-expect-error attachment.load requires a `key`
    void client.attachment.load();
    // @ts-expect-error `key` is a string
    void client.attachment.load({ key: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.attachment.load({ key: KEY, token: "override" });
  });
});
