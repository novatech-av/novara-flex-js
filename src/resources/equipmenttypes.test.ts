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

/** A minimal `equipmenttypes.list` success body. */
const EQUIPMENT_TYPES_BODY = {
  ok: true,
  equipmenttypes: [
    {
      id: "5804f0f80ef50473af587886",
      title: "Example Equipment Type",
      created: 1_500_000_000,
      metafields: [{ id: "m1", name: "Size", type: "list", list_id: 3 }],
      schedules: [{ id: "s1" }],
    },
  ],
};

describe("flex.equipmenttypes.list", () => {
  it("posts to baseUrl/equipmenttypes.list with the injected token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(EQUIPMENT_TYPES_BODY),
    );
    await client.equipmenttypes.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/equipmenttypes.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(EQUIPMENT_TYPES_BODY),
    );
    await client.equipmenttypes.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.equipmenttypes.list({
      token: "attacker-supplied",
    } as unknown as { pretty?: boolean });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(EQUIPMENT_TYPES_BODY),
    );
    const controller = new AbortController();
    await client.equipmenttypes.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(EQUIPMENT_TYPES_BODY));
    const result = await client.equipmenttypes.list();

    expect(result).toEqual(EQUIPMENT_TYPES_BODY);
    expect(result.ok).toBe(true);
    expect(result.equipmenttypes).toEqual(EQUIPMENT_TYPES_BODY.equipmenttypes);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.equipmenttypes
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("equipmenttypes.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.equipmenttypes
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("equipmenttypes.list");
    expect(err.message).toBe(
      "Novara Flex equipmenttypes.list: returned a non-JSON body",
    );
  });
});

describe("flex.equipmenttypes types", () => {
  const { client } = createClient(() => jsonResponse(EQUIPMENT_TYPES_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.equipmenttypes.list();
    void client.equipmenttypes.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of equipmenttypes.list
    void client.equipmenttypes.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.equipmenttypes.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.equipmenttypes.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"equipmenttypes.list">
    >();
    expectTypeOf(client.equipmenttypes.list()).toEqualTypeOf(
      client.call("equipmenttypes.list"),
    );
  });
});
