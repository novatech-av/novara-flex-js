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

/** The establishment every `info` request in this file asks about. */
const ESTABLISHMENT_ID = 324;

/** A minimal `establishments.list` success body. */
const ESTABLISHMENTS_BODY = {
  ok: true,
  establishments: [
    {
      id: ESTABLISHMENT_ID,
      created: 1_473_688_379_489,
      updated: 1_476_981_004_760,
      name: "North Yard",
    },
  ],
};

/**
 * A minimal `establishments.info` success body.
 *
 * The vendor answers with `establishment` as an array holding the single match,
 * not as an object — the live shape, which the contract already modeled.
 */
const ESTABLISHMENT_BODY = {
  ok: true,
  establishment: [
    {
      id: ESTABLISHMENT_ID,
      created: 1_473_688_379_489,
      updated: 1_476_981_004_760,
      name: "North Yard",
      street: "1 Example Road",
      city: "Example City",
      state: "TX",
      zip: "70000",
      industry_description: "Specialty Trade Contractors",
    },
  ],
};

describe("flex.establishments.list", () => {
  it("posts to baseUrl/establishments.list with the injected token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(ESTABLISHMENTS_BODY),
    );
    await client.establishments.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/establishments.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(ESTABLISHMENTS_BODY),
    );
    await client.establishments.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.establishments.list({
      token: "attacker-supplied",
    } as unknown as { pretty?: boolean });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(ESTABLISHMENTS_BODY),
    );
    const controller = new AbortController();
    await client.establishments.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(ESTABLISHMENTS_BODY));
    const result = await client.establishments.list();

    expect(result).toEqual(ESTABLISHMENTS_BODY);
    expect(result.ok).toBe(true);
    expect(result.establishments).toEqual(ESTABLISHMENTS_BODY.establishments);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.establishments
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("establishments.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.establishments
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("establishments.list");
    expect(err.message).toBe(
      "Novara Flex establishments.list: returned a non-JSON body",
    );
  });
});

describe("flex.establishments.info", () => {
  it("posts establishment_id to baseUrl/establishments.info with the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(ESTABLISHMENT_BODY),
    );
    await client.establishments.info({ establishment_id: ESTABLISHMENT_ID });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/establishments.info`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({
      establishment_id: ESTABLISHMENT_ID,
      token: TOKEN,
    });
  });

  it("forwards pretty and an abort signal, and keeps the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(ESTABLISHMENT_BODY),
    );
    const controller = new AbortController();
    await client.establishments.info(
      { establishment_id: ESTABLISHMENT_ID, pretty: true },
      { signal: controller.signal },
    );

    expect(bodyOf(calls[0])).toEqual({
      establishment_id: ESTABLISHMENT_ID,
      pretty: true,
      token: TOKEN,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);

    await client.establishments.info({
      establishment_id: ESTABLISHMENT_ID,
      token: "attacker-supplied",
    } as unknown as { establishment_id: number });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("returns the whole body, keeping establishment as the vendor's array", async () => {
    const { client } = createClient(() => jsonResponse(ESTABLISHMENT_BODY));
    const result = await client.establishments.info({
      establishment_id: ESTABLISHMENT_ID,
    });

    expect(result).toEqual(ESTABLISHMENT_BODY);
    expect(result.ok).toBe(true);
    // Nothing is unwrapped: the single match stays inside the array.
    expect(Array.isArray(result.establishment)).toBe(true);
    expect(result.establishment).toHaveLength(1);
    expect(result.establishment[0]?.id).toBe(ESTABLISHMENT_ID);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "content_not_found" }),
    );
    const err = (await client.establishments
      .info({ establishment_id: ESTABLISHMENT_ID })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("content_not_found");
    expect(err.method).toBe("establishments.info");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.establishments
      .info({ establishment_id: ESTABLISHMENT_ID })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("establishments.info");
    expect(err.message).toBe(
      "Novara Flex establishments.info: returned a non-JSON body",
    );
  });
});

describe("flex.establishments types", () => {
  const { client } = createClient(() => jsonResponse(ESTABLISHMENTS_BODY));

  it("makes list params optional and requires establishment_id on info", () => {
    void client.establishments.list();
    void client.establishments.list({ pretty: true });
    void client.establishments.info({ establishment_id: ESTABLISHMENT_ID });
    void client.establishments.info({
      establishment_id: ESTABLISHMENT_ID,
      pretty: true,
    });
    // @ts-expect-error `bogus` is not a parameter of establishments.list
    void client.establishments.list({ bogus: 1 });
    // @ts-expect-error establishments.info requires an `establishment_id`
    void client.establishments.info();
    // @ts-expect-error establishments.info requires an `establishment_id`
    void client.establishments.info({ pretty: true });
    // @ts-expect-error the vendor's parameter is `establishment_id`, not `id`
    void client.establishments.info({ id: ESTABLISHMENT_ID });
    // @ts-expect-error `establishment_id` is an integer, not a string
    void client.establishments.info({ establishment_id: "324" });
    void client.establishments.info({
      establishment_id: ESTABLISHMENT_ID,
      // @ts-expect-error the token is supplied by the client, not the caller
      token: "override",
    });
  });

  it("returns exactly what call returns for the same methods", () => {
    expectTypeOf(client.establishments.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"establishments.list">
    >();
    expectTypeOf(
      client.establishments.info({ establishment_id: ESTABLISHMENT_ID }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"establishments.info">>();
    expectTypeOf(client.establishments.list()).toEqualTypeOf(
      client.call("establishments.list"),
    );
    expectTypeOf(
      client.establishments.info({ establishment_id: ESTABLISHMENT_ID }),
    ).toEqualTypeOf(
      client.call("establishments.info", {
        establishment_id: ESTABLISHMENT_ID,
      }),
    );
  });
});
