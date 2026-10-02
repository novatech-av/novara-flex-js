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

/** The equipment type every request in this file filters by. */
const TYPE_ID = "5804f0f80ef50473af587886";

/** A minimal `equipments.list` success body. */
const EQUIPMENTS_BODY = {
  ok: true,
  equipments: [
    {
      id: "e1",
      serialNumber: "SN-0001",
      equipmentType_id: TYPE_ID,
      created: 1_500_000_000,
      isInService: true,
      status: "uptodate",
      schedules: [{ schedule_id: "s1", status: "uptodate" }],
    },
  ],
};

describe("flex.equipments.list", () => {
  it("posts the equipment type to baseUrl/equipments.list with the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(EQUIPMENTS_BODY));
    await client.equipments.list({ equipmentType_id: TYPE_ID });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/equipments.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({
      equipmentType_id: TYPE_ID,
      token: TOKEN,
    });
  });

  it("forwards the filters and never lets params override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(EQUIPMENTS_BODY));
    await client.equipments.list({
      equipmentType_id: TYPE_ID,
      service_type: "all",
      columns: ["id", "serialNumber", "status"],
      include_null_metavalues: true,
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      equipmentType_id: TYPE_ID,
      service_type: "all",
      columns: ["id", "serialNumber", "status"],
      include_null_metavalues: true,
      pretty: true,
      token: TOKEN,
    });

    await client.equipments.list({
      equipmentType_id: TYPE_ID,
      token: "attacker-supplied",
    } as unknown as { equipmentType_id: string });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(EQUIPMENTS_BODY));
    const controller = new AbortController();
    await client.equipments.list(
      { equipmentType_id: TYPE_ID },
      { signal: controller.signal },
    );
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(EQUIPMENTS_BODY));
    const result = await client.equipments.list({ equipmentType_id: TYPE_ID });

    expect(result).toEqual(EQUIPMENTS_BODY);
    expect(result.ok).toBe(true);
    expect(result.equipments).toEqual(EQUIPMENTS_BODY.equipments);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.equipments
      .list({ equipmentType_id: TYPE_ID })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("equipments.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.equipments
      .list({ equipmentType_id: TYPE_ID })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("equipments.list");
    expect(err.message).toBe(
      "Novara Flex equipments.list: returned a non-JSON body",
    );
  });
});

describe("flex.equipments types", () => {
  const { client } = createClient(() => jsonResponse(EQUIPMENTS_BODY));

  it("requires equipmentType_id and constrains the optional filters", () => {
    void client.equipments.list({ equipmentType_id: TYPE_ID });
    void client.equipments.list({
      equipmentType_id: TYPE_ID,
      service_type: "in",
    });
    void client.equipments.list({
      equipmentType_id: TYPE_ID,
      service_type: "out",
      columns: ["id"],
      include_null_metavalues: false,
      pretty: true,
    });
    // @ts-expect-error equipments.list requires an `equipmentType_id`
    void client.equipments.list();
    // @ts-expect-error equipments.list requires an `equipmentType_id`
    void client.equipments.list({ service_type: "all" });
    void client.equipments.list({
      equipmentType_id: TYPE_ID,
      // @ts-expect-error `service_type` is one of "in" | "out" | "all"
      service_type: "sideways",
    });
    void client.equipments.list({
      equipmentType_id: TYPE_ID,
      // @ts-expect-error `columns` is an array of strings, not a string
      columns: "id",
    });
    // @ts-expect-error `bogus` is not a parameter of equipments.list
    void client.equipments.list({ equipmentType_id: TYPE_ID, bogus: 1 });
    void client.equipments.list({
      equipmentType_id: TYPE_ID,
      // @ts-expect-error the token is supplied by the client, not the caller
      token: "override",
    });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(
      client.equipments.list({ equipmentType_id: TYPE_ID }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"equipments.list">>();
    expectTypeOf(
      client.equipments.list({ equipmentType_id: TYPE_ID }),
    ).toEqualTypeOf(
      client.call("equipments.list", { equipmentType_id: TYPE_ID }),
    );
  });
});
