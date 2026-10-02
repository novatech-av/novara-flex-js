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

/** A minimal `datalists.list` success body. */
const DATALISTS_BODY = {
  ok: true,
  datalists: [
    {
      id: 324,
      created: 1_473_688_379_489,
      updated: 1_476_981_004_760,
      title: "Cost Codes",
      // An undocumented key: nothing is stripped, so it survives the call.
      undocumented: "kept",
    },
  ],
};

describe("flex.datalists.list", () => {
  it("posts to baseUrl/datalists.list with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(DATALISTS_BODY));
    await client.datalists.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/datalists.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(DATALISTS_BODY));
    await client.datalists.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.datalists.list({
      token: "attacker-supplied",
    } as unknown as { pretty?: boolean });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(DATALISTS_BODY));
    const controller = new AbortController();
    await client.datalists.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(DATALISTS_BODY));
    const result = await client.datalists.list();

    expect(result).toEqual(DATALISTS_BODY);
    expect(result.ok).toBe(true);
    expect(result.datalists).toEqual(DATALISTS_BODY.datalists);
    expect(result.datalists[0]?.undocumented).toBe("kept");
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.datalists
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("datalists.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.datalists
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("datalists.list");
    expect(err.message).toBe(
      "Novara Flex datalists.list: returned a non-JSON body",
    );
  });
});

describe("flex.datalists types", () => {
  const { client } = createClient(() => jsonResponse(DATALISTS_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.datalists.list();
    void client.datalists.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of datalists.list
    void client.datalists.list({ bogus: 1 });
    // @ts-expect-error `pretty` is a boolean, not a string
    void client.datalists.list({ pretty: "x" });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.datalists.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.datalists.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"datalists.list">
    >();
    expectTypeOf(client.datalists.list()).toEqualTypeOf(
      client.call("datalists.list"),
    );
  });
});
