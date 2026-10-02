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

/** The acknowledgment every `info` request in this file asks about. */
const ACKNOWLEDGMENT_ID = "5804f0f30ef50473af5870c6";

/** A minimal `acknowledgments.list` success body. */
const ACKNOWLEDGMENTS_BODY = {
  ok: true,
  acknowledgments: [
    {
      id: ACKNOWLEDGMENT_ID,
      name: "Winter Driving Policy",
      created: 1_473_688_379_489,
      author_id: "u1",
      specificEmployees_id: ["u2"],
      fieldOffices_id: ["fo1"],
      linesOfBusiness_id: ["lob1"],
      jobTitles_id: ["jt1"],
    },
  ],
};

/** A minimal `acknowledgments.info` success body, recipients included. */
const ACKNOWLEDGMENT_BODY = {
  ok: true,
  acknowledgment: {
    id: ACKNOWLEDGMENT_ID,
    name: "Winter Driving Policy",
    created: 1_473_688_379_489,
    author_id: "u1",
    recipients: [
      { user_id: "u2", acknowledgedOn: 1_476_981_004_760 },
      // Null until that employee acknowledges.
      { user_id: "u3", acknowledgedOn: null },
    ],
  },
};

describe("flex.acknowledgments.list", () => {
  it("posts to baseUrl/acknowledgments.list with the injected token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(ACKNOWLEDGMENTS_BODY),
    );
    await client.acknowledgments.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/acknowledgments.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(ACKNOWLEDGMENTS_BODY),
    );
    await client.acknowledgments.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.acknowledgments.list({
      token: "attacker-supplied",
    } as unknown as { pretty?: boolean });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(ACKNOWLEDGMENTS_BODY),
    );
    const controller = new AbortController();
    await client.acknowledgments.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(ACKNOWLEDGMENTS_BODY));
    const result = await client.acknowledgments.list();

    expect(result).toEqual(ACKNOWLEDGMENTS_BODY);
    expect(result.ok).toBe(true);
    expect(result.acknowledgments).toEqual(
      ACKNOWLEDGMENTS_BODY.acknowledgments,
    );
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.acknowledgments
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("acknowledgments.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.acknowledgments
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("acknowledgments.list");
    expect(err.message).toBe(
      "Novara Flex acknowledgments.list: returned a non-JSON body",
    );
  });
});

describe("flex.acknowledgments.info", () => {
  it("posts id to baseUrl/acknowledgments.info with the injected token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(ACKNOWLEDGMENT_BODY),
    );
    await client.acknowledgments.info({ id: ACKNOWLEDGMENT_ID });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/acknowledgments.info`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ id: ACKNOWLEDGMENT_ID, token: TOKEN });
  });

  it("forwards pretty and an abort signal, and keeps the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(ACKNOWLEDGMENT_BODY),
    );
    const controller = new AbortController();
    await client.acknowledgments.info(
      { id: ACKNOWLEDGMENT_ID, pretty: true },
      { signal: controller.signal },
    );

    expect(bodyOf(calls[0])).toEqual({
      id: ACKNOWLEDGMENT_ID,
      pretty: true,
      token: TOKEN,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);

    await client.acknowledgments.info({
      id: ACKNOWLEDGMENT_ID,
      token: "attacker-supplied",
    } as unknown as { id: string });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("returns the whole success body, recipients included", async () => {
    const { client } = createClient(() => jsonResponse(ACKNOWLEDGMENT_BODY));
    const result = await client.acknowledgments.info({
      id: ACKNOWLEDGMENT_ID,
    });

    expect(result).toEqual(ACKNOWLEDGMENT_BODY);
    expect(result.ok).toBe(true);
    expect(result.acknowledgment).toEqual(ACKNOWLEDGMENT_BODY.acknowledgment);
    expect(result.acknowledgment.recipients).toHaveLength(2);
    expect(result.acknowledgment.recipients?.[1]?.acknowledgedOn).toBeNull();
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "content_not_found" }),
    );
    const err = (await client.acknowledgments
      .info({ id: ACKNOWLEDGMENT_ID })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("content_not_found");
    expect(err.method).toBe("acknowledgments.info");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.acknowledgments
      .info({ id: ACKNOWLEDGMENT_ID })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("acknowledgments.info");
    expect(err.message).toBe(
      "Novara Flex acknowledgments.info: returned a non-JSON body",
    );
  });
});

describe("flex.acknowledgments types", () => {
  const { client } = createClient(() => jsonResponse(ACKNOWLEDGMENTS_BODY));

  it("makes list params optional and requires id on info", () => {
    void client.acknowledgments.list();
    void client.acknowledgments.list({ pretty: true });
    void client.acknowledgments.info({ id: ACKNOWLEDGMENT_ID });
    void client.acknowledgments.info({ id: ACKNOWLEDGMENT_ID, pretty: true });
    // @ts-expect-error `bogus` is not a parameter of acknowledgments.list
    void client.acknowledgments.list({ bogus: 1 });
    // @ts-expect-error acknowledgments.info requires an `id`
    void client.acknowledgments.info();
    // @ts-expect-error acknowledgments.info requires an `id`
    void client.acknowledgments.info({ pretty: true });
    // @ts-expect-error the vendor's parameter is `id`, not `acknowledgment_id`
    void client.acknowledgments.info({ acknowledgment_id: ACKNOWLEDGMENT_ID });
    // @ts-expect-error `id` is a string, not a number
    void client.acknowledgments.info({ id: 5804 });
    void client.acknowledgments.info({
      id: ACKNOWLEDGMENT_ID,
      // @ts-expect-error the token is supplied by the client, not the caller
      token: "override",
    });
  });

  it("returns exactly what call returns for the same methods", () => {
    expectTypeOf(client.acknowledgments.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"acknowledgments.list">
    >();
    expectTypeOf(
      client.acknowledgments.info({ id: ACKNOWLEDGMENT_ID }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"acknowledgments.info">>();
    expectTypeOf(client.acknowledgments.list()).toEqualTypeOf(
      client.call("acknowledgments.list"),
    );
    expectTypeOf(
      client.acknowledgments.info({ id: ACKNOWLEDGMENT_ID }),
    ).toEqualTypeOf(
      client.call("acknowledgments.info", { id: ACKNOWLEDGMENT_ID }),
    );
  });
});
