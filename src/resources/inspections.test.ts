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

/** The equipment item every request in this file asks about. */
const EQUIPMENT_ID = "5804f0f30ef50473af5870c6";

/** A minimal `inspections.list` success body. */
const INSPECTIONS_BODY = {
  ok: true,
  inspections: [
    {
      id: "i1",
      equipment_id: EQUIPMENT_ID,
      equipmentType_id: "t1",
      schedule_id: "s1",
      inspector_id: "u1",
      date: 1_500_000_000,
      created: 1_500_000_100,
      notes: "",
    },
  ],
};

describe("flex.inspections.list", () => {
  it("posts the equipment id to baseUrl/inspections.list with the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(INSPECTIONS_BODY),
    );
    await client.inspections.list({ equipment_id: EQUIPMENT_ID });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/inspections.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({
      equipment_id: EQUIPMENT_ID,
      token: TOKEN,
    });
  });

  it("forwards pretty and never lets params override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(INSPECTIONS_BODY),
    );
    await client.inspections.list({
      equipment_id: EQUIPMENT_ID,
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      equipment_id: EQUIPMENT_ID,
      pretty: true,
      token: TOKEN,
    });

    await client.inspections.list({
      equipment_id: EQUIPMENT_ID,
      token: "attacker-supplied",
    } as unknown as { equipment_id: string });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(INSPECTIONS_BODY),
    );
    const controller = new AbortController();
    await client.inspections.list(
      { equipment_id: EQUIPMENT_ID },
      { signal: controller.signal },
    );
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(INSPECTIONS_BODY));
    const result = await client.inspections.list({
      equipment_id: EQUIPMENT_ID,
    });

    expect(result).toEqual(INSPECTIONS_BODY);
    expect(result.ok).toBe(true);
    expect(result.inspections).toEqual(INSPECTIONS_BODY.inspections);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.inspections
      .list({ equipment_id: EQUIPMENT_ID })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("inspections.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.inspections
      .list({ equipment_id: EQUIPMENT_ID })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("inspections.list");
    expect(err.message).toBe(
      "Novara Flex inspections.list: returned a non-JSON body",
    );
  });
});

describe("flex.inspections types", () => {
  const { client } = createClient(() => jsonResponse(INSPECTIONS_BODY));

  it("requires a string equipment_id", () => {
    void client.inspections.list({ equipment_id: EQUIPMENT_ID });
    void client.inspections.list({
      equipment_id: EQUIPMENT_ID,
      pretty: true,
    });
    // @ts-expect-error inspections.list requires an `equipment_id`
    void client.inspections.list();
    // @ts-expect-error inspections.list requires an `equipment_id`
    void client.inspections.list({ pretty: true });
    // @ts-expect-error `equipment_id` is a string id, not an integer
    void client.inspections.list({ equipment_id: 1 });
    // @ts-expect-error inspections.list filters by equipment, not equipment type
    void client.inspections.list({ equipmentType_id: EQUIPMENT_ID });
    // @ts-expect-error `bogus` is not a parameter of inspections.list
    void client.inspections.list({ equipment_id: EQUIPMENT_ID, bogus: 1 });
    void client.inspections.list({
      equipment_id: EQUIPMENT_ID,
      // @ts-expect-error the token is supplied by the client, not the caller
      token: "override",
    });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(
      client.inspections.list({ equipment_id: EQUIPMENT_ID }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"inspections.list">>();
    expectTypeOf(
      client.inspections.list({ equipment_id: EQUIPMENT_ID }),
    ).toEqualTypeOf(
      client.call("inspections.list", { equipment_id: EQUIPMENT_ID }),
    );
  });
});
