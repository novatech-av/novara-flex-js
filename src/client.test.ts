import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import {
  type NovaraFlexCallOptions,
  NovaraFlexClient,
  type NovaraFlexClientOptions,
} from "./client.js";
import {
  NovaraFlexApiError,
  NovaraFlexError,
  NovaraFlexRateLimitError,
  NovaraFlexTransportError,
  type NovaraFlexTransportErrorReason,
} from "./errors.js";
import { hang, stalledBodyResponse } from "./test-support/fake-fetch.js";
import { SDK_NAME, SDK_VERSION } from "./version.js";

/** A token unlikely to appear anywhere by accident, so leaks are detectable. */
const TOKEN = "tok_SUPER_SECRET_c0ffee_do_not_leak";

interface Capture {
  url: string;
  init: RequestInit | undefined;
}

/** A fake `fetch` that records its arguments and replays canned responses. */
function fakeFetch(
  respond: (capture: Capture) => Response | Promise<Response>,
): { fetch: typeof globalThis.fetch; calls: Capture[] } {
  const calls: Capture[] = [];
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const capture: Capture = { url: String(input), init };
    calls.push(capture);
    return await respond(capture);
  };
  return { fetch: fetchImpl, calls };
}

/** Build an `HTTP 200` JSON response the way Novara Flex does. */
function jsonResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

/** The parsed JSON body of a captured request. */
function bodyOf(capture: Capture): Record<string, unknown> {
  return JSON.parse(String(capture.init?.body));
}

/**
 * Retries off: for the tests whose subject is a single attempt's behaviour on a
 * failure that would otherwise be retried. Retries have their own tests below.
 */
const NO_RETRY = { maxRetries: 0 } as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NovaraFlexClient configuration", () => {
  it("requires a non-empty token", () => {
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
    expect(() => new NovaraFlexClient({ token: "", fetch })).toThrow(TypeError);
    expect(() => new NovaraFlexClient({ token: "", fetch })).toThrow(
      "NovaraFlexClient requires a non-empty token",
    );
    expect(
      () =>
        new NovaraFlexClient({
          token: undefined as unknown as string,
          fetch,
        }),
    ).toThrow(TypeError);
    expect(
      () => new NovaraFlexClient({ token: 42 as unknown as string, fetch }),
    ).toThrow(TypeError);
  });

  it("defaults the base URL to the documented endpoint", () => {
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
    expect(new NovaraFlexClient({ token: TOKEN, fetch }).baseUrl).toBe(
      "https://api.novaraflex.com/v1",
    );
  });

  it("strips trailing slashes from the base URL", () => {
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
    expect(
      new NovaraFlexClient({
        token: TOKEN,
        fetch,
        baseUrl: "https://example.test/v1///",
      }).baseUrl,
    ).toBe("https://example.test/v1");
  });

  it("rejects an empty or non-string base URL", () => {
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
    expect(
      () => new NovaraFlexClient({ token: TOKEN, fetch, baseUrl: "" }),
    ).toThrow(TypeError);
    expect(
      () =>
        new NovaraFlexClient({
          token: TOKEN,
          fetch,
          baseUrl: 1 as unknown as string,
        }),
    ).toThrow("NovaraFlexClient baseUrl must be a non-empty string");
  });

  it("falls back to the global fetch", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await new NovaraFlexClient({ token: TOKEN }).call("api.ping");
    expect(calls).toHaveLength(1);
  });

  it("throws when there is no fetch to use", () => {
    vi.stubGlobal("fetch", undefined);
    expect(() => new NovaraFlexClient({ token: TOKEN })).toThrow(TypeError);
    expect(() => new NovaraFlexClient({ token: TOKEN })).toThrow(
      /requires a fetch implementation/,
    );
  });

  it("does not expose the token as a property", () => {
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    expect(JSON.stringify(client)).not.toContain(TOKEN);
    expect(Object.keys(client)).not.toContain("token");
    expect(JSON.stringify(Object.entries(client))).not.toContain(TOKEN);
    expect(
      (client as unknown as Record<string, unknown>).token,
    ).toBeUndefined();
  });

  it("keeps the token out of the serialization of the resource namespaces", () => {
    // The namespaces are enumerable own properties and each holds a reference
    // back to the client, so serializing them must still reveal nothing.
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
    const client = new NovaraFlexClient({ token: TOKEN, fetch });

    expect(JSON.stringify(client)).not.toContain(TOKEN);
    expect(JSON.stringify(client.api)).not.toContain(TOKEN);
    expect(JSON.stringify(client.account)).not.toContain(TOKEN);
    expect(JSON.stringify(client.projects)).not.toContain(TOKEN);
    expect(JSON.stringify(client.equipments)).not.toContain(TOKEN);
    expect(JSON.stringify(client.equipmenttypes)).not.toContain(TOKEN);
    expect(JSON.stringify(client.contractors)).not.toContain(TOKEN);
    expect(JSON.stringify(client.contractorContacts)).not.toContain(TOKEN);
    expect(JSON.stringify(client.contractorRequirements)).not.toContain(TOKEN);
    expect(JSON.stringify(client.forms)).not.toContain(TOKEN);
    expect(JSON.stringify(client.formfolders)).not.toContain(TOKEN);
    expect(JSON.stringify(client.responses)).not.toContain(TOKEN);
    expect(JSON.stringify(client.followups)).not.toContain(TOKEN);
    expect(JSON.stringify(client.inspections)).not.toContain(TOKEN);
    expect(JSON.stringify(client.acknowledgments)).not.toContain(TOKEN);
    expect(JSON.stringify(client.attachment)).not.toContain(TOKEN);
    expect(JSON.stringify(client.trainings)).not.toContain(TOKEN);
    expect(JSON.stringify(client.completedtrainings)).not.toContain(TOKEN);
    expect(JSON.stringify(client.grouptrainings)).not.toContain(TOKEN);
    expect(JSON.stringify(client.trainingEmployeeStatus)).not.toContain(TOKEN);
    expect(JSON.stringify(client.driverQualifications)).not.toContain(TOKEN);
    expect(JSON.stringify(client.oshaHours)).not.toContain(TOKEN);
    expect(JSON.stringify(client.establishments)).not.toContain(TOKEN);
    expect(JSON.stringify(client.datalists)).not.toContain(TOKEN);
    expect(JSON.stringify(client.datalistitems)).not.toContain(TOKEN);
    expect(JSON.stringify(client.dataload)).not.toContain(TOKEN);
    expect(JSON.stringify(client.resources)).not.toContain(TOKEN);
    expect(JSON.stringify(client.resourcetags)).not.toContain(TOKEN);
    expect(JSON.stringify({ ...client })).not.toContain(TOKEN);
    expect(Object.keys(client).sort()).toEqual([
      "account",
      "acknowledgments",
      "api",
      "attachment",
      "baseUrl",
      "companies",
      "completedtrainings",
      "contractorContacts",
      "contractorRequirements",
      "contractors",
      "datalistitems",
      "datalists",
      "dataload",
      "driverQualifications",
      "equipments",
      "equipmenttypes",
      "establishments",
      "fieldoffices",
      "followups",
      "formfolders",
      "forms",
      "grouptrainings",
      "inspections",
      "jobtitles",
      "linesofbusiness",
      "oshaHours",
      "projects",
      "resources",
      "resourcetags",
      "responses",
      "roles",
      "trainingEmployeeStatus",
      "trainings",
      "users",
    ]);
  });

  it("constructs the resource namespaces in code-unit alphabetical order", () => {
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const namespaces = Object.keys(client).filter((key) => key !== "baseUrl");
    expect(namespaces).toEqual([...namespaces].sort());
    expect(namespaces.slice(0, 4)).toEqual([
      "account",
      "acknowledgments",
      "api",
      "attachment",
    ]);
  });

  it("adds no member for the non-JSON methods to the client itself", () => {
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    expect(Object.getOwnPropertySymbols(client)).toEqual([]);
    expect(
      Object.getOwnPropertyNames(NovaraFlexClient.prototype).sort(),
    ).toEqual(["call", "constructor"]);
    expect(Object.getOwnPropertySymbols(NovaraFlexClient.prototype)).toEqual(
      [],
    );
  });

  it("exposes a resource namespace per API area", () => {
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
    const client = new NovaraFlexClient({ token: TOKEN, fetch });

    expect(typeof client.api.ping).toBe("function");
    expect(typeof client.api.echo).toBe("function");
    expect(typeof client.attachment.load).toBe("function");
    expect(typeof client.account.info).toBe("function");
    expect(typeof client.users.list).toBe("function");
    expect(typeof client.users.info).toBe("function");
    expect(typeof client.roles.list).toBe("function");
    expect(typeof client.jobtitles.list).toBe("function");
    expect(typeof client.fieldoffices.list).toBe("function");
    expect(typeof client.linesofbusiness.list).toBe("function");
    expect(typeof client.companies.list).toBe("function");
    expect(typeof client.projects.list).toBe("function");
    expect(typeof client.projects.info).toBe("function");
    expect(typeof client.equipments.list).toBe("function");
    expect(typeof client.equipmenttypes.list).toBe("function");
    expect(typeof client.contractors.list).toBe("function");
    expect(typeof client.contractorContacts.list).toBe("function");
    expect(typeof client.contractorRequirements.list).toBe("function");
    // Folded onto the plural namespace from the vendor's singular area.
    expect(typeof client.contractorRequirements.info).toBe("function");
    expect(typeof client.formfolders.list).toBe("function");
    expect(typeof client.forms.list).toBe("function");
    expect(typeof client.forms.info).toBe("function");
    expect(typeof client.responses.list).toBe("function");
    expect(typeof client.responses.info).toBe("function");
    expect(typeof client.responses.flat).toBe("function");
    expect(typeof client.responses.flatCsv).toBe("function");
    expect(typeof client.followups.list).toBe("function");
    expect(typeof client.inspections.list).toBe("function");
    expect(typeof client.acknowledgments.list).toBe("function");
    expect(typeof client.acknowledgments.info).toBe("function");
    // The vendor versions these two; the SDK method name drops the segment.
    expect(typeof client.trainings.list).toBe("function");
    expect(typeof client.completedtrainings.list).toBe("function");
    expect(typeof client.grouptrainings.list).toBe("function");
    expect(typeof client.trainingEmployeeStatus.list).toBe("function");
    expect(typeof client.driverQualifications.list).toBe("function");
    expect(typeof client.oshaHours.list).toBe("function");
    expect(typeof client.oshaHours.listCsv).toBe("function");
    expect(typeof client.establishments.list).toBe("function");
    expect(typeof client.establishments.info).toBe("function");
    expect(typeof client.datalists.list).toBe("function");
    expect(typeof client.datalistitems.list).toBe("function");
    // The SDK's only write method, alongside its status poller.
    expect(typeof client.dataload.create).toBe("function");
    expect(typeof client.dataload.info).toBe("function");
    expect(typeof client.resources.list).toBe("function");
    expect(typeof client.resourcetags.list).toBe("function");
  });
});

describe("NovaraFlexClient.call request shape", () => {
  it("posts to baseUrl/method with the documented headers", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ ok: true }));
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      baseUrl: "https://example.test/v1",
    });
    await client.call("api.ping");

    const capture = calls[0];
    expect(capture?.url).toBe("https://example.test/v1/api.ping");
    expect(capture?.init?.method).toBe("POST");
    expect(capture?.init?.headers).toEqual({
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": `${SDK_NAME}/${SDK_VERSION}`,
    });
  });

  it("injects the token into the body without the caller passing it", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ ok: true }));
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    await client.call("api.ping", { pretty: true });

    expect(bodyOf(calls[0] as Capture)).toEqual({
      pretty: true,
      token: TOKEN,
    });
  });

  it("sends only the token when no params are given", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ ok: true }));
    await new NovaraFlexClient({ token: TOKEN, fetch }).call("api.ping");
    expect(bodyOf(calls[0] as Capture)).toEqual({ token: TOKEN });
  });

  it("overrides a token supplied in params", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ ok: true }));
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    await client.call("api.ping", {
      token: "attacker-supplied",
    } as unknown as Record<string, never>);
    expect(bodyOf(calls[0] as Capture).token).toBe(TOKEN);
  });

  it("forwards the caller's signal as-is when the timeout is disabled", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ ok: true }));
    const controller = new AbortController();
    const client = new NovaraFlexClient({ token: TOKEN, fetch, timeoutMs: 0 });
    await client.call("api.ping", undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("combines the caller's signal with the timeout", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ ok: true }));
    const controller = new AbortController();
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    await client.call("api.ping", undefined, { signal: controller.signal });
    const sent = calls[0]?.init?.signal;
    expect(sent).toBeInstanceOf(AbortSignal);
    expect(sent).not.toBe(controller.signal);
    expect(sent?.aborted).toBe(false);
    const reason = new Error("stop");
    controller.abort(reason);
    expect(sent?.aborted).toBe(true);
    expect(sent?.reason).toBe(reason);
  });

  it("sends the timeout's own signal when the caller gives none", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ ok: true }));
    await new NovaraFlexClient({ token: TOKEN, fetch }).call("api.ping");
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits the signal when the timeout is disabled and none is given", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ ok: true }));
    await new NovaraFlexClient({ token: TOKEN, fetch }).call(
      "api.ping",
      undefined,
      { timeoutMs: 0 },
    );
    expect(calls[0]?.init && "signal" in calls[0].init).toBe(false);
  });
});

describe("NovaraFlexClient.call success handling", () => {
  it("returns the parsed success body", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ ok: true, pong: true, extra: [1] }),
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    await expect(client.call("api.ping")).resolves.toEqual({
      ok: true,
      pong: true,
      extra: [1],
    });
  });
});

describe("NovaraFlexClient.call application errors", () => {
  it("turns HTTP 200 + ok:false into a NovaraFlexApiError", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse(
        { ok: false, error: "token_invalid", description: "nope" },
        { headers: { "HZS-Request-ID": "abc123" } },
      ),
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const err = await client.call("users.list").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err).toBeInstanceOf(NovaraFlexError);
    expect(err).not.toBeInstanceOf(NovaraFlexTransportError);
    const apiError = err as NovaraFlexApiError;
    expect(apiError.code).toBe("token_invalid");
    expect(apiError.description).toBe("nope");
    expect(apiError.method).toBe("users.list");
    expect(apiError.requestId).toBe("abc123");
    expect(apiError.message).toBe(
      "Novara Flex users.list failed: token_invalid (nope)",
    );
  });

  it("accepts an error code the contract does not document", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ ok: false, error: "invalid_token" }),
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const err = (await client
      .call("api.ping")
      .catch((e: unknown) => e)) as NovaraFlexApiError;
    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("invalid_token");
    expect(err.requestId).toBeUndefined();
  });

  it("reads the request id header case-insensitively", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse(
        { ok: false, error: "server_error" },
        { headers: { "hzs-request-id": "lower-case" } },
      ),
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: NO_RETRY,
    });
    const err = (await client
      .call("api.ping")
      .catch((e: unknown) => e)) as NovaraFlexApiError;
    expect(err.requestId).toBe("lower-case");
  });
});

describe("NovaraFlexClient.call transport failures", () => {
  it("distinguishes a non-200 status from an application error", async () => {
    const { fetch } = fakeFetch(
      () =>
        new Response("upstream exploded", {
          status: 503,
          headers: { "HZS-Request-ID": "req-503" },
        }),
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: NO_RETRY,
    });
    const err = (await client
      .call("api.ping")
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err).not.toBeInstanceOf(NovaraFlexApiError);
    expect(err.reason).toBe("http_status");
    expect(err.status).toBe(503);
    expect(err.requestId).toBe("req-503");
    expect(err.method).toBe("api.ping");
    expect(err.message).toBe("Novara Flex api.ping: responded with HTTP 503");
  });

  it("reports a non-JSON body with the parse failure as cause", async () => {
    const { fetch } = fakeFetch(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const err = (await client
      .call("api.ping")
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.message).toBe("Novara Flex api.ping: returned a non-JSON body");
    expect(err.reason).toBe("invalid_json");
    expect(err.status).toBe(200);
    expect(err.cause).toBeInstanceOf(Error);
  });

  it("reports a body that fails mid-read as network", async () => {
    const cause = new TypeError("terminated");
    const { fetch } = fakeFetch(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(cause);
            },
          }),
          { status: 200, headers: { "HZS-Request-ID": "req-cut" } },
        ),
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: NO_RETRY,
    });
    const err = (await client
      .call("api.ping")
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.message).toBe(
      "Novara Flex api.ping: could not read the response body",
    );
    expect(err.reason).toBe("network");
    expect(err.status).toBe(200);
    expect(err.requestId).toBe("req-cut");
    expect(err.cause).toBe(cause);
  });

  it("leaves requestId undefined when the header is absent", async () => {
    const { fetch } = fakeFetch(() => new Response("boom", { status: 502 }));
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: NO_RETRY,
    });
    const err = (await client
      .call("api.ping")
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.status).toBe(502);
    expect(err.requestId).toBeUndefined();
  });

  it("wraps a rejected fetch", async () => {
    const cause = new TypeError("fetch failed");
    const fetchImpl: typeof globalThis.fetch = () => Promise.reject(cause);
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch: fetchImpl,
      retry: NO_RETRY,
    });
    const err = (await client
      .call("api.ping")
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.message).toBe("Novara Flex api.ping: network request failed");
    expect(err.reason).toBe("network");
    expect(err.cause).toBe(cause);
    expect(err.status).toBeUndefined();
    expect(err.requestId).toBeUndefined();
  });

  it("rethrows an AbortError it did not cause unchanged", async () => {
    const abort = new Error("This operation was aborted");
    abort.name = "AbortError";
    const fetchImpl: typeof globalThis.fetch = () => Promise.reject(abort);
    const client = new NovaraFlexClient({ token: TOKEN, fetch: fetchImpl });
    const err = await client.call("api.ping").catch((e: unknown) => e);

    expect(err).toBe(abort);
    expect(err).not.toBeInstanceOf(NovaraFlexError);
  });

  const unrecognized: ReadonlyArray<[string, unknown]> = [
    ["an empty object", {}],
    ["an array", []],
    ["a non-boolean ok", { ok: "yes" }],
    ["ok:false without an error code", { ok: false }],
    ["a bare string", "hello"],
    ["null", null],
  ];

  for (const [label, body] of unrecognized) {
    it(`rejects ${label} as an unrecognized envelope`, async () => {
      const { fetch } = fakeFetch(() =>
        jsonResponse(body, { headers: { "HZS-Request-ID": "req-env" } }),
      );
      const client = new NovaraFlexClient({ token: TOKEN, fetch });
      const err = (await client
        .call("api.ping")
        .catch((e: unknown) => e)) as NovaraFlexTransportError;

      expect(err).toBeInstanceOf(NovaraFlexTransportError);
      expect(err.message).toBe(
        "Novara Flex api.ping: returned an unrecognized response envelope",
      );
      expect(err.reason).toBe("invalid_envelope");
      expect(err.status).toBe(200);
      expect(err.requestId).toBe("req-env");
    });
  }
});

describe("NovaraFlexClient.call timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Track a call's outcome without letting a rejection go unhandled. */
  function observe(promise: Promise<unknown>): {
    readonly settled: boolean;
    readonly outcome: Promise<unknown>;
  } {
    const state = {
      settled: false,
      outcome: promise.then(
        (value) => value,
        (error: unknown) => error,
      ),
    };
    void state.outcome.then(() => {
      state.settled = true;
    });
    return state;
  }

  /** A `fetch` whose single answer the test releases by hand. */
  function manualFetch(): {
    fetch: typeof globalThis.fetch;
    calls: Capture[];
    answer: (response: Response) => void;
  } {
    let answer: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const { fetch, calls } = fakeFetch(() => pending);
    return { fetch, calls, answer: (response) => answer(response) };
  }

  function expectTimeout(err: unknown, ms: number): NovaraFlexTransportError {
    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    const transport = err as NovaraFlexTransportError;
    expect(transport.reason).toBe("timeout");
    expect(transport.method).toBe("api.ping");
    expect(transport.message).toBe(
      `Novara Flex api.ping timed out after ${ms} ms`,
    );
    return transport;
  }

  it("times out after 60 s by default", async () => {
    const { fetch, calls } = fakeFetch(hang);
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: NO_RETRY,
    });
    const call = observe(client.call("api.ping"));

    await vi.advanceTimersByTimeAsync(59_999);
    expect(call.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(call.settled).toBe(true);

    const err = expectTimeout(await call.outcome, 60_000);
    expect(err.status).toBeUndefined();
    expect(err.requestId).toBeUndefined();
    // The cause is the rejection fetch produced for the aborted signal.
    expect(err.cause).toBe(calls[0]?.init?.signal?.reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honours a client-level timeoutMs", async () => {
    const { fetch } = fakeFetch(hang);
    const client = new NovaraFlexClient({
      retry: NO_RETRY,
      token: TOKEN,
      fetch,
      timeoutMs: 5_000,
    });
    const call = observe(client.call("api.ping"));

    await vi.advanceTimersByTimeAsync(4_999);
    expect(call.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expectTimeout(await call.outcome, 5_000);
  });

  it("lets a per-call timeoutMs override the client's, longer or shorter", async () => {
    const { fetch } = fakeFetch(hang);
    const client = new NovaraFlexClient({
      retry: NO_RETRY,
      token: TOKEN,
      fetch,
      timeoutMs: 5_000,
    });

    const longer = observe(
      client.call("api.ping", undefined, { timeoutMs: 10_000 }),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(longer.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expectTimeout(await longer.outcome, 10_000);

    const shorter = observe(
      client.call("api.ping", undefined, { timeoutMs: 1_000 }),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expectTimeout(await shorter.outcome, 1_000);
  });

  const disabled: ReadonlyArray<
    [string, { timeoutMs?: number }, { timeoutMs?: number }]
  > = [
    ["0 on the client", { timeoutMs: 0 }, {}],
    ["Infinity on the client", { timeoutMs: Number.POSITIVE_INFINITY }, {}],
    ["0 per call", {}, { timeoutMs: 0 }],
    ["Infinity per call", {}, { timeoutMs: Number.POSITIVE_INFINITY }],
    [
      "0 per call over a client timeout",
      { timeoutMs: 1_000 },
      { timeoutMs: 0 },
    ],
  ];

  for (const [label, clientOptions, callOptions] of disabled) {
    it(`disables the timeout with ${label}`, async () => {
      const { fetch, calls, answer } = manualFetch();
      const client = new NovaraFlexClient({
        token: TOKEN,
        fetch,
        ...clientOptions,
      });
      const call = observe(client.call("api.ping", undefined, callOptions));

      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(call.settled).toBe(false);
      expect(calls[0]?.init && "signal" in calls[0].init).toBe(false);

      answer(jsonResponse({ ok: true, pong: true }));
      await expect(call.outcome).resolves.toEqual({ ok: true, pong: true });
    });
  }

  it("covers reading the body, reporting the status and request id", async () => {
    const { fetch, calls } = fakeFetch(({ init }) =>
      stalledBodyResponse(init?.signal, { "HZS-Request-ID": "req-slow" }),
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: NO_RETRY,
    });
    const call = observe(client.call("api.ping"));

    await vi.advanceTimersByTimeAsync(59_999);
    expect(call.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const err = expectTimeout(await call.outcome, 60_000);
    expect(err.status).toBe(200);
    expect(err.requestId).toBe("req-slow");
    expect(err.cause).toBe(calls[0]?.init?.signal?.reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out while the caller's signal is still live", async () => {
    // Both signals exist, so fetch gets `AbortSignal.any` of the two.
    const { fetch, calls } = fakeFetch(hang);
    const controller = new AbortController();
    const client = new NovaraFlexClient({
      retry: NO_RETRY,
      token: TOKEN,
      fetch,
      timeoutMs: 1_000,
    });
    const call = observe(
      client.call("api.ping", undefined, { signal: controller.signal }),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expectTimeout(await call.outcome, 1_000);
    expect(controller.signal.aborted).toBe(false);
    expect(calls[0]?.init?.signal).not.toBe(controller.signal);
    expect(calls[0]?.init?.signal?.aborted).toBe(true);
  });

  const callerAborts: ReadonlyArray<[string, { timeoutMs?: number }]> = [
    ["with the default timeout", {}],
    ["with the timeout disabled", { timeoutMs: 0 }],
  ];

  for (const [label, clientOptions] of callerAborts) {
    describe(`a caller abort ${label}`, () => {
      it("is rethrown unchanged when the signal is aborted before the call", async () => {
        const { fetch } = fakeFetch(hang);
        const controller = new AbortController();
        controller.abort();
        const client = new NovaraFlexClient({
          token: TOKEN,
          fetch,
          ...clientOptions,
        });
        const err = await client
          .call("api.ping", undefined, { signal: controller.signal })
          .catch((e: unknown) => e);

        expect(err).toBe(controller.signal.reason);
        expect(err).not.toBeInstanceOf(NovaraFlexError);
        expect(vi.getTimerCount()).toBe(0);
      });

      it("is rethrown unchanged when it lands while waiting for headers", async () => {
        const { fetch } = fakeFetch(hang);
        const controller = new AbortController();
        const client = new NovaraFlexClient({
          token: TOKEN,
          fetch,
          ...clientOptions,
        });
        const call = observe(
          client.call("api.ping", undefined, { signal: controller.signal }),
        );

        await vi.advanceTimersByTimeAsync(1_000);
        expect(call.settled).toBe(false);
        controller.abort();
        const err = await call.outcome;

        expect(err).toBe(controller.signal.reason);
        expect((err as Error).name).toBe("AbortError");
        expect(vi.getTimerCount()).toBe(0);
      });

      it("is rethrown unchanged when it lands while reading the body", async () => {
        const { fetch } = fakeFetch(({ init }) =>
          stalledBodyResponse(init?.signal),
        );
        const controller = new AbortController();
        const client = new NovaraFlexClient({
          token: TOKEN,
          fetch,
          ...clientOptions,
        });
        const call = observe(
          client.call("api.ping", undefined, { signal: controller.signal }),
        );

        await vi.advanceTimersByTimeAsync(1_000);
        expect(call.settled).toBe(false);
        controller.abort();
        expect(await call.outcome).toBe(controller.signal.reason);
        expect(vi.getTimerCount()).toBe(0);
      });

      it("rethrows a custom abort reason unchanged", async () => {
        const { fetch } = fakeFetch(hang);
        const controller = new AbortController();
        const reason = new Error("user navigated away");
        const client = new NovaraFlexClient({
          token: TOKEN,
          fetch,
          ...clientOptions,
        });
        const call = observe(
          client.call("api.ping", undefined, { signal: controller.signal }),
        );

        controller.abort(reason);
        expect(await call.outcome).toBe(reason);
      });
    });
  }

  const outcomes: ReadonlyArray<[string, () => Response | Promise<Response>]> =
    [
      ["a success", () => jsonResponse({ ok: true })],
      ["an application error", () => jsonResponse({ ok: false, error: "x" })],
      ["an HTTP error", () => new Response("boom", { status: 500 })],
      ["a non-JSON body", () => new Response("nope", { status: 200 })],
      ["a rejected fetch", () => Promise.reject(new TypeError("fetch failed"))],
    ];

  for (const [label, respond] of outcomes) {
    it(`clears its timer after ${label}`, async () => {
      const { fetch } = fakeFetch(respond);
      const client = new NovaraFlexClient({
        token: TOKEN,
        fetch,
        retry: NO_RETRY,
      });
      await client.call("api.ping").catch(() => undefined);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  const invalid: ReadonlyArray<[string, number]> = [
    ["a negative number", -1],
    ["NaN", Number.NaN],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["a delay setTimeout cannot honour", 2_147_483_648],
  ];

  for (const [label, timeoutMs] of invalid) {
    it(`rejects ${label} in the constructor`, () => {
      const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
      expect(
        () => new NovaraFlexClient({ token: TOKEN, fetch, timeoutMs }),
      ).toThrow(TypeError);
      expect(
        () => new NovaraFlexClient({ token: TOKEN, fetch, timeoutMs }),
      ).toThrow(/use Infinity or 0 to disable the timeout/);
    });

    it(`rejects ${label} per call before sending anything`, async () => {
      const { fetch, calls } = fakeFetch(() => jsonResponse({ ok: true }));
      const client = new NovaraFlexClient({ token: TOKEN, fetch });
      const err = await client
        .call("api.ping", undefined, { timeoutMs })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(TypeError);
      expect((err as Error).message).toMatch(
        /use Infinity or 0 to disable the timeout/,
      );
      expect(calls).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it("rejects a non-number timeoutMs", () => {
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
    expect(
      () =>
        new NovaraFlexClient({
          token: TOKEN,
          fetch,
          timeoutMs: "1000" as unknown as number,
        }),
    ).toThrow(TypeError);
  });

  it("accepts the longest delay setTimeout can honour", async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      timeoutMs: 2_147_483_647,
    });
    await expect(client.call("api.ping")).resolves.toEqual({ ok: true });
  });
});

/**
 * A `fetch` that answers request `n` with `responders[n]`, repeating the
 * last one once the list runs out.
 */
function sequence(
  ...responders: Array<(capture: Capture) => Response | Promise<Response>>
): { fetch: typeof globalThis.fetch; calls: Capture[] } {
  let next = 0;
  return fakeFetch((capture) => {
    const respond = responders[Math.min(next, responders.length - 1)];
    next += 1;
    if (!respond) throw new Error("sequence needs a responder");
    return respond(capture);
  });
}

/** A failure tagged with the attempt that produced it. */
const serverError = (id: string) => () =>
  jsonResponse(
    { ok: false, error: "server_error" },
    { headers: { "HZS-Request-ID": id } },
  );
const success = () => jsonResponse({ ok: true, projects: [] });

/** Track a call's outcome without letting a rejection go unhandled. */
function observe(promise: Promise<unknown>): {
  readonly settled: boolean;
  readonly outcome: Promise<unknown>;
} {
  const state = {
    settled: false,
    outcome: promise.then(
      (value) => value,
      (error: unknown) => error,
    ),
  };
  void state.outcome.then(() => {
    state.settled = true;
  });
  return state;
}

describe("NovaraFlexClient.call retries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Full jitter at its ceiling, so every backoff is exactly
    // min(maxDelayMs, baseDelayMs * 2 ** (n - 1)): 500 ms, then 1 000 ms.
    vi.spyOn(Math, "random").mockReturnValue(1);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries a server_error envelope and returns the success on attempt 2", async () => {
    vi.mocked(Math.random).mockReturnValue(0.5);
    const { fetch, calls } = sequence(serverError("req-1"), success);
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(client.call("projects.list"));

    // Retry 1 waits random() * 500 ms = 250 ms.
    await vi.advanceTimersByTimeAsync(249);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
    expect(calls[1]?.url).toBe(calls[0]?.url);
    expect(bodyOf(calls[1] as Capture)).toEqual(bodyOf(calls[0] as Capture));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never retries token_invalid, reporting a single attempt", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({ ok: false, error: "token_invalid" }),
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const err = (await client
      .call("projects.list")
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_invalid");
    expect(err.attempts).toBe(1);
    expect(calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives up after 2 retries with exponential backoff, throwing the last failure", async () => {
    const { fetch, calls } = sequence(
      serverError("req-1"),
      serverError("req-2"),
      serverError("req-3"),
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(client.call("projects.list"));

    await vi.advanceTimersByTimeAsync(499);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);

    const err = (await call.outcome) as NovaraFlexApiError;
    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.requestId).toBe("req-3");
    expect(err.attempts).toBe(3);
    expect(err.message).toBe("Novara Flex projects.list failed: server_error");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("caps the backoff at maxDelayMs", async () => {
    const { fetch, calls } = sequence(serverError("a"));
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: { maxRetries: 3, baseDelayMs: 1_000, maxDelayMs: 1_500 },
    });
    const call = observe(client.call("projects.list"));

    await vi.advanceTimersByTimeAsync(1_000); // retry 1: 1 000 ms
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_499); // retry 2: 2 000 capped to 1 500
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1_500); // retry 3: 4 000 capped to 1 500
    expect(calls).toHaveLength(4);
    expect(((await call.outcome) as NovaraFlexApiError).attempts).toBe(4);
  });

  it("disables retries with maxRetries: 0 on the client or per call", async () => {
    const onClient = fakeFetch(serverError("a"));
    const err = (await new NovaraFlexClient({
      token: TOKEN,
      fetch: onClient.fetch,
      retry: { maxRetries: 0 },
    })
      .call("projects.list")
      .catch((e: unknown) => e)) as NovaraFlexApiError;
    expect(onClient.calls).toHaveLength(1);
    expect(err.attempts).toBe(1);

    const perCall = fakeFetch(serverError("a"));
    const err2 = (await new NovaraFlexClient({
      token: TOKEN,
      fetch: perCall.fetch,
    })
      .call("projects.list", undefined, { retry: { maxRetries: 0 } })
      .catch((e: unknown) => e)) as NovaraFlexApiError;
    expect(perCall.calls).toHaveLength(1);
    expect(err2.attempts).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets per-call options override the client's field by field", async () => {
    const { fetch, calls } = sequence(serverError("a"));
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: { maxRetries: 0, baseDelayMs: 100 },
    });
    // maxRetries comes from the call, baseDelayMs still from the client.
    const call = observe(
      client.call("projects.list", undefined, { retry: { maxRetries: 1 } }),
    );
    await vi.advanceTimersByTimeAsync(99);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(((await call.outcome) as NovaraFlexApiError).attempts).toBe(2);
  });

  for (const status of [500, 503]) {
    it(`retries HTTP ${status}`, async () => {
      const { fetch, calls } = sequence(
        () => new Response("busy", { status }),
        success,
      );
      const client = new NovaraFlexClient({ token: TOKEN, fetch });
      const call = observe(client.call("projects.list"));
      await vi.advanceTimersByTimeAsync(500);
      await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
      expect(calls).toHaveLength(2);
    });
  }

  for (const status of [400, 404]) {
    it(`does not retry HTTP ${status}`, async () => {
      const { fetch, calls } = fakeFetch(
        () => new Response("nope", { status }),
      );
      const client = new NovaraFlexClient({ token: TOKEN, fetch });
      const err = (await client
        .call("projects.list")
        .catch((e: unknown) => e)) as NovaraFlexTransportError;
      expect(err.reason).toBe("http_status");
      expect(err.status).toBe(status);
      expect(err.attempts).toBe(1);
      expect(calls).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it("retries a network failure", async () => {
    const { fetch, calls } = sequence(
      () => Promise.reject(new TypeError("fetch failed")),
      success,
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(client.call("projects.list"));
    await vi.advanceTimersByTimeAsync(500);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
    expect(calls).toHaveLength(2);
  });

  it("retries a timeout, bounding each attempt rather than the call", async () => {
    const { fetch, calls } = sequence(hang, hang, success);
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      timeoutMs: 1_000,
    });
    const call = observe(client.call("projects.list"));

    await vi.advanceTimersByTimeAsync(1_000 + 500); // timeout, then backoff
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(call.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1 + 1_000);
    expect(calls).toHaveLength(3);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports the last timeout with the attempt count once retries run out", async () => {
    const { fetch, calls } = fakeFetch(hang);
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      timeoutMs: 1_000,
    });
    const call = observe(client.call("projects.list"));
    await vi.advanceTimersByTimeAsync(1_000 + 500 + 1_000 + 1_000 + 1_000);

    const err = (await call.outcome) as NovaraFlexTransportError;
    expect(err.reason).toBe("timeout");
    expect(err.attempts).toBe(3);
    expect(err.message).toBe(
      "Novara Flex projects.list timed out after 1000 ms",
    );
    expect(calls).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  const notRetried: ReadonlyArray<
    [string, () => Response, NovaraFlexTransportErrorReason]
  > = [
    [
      "a non-JSON body",
      () => new Response("<html>", { status: 200 }),
      "invalid_json",
    ],
    ["an unrecognized envelope", () => jsonResponse({}), "invalid_envelope"],
  ];

  for (const [label, respond, reason] of notRetried) {
    it(`does not retry ${label}`, async () => {
      const { fetch, calls } = fakeFetch(respond);
      const client = new NovaraFlexClient({ token: TOKEN, fetch });
      const err = (await client
        .call("projects.list")
        .catch((e: unknown) => e)) as NovaraFlexTransportError;
      expect(err.reason).toBe(reason);
      expect(err.attempts).toBe(1);
      expect(calls).toHaveLength(1);
    });
  }

  it("does not retry an AbortError it did not cause", async () => {
    const abort = new Error("This operation was aborted");
    abort.name = "AbortError";
    const { fetch, calls } = fakeFetch(() => Promise.reject(abort));
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    expect(await client.call("projects.list").catch((e: unknown) => e)).toBe(
      abort,
    );
    expect(calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits exactly the Retry-After delta-seconds instead of the backoff", async () => {
    const { fetch, calls } = sequence(
      () =>
        new Response("slow down", {
          status: 503,
          headers: { "Retry-After": "3" },
        }),
      success,
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(client.call("projects.list"));

    await vi.advanceTimersByTimeAsync(2_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
  });

  it("waits until a Retry-After HTTP-date", async () => {
    vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
    const { fetch, calls } = sequence(
      () =>
        new Response("busy", {
          status: 503,
          headers: { "Retry-After": "Tue, 29 Sep 2026 12:00:02 GMT" },
        }),
      success,
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(client.call("projects.list"));

    await vi.advanceTimersByTimeAsync(1_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
  });

  it("honours a Retry-After of exactly 60 s", async () => {
    const { fetch, calls } = sequence(
      () =>
        jsonResponse(
          { ok: false, error: "server_error" },
          { headers: { "Retry-After": "60" } },
        ),
      success,
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(client.call("projects.list"));
    await vi.advanceTimersByTimeAsync(59_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
    expect(calls).toHaveLength(2);
  });

  it("throws at once rather than wait out a Retry-After over 60 s", async () => {
    const { fetch, calls } = fakeFetch(
      () =>
        new Response("busy", {
          status: 503,
          headers: { "Retry-After": "61", "HZS-Request-ID": "req-503" },
        }),
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const err = (await client
      .call("projects.list")
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err.reason).toBe("http_status");
    expect(err.status).toBe(503);
    expect(err.requestId).toBe("req-503");
    expect(err.attempts).toBe(1);
    expect(err).not.toHaveProperty("retryAfter");
    expect(calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to the backoff when Retry-After is unparseable", async () => {
    const { fetch, calls } = sequence(
      () =>
        new Response("busy", {
          status: 503,
          headers: { "Retry-After": "soon" },
        }),
      success,
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(client.call("projects.list"));
    await vi.advanceTimersByTimeAsync(499);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
  });

  for (const [label, abortWith] of [
    ["an AbortError", undefined],
    ["a custom reason", new Error("user navigated away")],
  ] as const) {
    it(`rethrows ${label} from a caller abort during the backoff, unchanged`, async () => {
      const { fetch, calls } = fakeFetch(serverError("a"));
      const controller = new AbortController();
      const client = new NovaraFlexClient({ token: TOKEN, fetch });
      const call = observe(
        client.call("projects.list", undefined, { signal: controller.signal }),
      );

      await vi.advanceTimersByTimeAsync(250);
      expect(calls).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(1); // the backoff
      controller.abort(abortWith);
      const err = await call.outcome;

      expect(err).toBe(controller.signal.reason);
      expect(err).not.toBeInstanceOf(NovaraFlexError);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(calls).toHaveLength(1);
    });
  }

  it("does not retry a caller abort mid-request", async () => {
    const { fetch, calls } = fakeFetch(hang);
    const controller = new AbortController();
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(
      client.call("projects.list", undefined, { signal: controller.signal }),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();
    expect(await call.outcome).toBe(controller.signal.reason);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disables retries for a read with idempotent: false", async () => {
    const { fetch, calls } = fakeFetch(serverError("a"));
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const err = (await client
      .call("projects.list", undefined, { retry: { idempotent: false } })
      .catch((e: unknown) => e)) as NovaraFlexApiError;
    expect(err.attempts).toBe(1);
    expect(calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores an idempotent flag smuggled into the client options", async () => {
    const { fetch, calls } = fakeFetch(serverError("a"));
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: { idempotent: true } as NonNullable<
        NovaraFlexClientOptions["retry"]
      >,
    });
    await client.call("dataload.create").catch(() => undefined);
    expect(calls).toHaveLength(1);
  });

  const invalidRetry: ReadonlyArray<[string, unknown, RegExp]> = [
    [
      "a negative maxRetries",
      { maxRetries: -1 },
      /retry\.maxRetries must be an integer from 0 to 10/,
    ],
    ["a fractional maxRetries", { maxRetries: 1.5 }, /retry\.maxRetries/],
    ["a maxRetries over 10", { maxRetries: 11 }, /retry\.maxRetries/],
    ["a NaN maxRetries", { maxRetries: Number.NaN }, /retry\.maxRetries/],
    ["a string maxRetries", { maxRetries: "2" }, /retry\.maxRetries/],
    [
      "a negative baseDelayMs",
      { baseDelayMs: -1 },
      /retry\.baseDelayMs must be a finite number of milliseconds from 0 to 2147483647/,
    ],
    [
      "an infinite baseDelayMs",
      { baseDelayMs: Number.POSITIVE_INFINITY },
      /retry\.baseDelayMs/,
    ],
    ["a NaN maxDelayMs", { maxDelayMs: Number.NaN }, /retry\.maxDelayMs/],
    [
      "a maxDelayMs setTimeout cannot honour",
      { maxDelayMs: 2_147_483_648 },
      /retry\.maxDelayMs/,
    ],
    ["a non-object retry", 3, /retry must be an object/],
    ["a null retry", null, /retry must be an object/],
  ];

  for (const [label, retry, message] of invalidRetry) {
    it(`rejects ${label} in the constructor`, () => {
      const { fetch } = fakeFetch(success);
      const make = () =>
        new NovaraFlexClient({
          token: TOKEN,
          fetch,
          retry: retry as NonNullable<NovaraFlexClientOptions["retry"]>,
        });
      expect(make).toThrow(TypeError);
      expect(make).toThrow(message);
      expect(make).toThrow(/^NovaraFlexClient retry/);
    });

    it(`rejects ${label} per call before sending anything`, async () => {
      const { fetch, calls } = fakeFetch(success);
      const client = new NovaraFlexClient({ token: TOKEN, fetch });
      const err = await client
        .call("projects.list", undefined, {
          retry: retry as NonNullable<NovaraFlexCallOptions["retry"]>,
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TypeError);
      expect((err as Error).message).toMatch(message);
      expect((err as Error).message).toMatch(/^NovaraFlexCallOptions\.retry/);
      expect(calls).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it("rejects a non-boolean idempotent per call before sending anything", async () => {
    const { fetch, calls } = fakeFetch(success);
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const err = await client
      .call("projects.list", undefined, {
        retry: { idempotent: "yes" as unknown as boolean },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect((err as Error).message).toBe(
      "NovaraFlexCallOptions.retry.idempotent must be a boolean",
    );
    expect(calls).toHaveLength(0);
  });

  it("accepts the boundary values", async () => {
    const { fetch } = fakeFetch(success);
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: { maxRetries: 10, baseDelayMs: 0, maxDelayMs: 2_147_483_647 },
    });
    await expect(
      client.call("projects.list", undefined, { retry: { maxRetries: 0 } }),
    ).resolves.toEqual({ ok: true, projects: [] });
  });
});

/** A `rate_limit_exceeded` envelope, the way Novara Flex documents it. */
const rateLimited =
  (headers?: Record<string, string>, description?: string) => () =>
    jsonResponse(
      {
        ok: false,
        error: "rate_limit_exceeded",
        ...(description ? { description } : {}),
      },
      headers ? { headers } : undefined,
    );

/** An HTTP 429, whatever its body. */
const http429 =
  (body = "", headers?: Record<string, string>) =>
  () =>
    new Response(body, { status: 429, ...(headers ? { headers } : {}) });

/** Wrap a responder so it answers only after `ms` of (fake) time. */
const delayed =
  (ms: number, respond: () => Response) => (): Promise<Response> =>
    new Promise((resolve) => setTimeout(() => resolve(respond()), ms));

/** The requests captured for one method. */
const callsTo = (calls: Capture[], method: string): Capture[] =>
  calls.filter((c) => c.url.endsWith(`/${method}`));

describe("NovaraFlexClient.call rate-limit errors", () => {
  it("raises a rate_limit_exceeded envelope as a NovaraFlexRateLimitError with status 200", async () => {
    const { fetch } = fakeFetch(
      rateLimited({ "HZS-Request-ID": "req-rl" }, "Too many requests"),
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: NO_RETRY,
    });
    const err = (await client
      .call("projects.list")
      .catch((e: unknown) => e)) as NovaraFlexRateLimitError;

    expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err).toBeInstanceOf(NovaraFlexError);
    expect(err).not.toBeInstanceOf(NovaraFlexTransportError);
    expect(err.name).toBe("NovaraFlexRateLimitError");
    expect(err.code).toBe("rate_limit_exceeded");
    expect(err.status).toBe(200);
    expect(err.description).toBe("Too many requests");
    expect(err.requestId).toBe("req-rl");
    expect(err.method).toBe("projects.list");
    expect(err.attempts).toBe(1);
    expect(err.retryAfterMs).toBeUndefined();
    expect(err.message).toBe(
      "Novara Flex projects.list failed: rate_limit_exceeded (Too many requests)",
    );
  });

  const bodies: ReadonlyArray<[string, string]> = [
    [
      "a JSON body",
      JSON.stringify({
        ok: false,
        error: "rate_limit_exceeded",
        description: "x",
      }),
    ],
    ["an HTML body", "<html><body>429 Too Many Requests</body></html>"],
    ["an empty body", ""],
  ];

  for (const [label, body] of bodies) {
    it(`raises HTTP 429 with ${label} as a NovaraFlexRateLimitError with status 429`, async () => {
      let response: Response | undefined;
      const { fetch } = fakeFetch(() => {
        response = new Response(body, {
          status: 429,
          headers: { "HZS-Request-ID": "req-429" },
        });
        return response;
      });
      const client = new NovaraFlexClient({
        token: TOKEN,
        fetch,
        retry: NO_RETRY,
      });
      const err = (await client
        .call("users.list")
        .catch((e: unknown) => e)) as NovaraFlexRateLimitError;

      expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
      expect(err).toBeInstanceOf(NovaraFlexApiError);
      expect(err).not.toBeInstanceOf(NovaraFlexTransportError);
      expect(err.code).toBe("rate_limit_exceeded");
      expect(err.status).toBe(429);
      expect(err.requestId).toBe("req-429");
      expect(err.description).toBeUndefined();
      expect(err.attempts).toBe(1);
      expect(err.message).toBe(
        "Novara Flex users.list failed: rate_limit_exceeded (HTTP 429)",
      );
      // The status decides; the body is never read.
      expect(response?.bodyUsed).toBe(false);
    });
  }

  const retryAfters: ReadonlyArray<
    [string, string | undefined, number | undefined]
  > = [
    ["delta-seconds", "7", 7_000],
    ["an HTTP-date", "Tue, 29 Sep 2026 12:00:30 GMT", 30_000],
    ["no header", undefined, undefined],
    ["an unparseable header", "soon", undefined],
  ];

  for (const [label, header, expected] of retryAfters) {
    for (const [shape, make] of [
      ["envelope", rateLimited],
      ["HTTP 429", (h?: Record<string, string>) => http429("", h)],
    ] as const) {
      it(`reads retryAfterMs from ${label} on a ${shape} rate limit`, async () => {
        vi.useFakeTimers({ now: new Date("2026-09-29T12:00:00Z") });
        try {
          const { fetch } = fakeFetch(
            make(header === undefined ? undefined : { "Retry-After": header }),
          );
          const client = new NovaraFlexClient({
            token: TOKEN,
            fetch,
            retry: NO_RETRY,
          });
          const err = (await client
            .call("projects.list")
            .catch((e: unknown) => e)) as NovaraFlexRateLimitError;
          expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
          expect(err.retryAfterMs).toBe(expected);
        } finally {
          vi.useRealTimers();
        }
      });
    }
  }
});

describe("NovaraFlexClient.call rate-limit retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // No jitter unless a test says otherwise: the wait is exactly rateLimitDelayMs.
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits out 60 s by default, then succeeds on attempt 2", async () => {
    const { fetch, calls } = sequence(rateLimited(), success);
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(client.projects.list());

    await vi.advanceTimersByTimeAsync(59_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("adds up to 5 s of jitter to the default wait", async () => {
    vi.mocked(Math.random).mockReturnValue(0.5);
    const { fetch, calls } = sequence(http429(), success);
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(client.projects.list());

    // 60 000 + 0.5 * min(5 000, 6 000) = 62 500 ms.
    await vi.advanceTimersByTimeAsync(62_499);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
  });

  it("throws a second rate limit in the same call, with attempts 2", async () => {
    const { fetch, calls } = fakeFetch(
      rateLimited({ "HZS-Request-ID": "req-2" }),
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(client.projects.list());

    await vi.advanceTimersByTimeAsync(60_000);
    const err = (await call.outcome) as NovaraFlexRateLimitError;
    expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
    expect(err.attempts).toBe(2);
    expect(err.requestId).toBe("req-2");
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(calls).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits a Retry-After of 5 s instead of the default", async () => {
    const { fetch, calls } = sequence(
      http429("slow down", { "Retry-After": "5" }),
      success,
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const call = observe(client.projects.list());

    await vi.advanceTimersByTimeAsync(4_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
  });

  it("throws at once when Retry-After exceeds the cap", async () => {
    const { fetch, calls } = fakeFetch(rateLimited({ "Retry-After": "61" }));
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const err = (await client
      .call("projects.list")
      .catch((e: unknown) => e)) as NovaraFlexRateLimitError;

    expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
    expect(err.retryAfterMs).toBe(61_000);
    expect(err.attempts).toBe(1);
    expect(calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("raises the Retry-After cap to a longer rateLimitDelayMs", async () => {
    const { fetch, calls } = sequence(
      rateLimited({ "Retry-After": "90" }),
      success,
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: { rateLimitDelayMs: 120_000 },
    });
    const call = observe(client.projects.list());
    await vi.advanceTimersByTimeAsync(89_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
  });

  it("does not retry with maxRetries: 0 on the client or per call", async () => {
    const onClient = fakeFetch(rateLimited());
    const err = (await new NovaraFlexClient({
      token: TOKEN,
      fetch: onClient.fetch,
      retry: { maxRetries: 0 },
    })
      .call("projects.list")
      .catch((e: unknown) => e)) as NovaraFlexRateLimitError;
    expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
    expect(err.attempts).toBe(1);
    expect(onClient.calls).toHaveLength(1);

    const perCall = fakeFetch(http429());
    const err2 = (await new NovaraFlexClient({
      token: TOKEN,
      fetch: perCall.fetch,
    })
      .call("projects.list", undefined, { retry: { maxRetries: 0 } })
      .catch((e: unknown) => e)) as NovaraFlexRateLimitError;
    expect(err2.attempts).toBe(1);
    expect(perCall.calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("spends the ordinary maxRetries budget", async () => {
    const { fetch, calls } = sequence(
      () => jsonResponse({ ok: false, error: "server_error" }),
      rateLimited(),
      success,
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: { maxRetries: 1 },
    });
    const call = observe(client.projects.list());
    await vi.advanceTimersByTimeAsync(0); // the backoff is 0 ms
    const err = (await call.outcome) as NovaraFlexRateLimitError;
    expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
    expect(err.attempts).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it("takes rateLimitDelayMs from the client, and per call over it", async () => {
    const { fetch, calls } = sequence(
      rateLimited(),
      success,
      rateLimited(),
      success,
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: { rateLimitDelayMs: 2_000 },
    });

    const first = observe(client.projects.list());
    await vi.advanceTimersByTimeAsync(1_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(first.outcome).resolves.toEqual({ ok: true, projects: [] });

    const second = observe(
      client.projects.list(undefined, { retry: { rateLimitDelayMs: 3_000 } }),
    );
    await vi.advanceTimersByTimeAsync(2_999);
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(4);
    await expect(second.outcome).resolves.toEqual({ ok: true, projects: [] });
  });

  for (const [label, retry] of [
    ["a negative rateLimitDelayMs", { rateLimitDelayMs: -1 }],
    [
      "a rateLimitDelayMs setTimeout cannot honour",
      { rateLimitDelayMs: 2_147_483_648 },
    ],
  ] as const) {
    it(`rejects ${label} in the constructor and per call`, async () => {
      const { fetch, calls } = fakeFetch(success);
      expect(
        () => new NovaraFlexClient({ token: TOKEN, fetch, retry }),
      ).toThrow(
        /^NovaraFlexClient retry\.rateLimitDelayMs must be a finite number of milliseconds from 0 to 2147483647/,
      );
      const client = new NovaraFlexClient({ token: TOKEN, fetch });
      await expect(
        client.call("projects.list", undefined, { retry }),
      ).rejects.toThrow(/^NovaraFlexCallOptions\.retry\.rateLimitDelayMs/);
      expect(calls).toHaveLength(0);
    });
  }
});

describe("NovaraFlexClient rate-limit cooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("holds a concurrent call and a new call until the cooldown ends", async () => {
    let usersAnswered = 0;
    let projectsAnswered = 0;
    const { fetch, calls } = fakeFetch((capture) => {
      if (capture.url.endsWith("/projects.list")) {
        projectsAnswered += 1;
        return projectsAnswered === 1 ? rateLimited()() : success();
      }
      if (capture.url.endsWith("/users.list")) {
        usersAnswered += 1;
        // In flight when the limit lands, then failing in a way that retries.
        return usersAnswered === 1
          ? delayed(10, () =>
              jsonResponse({ ok: false, error: "server_error" }),
            )()
          : jsonResponse({ ok: true, users: [] });
      }
      return jsonResponse({ ok: true, roles: [] });
    });
    const client = new NovaraFlexClient({ token: TOKEN, fetch });

    const a = observe(client.projects.list());
    const b = observe(client.users.list());
    await vi.advanceTimersByTimeAsync(1_000);
    const c = observe(client.roles.list());
    await vi.advanceTimersByTimeAsync(0);
    // A's first attempt and B's first attempt only; B's retry and C are held.
    expect(calls).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(58_999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(callsTo(calls, "projects.list")).toHaveLength(2);
    expect(callsTo(calls, "users.list")).toHaveLength(2);
    expect(callsTo(calls, "roles.list")).toHaveLength(1);
    await expect(a.outcome).resolves.toEqual({ ok: true, projects: [] });
    await expect(b.outcome).resolves.toEqual({ ok: true, users: [] });
    await expect(c.outcome).resolves.toEqual({ ok: true, roles: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("pauses the client for an uncapped Retry-After even when it throws at once", async () => {
    const { fetch, calls } = sequence(
      http429("", { "Retry-After": "120" }),
      success,
    );
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const err = await client.projects.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NovaraFlexRateLimitError);

    const next = observe(client.projects.list());
    await vi.advanceTimersByTimeAsync(119_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(next.outcome).resolves.toEqual({ ok: true, projects: [] });
  });

  for (const [label, abortWith] of [
    ["an AbortError", undefined],
    ["a custom reason", new Error("user navigated away")],
  ] as const) {
    it(`lets the caller's signal cancel a cooldown wait with ${label}, unchanged`, async () => {
      const { fetch, calls } = sequence(rateLimited(), success);
      const client = new NovaraFlexClient({
        token: TOKEN,
        fetch,
        retry: NO_RETRY,
      });
      await client.projects.list().catch(() => undefined);

      const controller = new AbortController();
      const waiting = observe(
        client.projects.list(undefined, { signal: controller.signal }),
      );
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vi.getTimerCount()).toBe(1); // the cooldown wait
      controller.abort(abortWith);
      const err = await waiting.outcome;

      expect(err).toBe(controller.signal.reason);
      expect(err).not.toBeInstanceOf(NovaraFlexError);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(calls).toHaveLength(1);
    });
  }

  it("rejects an already-aborted signal without sending during a cooldown", async () => {
    const { fetch, calls } = sequence(rateLimited(), success);
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: NO_RETRY,
    });
    await client.projects.list().catch(() => undefined);
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.projects.list(undefined, { signal: controller.signal }),
    ).rejects.toBe(controller.signal.reason);
    expect(calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds a dataload.create issued during the cooldown, and never retries its own rate limit", async () => {
    const { fetch, calls } = fakeFetch(rateLimited());
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: NO_RETRY,
    });
    await client.projects.list().catch(() => undefined);

    await vi.advanceTimersByTimeAsync(1);
    const create = observe(client.dataload.create({ adapter: "acme" }));
    await vi.advanceTimersByTimeAsync(59_998);
    expect(callsTo(calls, "dataload.create")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(callsTo(calls, "dataload.create")).toHaveLength(1);

    const err = (await create.outcome) as NovaraFlexRateLimitError;
    expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
    expect(err.method).toBe("dataload.create");
    expect(err.attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(callsTo(calls, "dataload.create")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry dataload.create on a rate limit even under the default policy", async () => {
    const { fetch, calls } = fakeFetch(http429());
    const client = new NovaraFlexClient({ token: TOKEN, fetch });
    const create = observe(client.dataload.create({ adapter: "acme" }));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(((await create.outcome) as NovaraFlexRateLimitError).attempts).toBe(
      1,
    );
    expect(calls).toHaveLength(1);
  });

  it("starts no cooldown with rateLimitDelayMs: 0 and no Retry-After", async () => {
    const { fetch, calls } = sequence(rateLimited(), success);
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: { maxRetries: 0, rateLimitDelayMs: 0 },
    });
    await client.projects.list().catch(() => undefined);
    const next = client.projects.list();
    // Sent synchronously: nothing to wait for.
    expect(calls).toHaveLength(2);
    await expect(next).resolves.toEqual({ ok: true, projects: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still honours a Retry-After with rateLimitDelayMs: 0", async () => {
    const { fetch, calls } = sequence(
      rateLimited({ "Retry-After": "3" }),
      success,
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: { maxRetries: 0, rateLimitDelayMs: 0 },
    });
    await client.projects.list().catch(() => undefined);
    const next = observe(client.projects.list());
    await vi.advanceTimersByTimeAsync(2_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(next.outcome).resolves.toEqual({ ok: true, projects: [] });
  });

  it("starts the request timeout only when the request is sent", async () => {
    const { fetch, calls } = sequence(rateLimited(), delayed(500, success));
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      timeoutMs: 1_000,
      retry: NO_RETRY,
    });
    await client.projects.list().catch(() => undefined);
    const next = observe(client.projects.list());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(500);
    await expect(next.outcome).resolves.toEqual({ ok: true, projects: [] });
  });
});

describe("NovaraFlexClient rateLimit throttle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("spaces request starts 60_000 / requestsPerMinute ms apart", async () => {
    const { fetch, calls } = fakeFetch(success);
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      rateLimit: { requestsPerMinute: 6 },
    });
    const all = [0, 1, 2].map(() => observe(client.projects.list()));

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(3);
    for (const call of all) {
      await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends retries through the throttle too", async () => {
    const { fetch, calls } = sequence(
      () => jsonResponse({ ok: false, error: "server_error" }),
      success,
    );
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      rateLimit: { requestsPerMinute: 6 },
    });
    // The backoff is 0 ms; the throttle still holds the retry for 10 s.
    const call = observe(client.projects.list());
    await vi.advanceTimersByTimeAsync(9_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(call.outcome).resolves.toEqual({ ok: true, projects: [] });
  });

  it("waits out a cooldown first, then keeps the spacing after it", async () => {
    const { fetch, calls } = sequence(rateLimited(), success);
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      retry: NO_RETRY,
      rateLimit: { requestsPerMinute: 30 }, // 2 s apart
    });
    await client.projects.list().catch(() => undefined);
    const a = observe(client.projects.list());
    const b = observe(client.projects.list());
    await vi.advanceTimersByTimeAsync(59_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);
    await expect(a.outcome).resolves.toEqual({ ok: true, projects: [] });
    await expect(b.outcome).resolves.toEqual({ ok: true, projects: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets the caller's signal take a call out of the throttle queue", async () => {
    const { fetch, calls } = fakeFetch(success);
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      rateLimit: { requestsPerMinute: 6 },
    });
    const controller = new AbortController();
    const first = observe(client.projects.list());
    const queued = observe(
      client.projects.list(undefined, { signal: controller.signal }),
    );
    const third = observe(client.projects.list());
    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();
    expect(await queued.outcome).toBe(controller.signal.reason);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(calls).toHaveLength(2);
    await expect(first.outcome).resolves.toBeDefined();
    await expect(third.outcome).resolves.toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  for (const [label, rateLimit] of [
    ["omitted", undefined],
    ["false", false],
  ] as const) {
    it(`does not throttle when rateLimit is ${label}`, () => {
      const { fetch, calls } = fakeFetch(success);
      const client = new NovaraFlexClient({
        token: TOKEN,
        fetch,
        timeoutMs: 0,
        ...(rateLimit === undefined ? {} : { rateLimit }),
      });
      for (let i = 0; i < 5; i++) void client.projects.list();
      expect(calls).toHaveLength(5);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it("accepts the boundary values", () => {
    const { fetch } = fakeFetch(success);
    for (const requestsPerMinute of [0.5, 6_000]) {
      expect(
        () =>
          new NovaraFlexClient({
            token: TOKEN,
            fetch,
            rateLimit: { requestsPerMinute },
          }),
      ).not.toThrow();
    }
  });

  const invalid: ReadonlyArray<[string, unknown]> = [
    ["zero", { requestsPerMinute: 0 }],
    ["a negative rate", { requestsPerMinute: -1 }],
    ["NaN", { requestsPerMinute: Number.NaN }],
    ["Infinity", { requestsPerMinute: Number.POSITIVE_INFINITY }],
    ["a rate over 6000", { requestsPerMinute: 6_001 }],
    ["a string rate", { requestsPerMinute: "40" }],
    ["a missing rate", {}],
    ["true", true],
    ["a bare number", 40],
    ["null", null],
  ];

  for (const [label, rateLimit] of invalid) {
    it(`rejects ${label} in the constructor`, () => {
      const { fetch } = fakeFetch(success);
      const make = () =>
        new NovaraFlexClient({
          token: TOKEN,
          fetch,
          rateLimit: rateLimit as NonNullable<
            NovaraFlexClientOptions["rateLimit"]
          >,
        });
      expect(make).toThrow(TypeError);
      expect(make).toThrow(
        /^NovaraFlexClient rateLimit must be false or \{ requestsPerMinute \}/,
      );
    });
  }
});

describe("NovaraFlexClient token confidentiality", () => {
  /** The SDK's own error must reveal nothing, whatever its `cause` says. */
  function expectNoLeak(err: Error): void {
    expect(err).toBeInstanceOf(NovaraFlexError);
    expect(err.message).not.toContain(TOKEN);
    expect(String(err)).not.toContain(TOKEN);
    expect(JSON.stringify(err)).not.toContain(TOKEN);
    expect(JSON.stringify({ ...err })).not.toContain(TOKEN);
    expect(err.stack ?? "").not.toContain(TOKEN);
    for (const key of Object.getOwnPropertyNames(err)) {
      if (key === "cause") continue;
      const value: unknown = Reflect.get(err, key);
      expect(String(value), key).not.toContain(TOKEN);
    }
  }

  // The expected `reason` for a transport error, or `undefined` for an API
  // error, and how many attempts the default policy makes: the retried
  // failures run the whole retry path (backoff zeroed) before surfacing.
  const failures: ReadonlyArray<
    [
      string,
      () => typeof globalThis.fetch,
      NovaraFlexTransportErrorReason | undefined,
      number,
    ]
  > = [
    [
      "an application error",
      () =>
        fakeFetch(() =>
          jsonResponse({ ok: false, error: "token_invalid", description: "x" }),
        ).fetch,
      undefined,
      1,
    ],
    [
      "a retried application error",
      () =>
        fakeFetch(() =>
          jsonResponse({ ok: false, error: "server_error", description: "x" }),
        ).fetch,
      undefined,
      3,
    ],
    [
      "a retried rate-limit error with Retry-After",
      () =>
        fakeFetch(() =>
          jsonResponse(
            { ok: false, error: "rate_limit_exceeded" },
            { headers: { "Retry-After": "0" } },
          ),
        ).fetch,
      undefined,
      2,
    ],
    [
      "a retried HTTP 429 with an HTML body",
      () =>
        fakeFetch(
          () =>
            new Response("<html>429</html>", {
              status: 429,
              headers: { "Retry-After": "0" },
            }),
        ).fetch,
      undefined,
      2,
    ],
    [
      "a retried HTTP error",
      () => fakeFetch(() => new Response("boom", { status: 500 })).fetch,
      "http_status",
      3,
    ],
    [
      "a non-JSON body",
      () => fakeFetch(() => new Response("not json", { status: 200 })).fetch,
      "invalid_json",
      1,
    ],
    [
      "an unrecognized envelope",
      () => fakeFetch(() => jsonResponse({})).fetch,
      "invalid_envelope",
      1,
    ],
    [
      "a retried rejected fetch",
      () => () =>
        Promise.reject(new TypeError(`fetch failed for token ${TOKEN}`)),
      "network",
      3,
    ],
  ];

  for (const [label, makeFetch, reason, attempts] of failures) {
    it(`never leaks the token through ${label}`, async () => {
      const client = new NovaraFlexClient({
        token: TOKEN,
        fetch: makeFetch(),
        retry: { baseDelayMs: 0 },
      });
      const err = (await client.call("api.ping").catch((e: unknown) => e)) as
        | NovaraFlexApiError
        | NovaraFlexTransportError;

      expectNoLeak(err);
      expect(err.attempts).toBe(attempts);
      if (reason !== "network") {
        // Only the rejected fetch's own cause (the runtime's object, not the
        // SDK's) mentions the token.
        expect(String(err.cause)).not.toContain(TOKEN);
      }
      if (reason === undefined) {
        expect(err).toBeInstanceOf(NovaraFlexApiError);
      } else {
        expect(err).toBeInstanceOf(NovaraFlexTransportError);
        expect((err as NovaraFlexTransportError).reason).toBe(reason);
      }
    });
  }

  describe("on a timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    const phases: ReadonlyArray<[string, typeof globalThis.fetch]> = [
      ["waiting for headers", fakeFetch(hang).fetch],
      [
        "reading the body",
        fakeFetch(({ init }) => stalledBodyResponse(init?.signal)).fetch,
      ],
    ];

    for (const [phase, fetch] of phases) {
      it(`never leaks the token while ${phase}, across every retry`, async () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
        const client = new NovaraFlexClient({
          token: TOKEN,
          fetch,
          timeoutMs: 1_000,
        });
        const pending = client.call("api.ping").catch((e: unknown) => e);
        await vi.runAllTimersAsync();
        const err = (await pending) as NovaraFlexTransportError;

        expectNoLeak(err);
        expect(err.reason).toBe("timeout");
        expect(err.attempts).toBe(3);
        expect(err.reason).not.toContain(TOKEN);
        expect(String(err.cause)).not.toContain(TOKEN);
      });
    }
  });

  describe("on the rate-limit queue paths", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(Math, "random").mockReturnValue(0);
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("never leaks the token through a retry, a cooldown wait, or a throttle slot", async () => {
      const { fetch, calls } = fakeFetch(
        () =>
          new Response(`<html>${TOKEN}</html>`, {
            status: 429,
            headers: { "HZS-Request-ID": "req-429" },
          }),
      );
      const client = new NovaraFlexClient({
        token: TOKEN,
        fetch,
        rateLimit: { requestsPerMinute: 30 },
      });
      // A is retried once after the window; B and C queue behind the cooldown
      // and the throttle, then meet the limit themselves.
      const a = client.call("api.ping").catch((e: unknown) => e);
      const b = client.call("projects.list").catch((e: unknown) => e);
      const c = client
        .call("dataload.create", { file: "x" })
        .catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const errors = (await Promise.all([
        a,
        b,
        c,
      ])) as NovaraFlexRateLimitError[];

      expect(calls.length).toBeGreaterThanOrEqual(4);
      for (const err of errors) {
        expect(err).toBeInstanceOf(NovaraFlexRateLimitError);
        expectNoLeak(err);
        expect(err.cause).toBeUndefined();
        expect(err.description).toBeUndefined();
      }
      expect(errors[0]?.attempts).toBe(2);
      expect(errors[2]?.attempts).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it("keeps the token out of the error even when the cause mentions it", async () => {
    // The cause is the caller's/runtime's object; the SDK must not copy it into
    // its own message or properties.
    const fetchImpl: typeof globalThis.fetch = () =>
      Promise.reject(new TypeError(`bad token ${TOKEN}`));
    const client = new NovaraFlexClient({ token: TOKEN, fetch: fetchImpl });
    const err = (await client
      .call("api.ping")
      .catch((e: unknown) => e)) as NovaraFlexTransportError;
    expect(err.message).not.toContain(TOKEN);
    expect(JSON.stringify(err)).not.toContain(TOKEN);
  });
});

describe("NovaraFlexClient types", () => {
  const { fetch } = fakeFetch(() => jsonResponse({ ok: true }));
  const client = new NovaraFlexClient({ token: TOKEN, fetch });

  it("resolves a call to the method's success payload", () => {
    expectTypeOf(client.call("api.ping")).resolves.toExtend<{ ok: true }>();
    expectTypeOf(client.call("users.list")).resolves.toExtend<{ ok: true }>();
  });

  it("rejects unknown methods and unknown params", () => {
    // @ts-expect-error "nope" is not a Novara Flex method
    void client.call("nope");
    // @ts-expect-error "bogus" is not a parameter of api.ping
    void client.call("api.ping", { bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.call("api.ping", { token: "override" });
    // @ts-expect-error a leading slash is not part of the method name
    void client.call("/api.ping");
  });

  it("types timeoutMs as a number on the client and per call", () => {
    // Never invoked: these only have to type-check (or fail to).
    const _typeOnly = () => {
      void new NovaraFlexClient({ token: TOKEN, fetch, timeoutMs: 1_000 });
      void client.call("api.ping", undefined, { timeoutMs: 1_000 });
      // @ts-expect-error timeoutMs is a number of milliseconds, not a string
      void new NovaraFlexClient({ token: TOKEN, fetch, timeoutMs: "1000" });
      // @ts-expect-error timeoutMs is a number of milliseconds, not a string
      void client.call("api.ping", undefined, { timeoutMs: "1000" });
    };
    expect(typeof _typeOnly).toBe("function");
  });

  it("offers idempotent per call only, never client-wide", () => {
    const _typeOnly = () => {
      void new NovaraFlexClient({
        token: TOKEN,
        fetch,
        retry: { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1_000 },
      });
      void client.call("dataload.create", undefined, {
        retry: { idempotent: true, maxRetries: 1 },
      });
      void new NovaraFlexClient({
        token: TOKEN,
        fetch,
        // @ts-expect-error a client-wide setting must never enable write retries
        retry: { idempotent: true },
      });
    };
    expect(typeof _typeOnly).toBe("function");
  });

  it("types rateLimit as an explicit budget or false, with no true shorthand", () => {
    const _typeOnly = () => {
      void new NovaraFlexClient({
        token: TOKEN,
        fetch,
        rateLimit: { requestsPerMinute: 40 },
      });
      void new NovaraFlexClient({ token: TOKEN, fetch, rateLimit: false });
      void client.call("api.ping", undefined, {
        retry: { rateLimitDelayMs: 30_000 },
      });
      // @ts-expect-error callers choose a budget; there is no default one
      void new NovaraFlexClient({ token: TOKEN, fetch, rateLimit: true });
      // @ts-expect-error the budget is an object, not a bare number
      void new NovaraFlexClient({ token: TOKEN, fetch, rateLimit: 40 });
      // @ts-expect-error the throttle is client-wide, not per call
      void client.call("api.ping", undefined, { rateLimit: false });
    };
    expect(typeof _typeOnly).toBe("function");
  });

  it("exposes baseUrl as a readonly string", () => {
    expectTypeOf(client.baseUrl).toEqualTypeOf<string>();
  });
});
