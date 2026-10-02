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

/** A minimal `fieldoffices.list` success body. */
const FIELDOFFICES_BODY = {
  ok: true,
  fieldoffices: [
    {
      id: "fo1",
      name: "North Yard",
      code: "NY",
      manager_id: "5804f0f30ef50473af5870c6",
      created: 1_500_000_000,
      inactive: false,
    },
  ],
};

describe("flex.fieldoffices.list", () => {
  it("posts to baseUrl/fieldoffices.list with the injected token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(FIELDOFFICES_BODY),
    );
    await client.fieldoffices.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/fieldoffices.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(FIELDOFFICES_BODY),
    );
    await client.fieldoffices.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.fieldoffices.list({
      token: "attacker-supplied",
    } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(FIELDOFFICES_BODY),
    );
    const controller = new AbortController();
    await client.fieldoffices.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(FIELDOFFICES_BODY));
    const result = await client.fieldoffices.list();

    expect(result).toEqual(FIELDOFFICES_BODY);
    expect(result.ok).toBe(true);
    expect(result.fieldoffices).toEqual(FIELDOFFICES_BODY.fieldoffices);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.fieldoffices
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("fieldoffices.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.fieldoffices
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("fieldoffices.list");
    expect(err.message).toBe(
      "Novara Flex fieldoffices.list: returned a non-JSON body",
    );
  });
});

describe("flex.fieldoffices types", () => {
  const { client } = createClient(() => jsonResponse(FIELDOFFICES_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.fieldoffices.list();
    void client.fieldoffices.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of fieldoffices.list
    void client.fieldoffices.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.fieldoffices.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.fieldoffices.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"fieldoffices.list">
    >();
    expectTypeOf(client.fieldoffices.list()).toEqualTypeOf(
      client.call("fieldoffices.list"),
    );
  });
});
