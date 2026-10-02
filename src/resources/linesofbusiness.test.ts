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

/** A minimal `linesofbusiness.list` success body. */
const LINESOFBUSINESS_BODY = {
  ok: true,
  linesofbusiness: [
    { id: "lob1", name: "Construction", code: "CON", created: 1_500_000_000 },
  ],
};

describe("flex.linesofbusiness.list", () => {
  it("posts to baseUrl/linesofbusiness.list with the injected token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(LINESOFBUSINESS_BODY),
    );
    await client.linesofbusiness.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/linesofbusiness.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(LINESOFBUSINESS_BODY),
    );
    await client.linesofbusiness.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.linesofbusiness.list({
      token: "attacker-supplied",
    } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(LINESOFBUSINESS_BODY),
    );
    const controller = new AbortController();
    await client.linesofbusiness.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(LINESOFBUSINESS_BODY));
    const result = await client.linesofbusiness.list();

    expect(result).toEqual(LINESOFBUSINESS_BODY);
    expect(result.ok).toBe(true);
    expect(result.linesofbusiness).toEqual(
      LINESOFBUSINESS_BODY.linesofbusiness,
    );
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.linesofbusiness
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("linesofbusiness.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.linesofbusiness
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("linesofbusiness.list");
    expect(err.message).toBe(
      "Novara Flex linesofbusiness.list: returned a non-JSON body",
    );
  });
});

describe("flex.linesofbusiness types", () => {
  const { client } = createClient(() => jsonResponse(LINESOFBUSINESS_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.linesofbusiness.list();
    void client.linesofbusiness.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of linesofbusiness.list
    void client.linesofbusiness.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.linesofbusiness.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.linesofbusiness.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"linesofbusiness.list">
    >();
    expectTypeOf(client.linesofbusiness.list()).toEqualTypeOf(
      client.call("linesofbusiness.list"),
    );
  });
});
