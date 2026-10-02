/**
 * Offline unit tests for `flex.dataload`.
 *
 * Every request in this file is answered by the fake transport. `dataload.create`
 * writes to the account and can send email, so it is never called against the
 * live API — not here, not in `test/live/`.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { NovaraFlexClient, type NovaraFlexResult } from "../client.js";
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
  TOKEN,
} from "../test-support/fake-fetch.js";

/** The data-load every `info` request in this file asks about. */
const DATALOAD_ID = "5804f0f30ef50473af5870c6";

/** A minimal `dataload.create` success body: the id `info` then polls. */
const DATALOAD_CREATE_BODY = {
  ok: true,
  dataload: { id: DATALOAD_ID },
};

/** A minimal `dataload.info` success body. */
const DATALOAD_BODY = {
  ok: true,
  dataload: {
    id: DATALOAD_ID,
    created: 1_473_688_379_489,
    creator_id: "5804f0f30ef50473af5870c5",
    adapter: "acme-hr",
    status: "dataloaded",
    history: "queued -> loading -> loaded",
  },
};

/**
 * A CSV data URI and a file URL distinctive enough that a leak is detectable.
 *
 * Both can carry personal data, so they fall under the same rule as the token:
 * never in a message, never in an error property, never in a log.
 */
const FILE_CANARY = "data:text/csv;base64,RklMRV9DQU5BUllfZG9fbm90X2xlYWs=";
const URL_CANARY = "https://example.com/URL_CANARY_do_not_leak.csv";
const EMAIL_CANARY = "canary-fail@example.com";

describe("flex.dataload.create", () => {
  it("posts to baseUrl/dataload.create with only the injected token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(DATALOAD_CREATE_BODY),
    );
    await client.dataload.create();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/dataload.create`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards every parameter and never lets them override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(DATALOAD_CREATE_BODY),
    );
    await client.dataload.create({
      url: "https://example.com/signed-file.csv",
      file: "data:text/csv;base64,YQ==",
      adapter: "acme-hr",
      name: "simple-file-name.csv",
      failureEmails: ["jane@example.com"],
      successEmails: ["john@example.com"],
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      url: "https://example.com/signed-file.csv",
      file: "data:text/csv;base64,YQ==",
      adapter: "acme-hr",
      name: "simple-file-name.csv",
      failureEmails: ["jane@example.com"],
      successEmails: ["john@example.com"],
      pretty: true,
      token: TOKEN,
    });

    await client.dataload.create({
      token: "attacker-supplied",
    } as unknown as { adapter?: string });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(DATALOAD_CREATE_BODY),
    );
    const controller = new AbortController();
    await client.dataload.create(
      { adapter: "acme-hr" },
      { signal: controller.signal },
    );
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, keeping dataload.id reachable", async () => {
    const { client } = createClient(() => jsonResponse(DATALOAD_CREATE_BODY));
    const result = await client.dataload.create({ adapter: "acme-hr" });

    expect(result).toEqual(DATALOAD_CREATE_BODY);
    expect(result.ok).toBe(true);
    // The id `info` polls with: nothing is unwrapped on the way out.
    expect(result.dataload.id).toBe(DATALOAD_ID);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.dataload
      .create({ adapter: "acme-hr" })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("dataload.create");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.dataload
      .create({ adapter: "acme-hr" })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("dataload.create");
    expect(err.message).toBe(
      "Novara Flex dataload.create: returned a non-JSON body",
    );
  });
});

describe("flex.dataload.info", () => {
  it("posts the id to baseUrl/dataload.info with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(DATALOAD_BODY));
    await client.dataload.info({ id: DATALOAD_ID });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/dataload.info`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ id: DATALOAD_ID, token: TOKEN });
  });

  it("forwards pretty and an abort signal, and keeps the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(DATALOAD_BODY));
    const controller = new AbortController();
    await client.dataload.info(
      { id: DATALOAD_ID, pretty: true },
      { signal: controller.signal },
    );

    expect(bodyOf(calls[0])).toEqual({
      id: DATALOAD_ID,
      pretty: true,
      token: TOKEN,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);

    await client.dataload.info({
      id: DATALOAD_ID,
      token: "attacker-supplied",
    } as unknown as { id: string });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("returns the whole success body with the load's status", async () => {
    const { client } = createClient(() => jsonResponse(DATALOAD_BODY));
    const result = await client.dataload.info({ id: DATALOAD_ID });

    expect(result).toEqual(DATALOAD_BODY);
    expect(result.ok).toBe(true);
    expect(result.dataload.id).toBe(DATALOAD_ID);
    expect(result.dataload.status).toBe("dataloaded");
    expect(typeof result.dataload.history).toBe("string");
    // The contract narrows `status` to the vendor's four states.
    expectTypeOf(result.dataload.status).toEqualTypeOf<
      "dataload" | "dataloading" | "dataloaded" | "error" | undefined
    >();
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "content_not_found" }),
    );
    const err = (await client.dataload
      .info({ id: DATALOAD_ID })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("content_not_found");
    expect(err.method).toBe("dataload.info");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.dataload
      .info({ id: DATALOAD_ID })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("dataload.info");
    expect(err.message).toBe(
      "Novara Flex dataload.info: returned a non-JSON body",
    );
  });
});

describe("flex.dataload payload confidentiality", () => {
  /** Everything that must never come back out of an error. */
  const SECRETS = [FILE_CANARY, URL_CANARY, EMAIL_CANARY, TOKEN];

  /** Every string an error exposes: message, own properties, cause, stack. */
  function exposedText(err: unknown): string {
    const own = Object.getOwnPropertyNames(err as object).map((key) => {
      try {
        return (err as Record<string, unknown>)[key];
      } catch {
        return undefined;
      }
    });
    return [
      String(err),
      (err as Error).message,
      (err as Error).stack ?? "",
      JSON.stringify(err),
      JSON.stringify({ ...(err as object) }),
      JSON.stringify(own),
      String((err as { cause?: unknown }).cause ?? ""),
    ].join("\n");
  }

  const failures: [string, () => Response | Promise<Response>][] = [
    [
      "an application error",
      () =>
        jsonResponse({
          ok: false,
          error: "invalid_arguments",
          description: "bad file",
        }),
    ],
    ["an HTTP 500", () => new Response("boom", { status: 500 })],
    [
      "a non-JSON body",
      () => new Response("<html>nope</html>", { status: 200 }),
    ],
    ["a rejected fetch", () => Promise.reject(new TypeError("fetch failed"))],
  ];

  for (const [label, respond] of failures) {
    it(`keeps file, url, and emails out of the error after ${label}`, async () => {
      const { client, calls } = createClient(() => respond());
      const err = (await client.dataload
        .create({
          url: URL_CANARY,
          file: FILE_CANARY,
          failureEmails: [EMAIL_CANARY],
        })
        .catch((e: unknown) => e)) as Error;

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain("dataload.create");

      // The request really did carry the payload: this proves forwarding, so
      // the assertions below are about the error and not about a dropped body.
      const sent = bodyOf(calls[0]);
      expect(sent.url).toBe(URL_CANARY);
      expect(sent.file).toBe(FILE_CANARY);
      expect(sent.failureEmails).toEqual([EMAIL_CANARY]);
      expect(sent.token).toBe(TOKEN);

      const text = exposedText(err);
      for (const secret of SECRETS) {
        // Asserted as a boolean so a failure can never print the secret.
        expect(
          text.includes(secret),
          `${label} leaked a create parameter`,
        ).toBe(false);
      }
    });
  }

  it("keeps the data-load id out of an info failure", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "content_not_found" }),
    );
    const err = (await client.dataload
      .info({ id: DATALOAD_ID })
      .catch((e: unknown) => e)) as Error;

    const text = exposedText(err);
    expect(text.includes(DATALOAD_ID), "info leaked the data-load id").toBe(
      false,
    );
    expect(text.includes(TOKEN), "info leaked the token").toBe(false);
  });
});

describe("flex.dataload retries, under the default retry policy", () => {
  // `createClient` disables retries; these tests need the defaults, because
  // what they prove is that the default never repeats a write.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(1);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** A client with the default retry policy and a 1 s timeout. */
  function defaultClient(respond: Responder): {
    client: NovaraFlexClient;
    calls: Capture[];
  } {
    const { fetch, calls } = fakeFetch(respond);
    return {
      client: new NovaraFlexClient({
        token: TOKEN,
        fetch,
        baseUrl: BASE_URL,
        timeoutMs: 1_000,
      }),
      calls,
    };
  }

  /** Settle `promise`, running every timer (timeouts and backoffs) on the way. */
  async function settle(promise: Promise<unknown>): Promise<unknown> {
    const outcome = promise.then(
      (value) => value,
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();
    return await outcome;
  }

  // Every failure that a read would retry, and the error class it surfaces as.
  const transient: ReadonlyArray<
    [string, Responder, new (...args: never[]) => Error]
  > = [
    [
      "a server_error envelope",
      () => jsonResponse({ ok: false, error: "server_error" }),
      NovaraFlexApiError,
    ],
    [
      "a rate_limit_exceeded envelope",
      () => jsonResponse({ ok: false, error: "rate_limit_exceeded" }),
      NovaraFlexRateLimitError,
    ],
    [
      "HTTP 429",
      () => new Response("slow down", { status: 429 }),
      NovaraFlexRateLimitError,
    ],
    [
      "HTTP 500",
      () => new Response("boom", { status: 500 }),
      NovaraFlexTransportError,
    ],
    [
      "a network rejection",
      () => Promise.reject(new TypeError("fetch failed")),
      NovaraFlexTransportError,
    ],
    ["a timeout", hang, NovaraFlexTransportError],
  ];

  for (const [label, respond, errorClass] of transient) {
    it(`sends dataload.create exactly once on ${label}`, async () => {
      const { client, calls } = defaultClient(respond);
      const err = (await settle(
        client.dataload.create({ file: FILE_CANARY }),
      )) as NovaraFlexApiError | NovaraFlexTransportError;

      expect(err).toBeInstanceOf(errorClass);
      expect(err.attempts).toBe(1);
      expect(err.method).toBe("dataload.create");
      expect(calls).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it(`sends call("dataload.create") exactly once on ${label}`, async () => {
      const { client, calls } = defaultClient(respond);
      const err = (await settle(
        client.call("dataload.create", { file: FILE_CANARY }),
      )) as NovaraFlexApiError | NovaraFlexTransportError;

      expect(err).toBeInstanceOf(errorClass);
      expect(err.attempts).toBe(1);
      expect(calls).toHaveLength(1);
    });
  }

  it("reports a rate limit on dataload.create as NovaraFlexRateLimitError, still sent once", async () => {
    const { client, calls } = defaultClient(
      () =>
        new Response("<html>Too Many Requests</html>", {
          status: 429,
          headers: { "Retry-After": "5" },
        }),
    );
    const err = (await settle(
      client.dataload.create({ file: FILE_CANARY }),
    )) as NovaraFlexRateLimitError;

    expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("rate_limit_exceeded");
    expect(err.status).toBe(429);
    expect(err.retryAfterMs).toBe(5_000);
    expect(err.attempts).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("retries dataload.create only when the call asserts idempotent: true", async () => {
    let answered = 0;
    const { client, calls } = defaultClient(() => {
      answered += 1;
      return answered === 1
        ? jsonResponse({ ok: false, error: "server_error" })
        : jsonResponse(DATALOAD_CREATE_BODY);
    });
    const result = await settle(
      client.dataload.create(
        { file: FILE_CANARY },
        { retry: { idempotent: true } },
      ),
    );

    expect(result).toEqual(DATALOAD_CREATE_BODY);
    expect(calls).toHaveLength(2);
    expect(bodyOf(calls[1])).toEqual(bodyOf(calls[0]));
  });

  it("retries dataload.info by default", async () => {
    const { client, calls } = defaultClient(() =>
      jsonResponse({ ok: false, error: "server_error" }),
    );
    const err = (await settle(
      client.dataload.info({ id: DATALOAD_ID }),
    )) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.attempts).toBe(3);
    expect(calls).toHaveLength(3);
  });
});

describe("flex.dataload types", () => {
  const { client } = createClient(() => jsonResponse(DATALOAD_CREATE_BODY));

  it("makes every create parameter optional and requires a string id on info", () => {
    // Every contract parameter of `dataload.create` is optional, so the
    // no-argument call type-checks; the vendor rejects it at runtime.
    void client.dataload.create();
    void client.dataload.create({
      url: "https://example.com/signed-file.csv",
      file: "data:text/csv;base64,YQ==",
      adapter: "acme-hr",
      name: "simple-file-name.csv",
      failureEmails: ["jane@example.com"],
      successEmails: ["john@example.com"],
      pretty: true,
    });
    void client.dataload.info({ id: DATALOAD_ID });
    void client.dataload.info({ id: DATALOAD_ID, pretty: true });

    // @ts-expect-error `bogus` is not a parameter of dataload.create
    void client.dataload.create({ bogus: 1 });
    // @ts-expect-error `url` is a string
    void client.dataload.create({ url: 1 });
    // @ts-expect-error `file` is a string
    void client.dataload.create({ file: 1 });
    // @ts-expect-error `failureEmails` is an array of strings, not a string
    void client.dataload.create({ failureEmails: "a@example.com" });
    // @ts-expect-error `successEmails` holds strings
    void client.dataload.create({ successEmails: [1] });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.dataload.create({ token: "override" });
    // @ts-expect-error dataload.info requires an `id`
    void client.dataload.info();
    // @ts-expect-error dataload.info requires an `id`
    void client.dataload.info({ pretty: true });
    // @ts-expect-error `id` is a hex string, not an integer
    void client.dataload.info({ id: 5804 });
    // @ts-expect-error the vendor's parameter is `id`, not `dataload_id`
    void client.dataload.info({ dataload_id: "x" });
    void client.dataload.info({
      id: DATALOAD_ID,
      // @ts-expect-error the token is supplied by the client, not the caller
      token: "override",
    });
  });

  it("returns exactly what call returns for the same methods", () => {
    expectTypeOf(client.dataload.create()).resolves.toEqualTypeOf<
      NovaraFlexResult<"dataload.create">
    >();
    expectTypeOf(
      client.dataload.info({ id: DATALOAD_ID }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"dataload.info">>();
    expectTypeOf(client.dataload.create()).toEqualTypeOf(
      client.call("dataload.create"),
    );
    expectTypeOf(client.dataload.info({ id: DATALOAD_ID })).toEqualTypeOf(
      client.call("dataload.info", { id: DATALOAD_ID }),
    );
  });
});
