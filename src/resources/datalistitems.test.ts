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

/** The data list every request in this file asks about. */
const DATA_LIST_ID = 324;

/** A minimal `datalistitems.list` success body. */
const DATALISTITEMS_BODY = {
  ok: true,
  datalistitems: [
    {
      id: 9001,
      created: 1_473_688_379_489,
      updated: 1_476_981_004_760,
      data_list_id: DATA_LIST_ID,
      title: "Concrete",
      code: "C-100",
      description: "",
      sequence: 1,
      // An undocumented key: nothing is stripped, so it survives the call.
      deleted: false,
    },
  ],
};

describe("flex.datalistitems.list", () => {
  it("posts data_list_id to baseUrl/datalistitems.list with the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(DATALISTITEMS_BODY),
    );
    await client.datalistitems.list({ data_list_id: DATA_LIST_ID });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/datalistitems.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({
      data_list_id: DATA_LIST_ID,
      token: TOKEN,
    });
  });

  it("forwards the flags and never lets params override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(DATALISTITEMS_BODY),
    );
    await client.datalistitems.list({
      data_list_id: DATA_LIST_ID,
      include_deleted: true,
      include_inactive: true,
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      data_list_id: DATA_LIST_ID,
      include_deleted: true,
      include_inactive: true,
      pretty: true,
      token: TOKEN,
    });

    await client.datalistitems.list({
      data_list_id: DATA_LIST_ID,
      token: "attacker-supplied",
    } as unknown as { data_list_id: number });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(DATALISTITEMS_BODY),
    );
    const controller = new AbortController();
    await client.datalistitems.list(
      { data_list_id: DATA_LIST_ID },
      { signal: controller.signal },
    );
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(DATALISTITEMS_BODY));
    const result = await client.datalistitems.list({
      data_list_id: DATA_LIST_ID,
    });

    expect(result).toEqual(DATALISTITEMS_BODY);
    expect(result.ok).toBe(true);
    expect(result.datalistitems).toEqual(DATALISTITEMS_BODY.datalistitems);
    // The undocumented `deleted` flag survives, because nothing is stripped.
    expect(result.datalistitems[0]?.deleted).toBe(false);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "parameter_invalid" }),
    );
    const err = (await client.datalistitems
      .list({ data_list_id: DATA_LIST_ID })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("parameter_invalid");
    expect(err.method).toBe("datalistitems.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.datalistitems
      .list({ data_list_id: DATA_LIST_ID })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("datalistitems.list");
    expect(err.message).toBe(
      "Novara Flex datalistitems.list: returned a non-JSON body",
    );
  });
});

describe("flex.datalistitems types", () => {
  const { client } = createClient(() => jsonResponse(DATALISTITEMS_BODY));

  it("requires data_list_id and constrains the optional flags", () => {
    void client.datalistitems.list({ data_list_id: DATA_LIST_ID });
    void client.datalistitems.list({
      data_list_id: DATA_LIST_ID,
      include_deleted: false,
      include_inactive: true,
      pretty: true,
    });
    // @ts-expect-error datalistitems.list requires a `data_list_id`
    void client.datalistitems.list();
    // @ts-expect-error datalistitems.list requires a `data_list_id`
    void client.datalistitems.list({});
    // @ts-expect-error `data_list_id` is an integer, not a string
    void client.datalistitems.list({ data_list_id: "1" });
    void client.datalistitems.list({
      data_list_id: DATA_LIST_ID,
      // @ts-expect-error `include_deleted` is a boolean, not a string
      include_deleted: "yes",
    });
    // @ts-expect-error `bogus` is not a parameter of datalistitems.list
    void client.datalistitems.list({ data_list_id: DATA_LIST_ID, bogus: 1 });
    void client.datalistitems.list({
      data_list_id: DATA_LIST_ID,
      // @ts-expect-error the token is supplied by the client, not the caller
      token: "override",
    });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(
      client.datalistitems.list({ data_list_id: DATA_LIST_ID }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"datalistitems.list">>();
    expectTypeOf(
      client.datalistitems.list({ data_list_id: DATA_LIST_ID }),
    ).toEqualTypeOf(
      client.call("datalistitems.list", { data_list_id: DATA_LIST_ID }),
    );
  });
});
