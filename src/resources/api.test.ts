import { describe, expect, expectTypeOf, it } from "vitest";
import type { NovaraFlexResult } from "../client.js";
import { NovaraFlexApiError, NovaraFlexTransportError } from "../errors.js";
import {
  BASE_URL,
  bodyOf,
  createClient,
  jsonResponse,
  TOKEN,
} from "../test-support/fake-fetch.js";

describe("flex.api.ping", () => {
  it("posts to baseUrl/api.ping with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse({ ok: true }));
    await client.api.ping();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/api.ping`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse({ ok: true }));
    await client.api.ping({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.api.ping({ token: "attacker-supplied" } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse({ ok: true }));
    const controller = new AbortController();
    await client.api.ping(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the success body verbatim", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: true, pong: true, extra: [1] }),
    );
    await expect(client.api.ping()).resolves.toEqual({
      ok: true,
      pong: true,
      extra: [1],
    });
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_invalid" }),
    );
    const err = (await client.api
      .ping()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_invalid");
    expect(err.method).toBe("api.ping");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.api
      .ping()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("api.ping");
    expect(err.message).toBe("Novara Flex api.ping: returned a non-JSON body");
  });
});

describe("flex.api.echo", () => {
  it("posts the echo payload to baseUrl/api.echo with the token", async () => {
    const { client, calls } = createClient((capture) =>
      // The vendor answers with exactly the object it was given.
      jsonResponse(
        (JSON.parse(String(capture.init?.body)) as { response: unknown })
          .response,
      ),
    );
    await client.api.echo({ response: { ok: true, foo: "bar" } });

    expect(calls[0]?.url).toBe(`${BASE_URL}/api.echo`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({
      response: { ok: true, foo: "bar" },
      token: TOKEN,
    });
  });

  it("forwards pretty and an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse({ ok: true }));
    const controller = new AbortController();
    await client.api.echo(
      { response: { ok: true }, pretty: true },
      { signal: controller.signal },
    );

    expect(bodyOf(calls[0])).toEqual({
      response: { ok: true },
      pretty: true,
      token: TOKEN,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("never lets the echoed payload override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse({ ok: true }));
    await client.api.echo({
      response: { ok: true },
      token: "attacker-supplied",
    } as unknown as { response: Record<string, unknown> });
    expect(bodyOf(calls[0]).token).toBe(TOKEN);
  });

  it("resolves with the echoed object when it is a success envelope", async () => {
    const echoed = { ok: true, echoed: "novara-flex-js", nested: { n: 1 } };
    const { client } = createClient(() => jsonResponse(echoed));
    await expect(client.api.echo({ response: echoed })).resolves.toEqual(
      echoed,
    );
  });

  it("throws a NovaraFlexApiError when the echoed object is an error envelope", async () => {
    // Echoing is indistinguishable from a real failure: the echoed object *is*
    // the response body, so the envelope rules apply to it.
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "server_error", description: "echoed" }),
    );
    const err = (await client.api
      .echo({ response: { ok: false, error: "server_error" } })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("server_error");
    expect(err.description).toBe("echoed");
    expect(err.method).toBe("api.echo");
  });

  it("throws a NovaraFlexTransportError when the echoed object is not an envelope", async () => {
    const { client } = createClient(() => jsonResponse({ foo: "bar" }));
    const err = (await client.api
      .echo({ response: { foo: "bar" } })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("api.echo");
    expect(err.message).toBe(
      "Novara Flex api.echo: returned an unrecognized response envelope",
    );
  });
});

describe("flex.api types", () => {
  const { client } = createClient(() => jsonResponse({ ok: true }));

  it("makes params optional for api.ping and required for api.echo", () => {
    void client.api.ping();
    void client.api.ping({ pretty: true });
    void client.api.echo({ response: { ok: true } });
    // @ts-expect-error api.echo requires a `response` object
    void client.api.echo();
    // @ts-expect-error `bogus` is not a parameter of api.ping
    void client.api.ping({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.api.ping({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.api.ping()).resolves.toEqualTypeOf<
      NovaraFlexResult<"api.ping">
    >();
    expectTypeOf(
      client.api.echo({ response: { ok: true } }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"api.echo">>();
    expectTypeOf(client.api.ping()).toEqualTypeOf(client.call("api.ping"));
  });
});
