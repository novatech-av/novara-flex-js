import { describe, expect, expectTypeOf, it } from "vitest";
import type { NovaraFlexCsvPage, NovaraFlexResult } from "../client.js";
import { NovaraFlexApiError, NovaraFlexTransportError } from "../errors.js";
import type { NovaraFlexPaginator } from "../internal/paginate.js";
import {
  BASE_URL,
  bodyOf,
  type Capture,
  createClient,
  jsonResponse,
  TOKEN,
} from "../test-support/fake-fetch.js";

/** The form every request in this file asks about. */
const FORM_ID = 3987;

/** A minimal `responses.list` success body, paging metadata included. */
const RESPONSES_BODY = {
  ok: true,
  responses: [
    {
      id: 23_974,
      parent_response_id: null,
      pending_followup_assignees_id: ["u2"],
      created: 1_473_688_379_489,
      updated: 1_476_981_004_760,
    },
  ],
  paging: { total: 57, last_page: 57 },
};

/** A minimal `responses.info` success body. */
const RESPONSE_BODY = {
  ok: true,
  response: {
    id: 23_974,
    parent_response_id: null,
    created: "1473688379489",
    updated: "1476981004760",
    deleted: false,
    latest: { version: 3 },
  },
};

/**
 * A minimal `responses.flat` JSON success body.
 *
 * The first row is the field-ID to field-title mapping row the export puts in
 * front of the data rows unless `skip_field_id_mapping_json` is set; both rows
 * are keyed by the form's own field ids, so the keys vary per form.
 */
const FLAT_BODY = {
  ok: true,
  responses: [
    { f1: "Location", f2: "Temperature" },
    { f1: "North yard", f2: 21 },
  ],
  paging: { total: 57, last_page: 1 },
};

describe("flex.responses.list", () => {
  it("posts form_id to baseUrl/responses.list with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(RESPONSES_BODY));
    await client.responses.list({ form_id: FORM_ID });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/responses.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ form_id: FORM_ID, token: TOKEN });
  });

  it("forwards the filters and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(RESPONSES_BODY));
    await client.responses.list({
      form_id: FORM_ID,
      limit: 500,
      page: 2,
      observer_id: "u1",
      followups: "pending",
      before: 1_476_981_004_760,
      after: 1_473_688_379_489,
      updated_before: 1_476_981_004_760,
      updated_after: 1_473_688_379_489,
      latest: true,
      deleted: false,
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      form_id: FORM_ID,
      limit: 500,
      page: 2,
      observer_id: "u1",
      followups: "pending",
      before: 1_476_981_004_760,
      after: 1_473_688_379_489,
      updated_before: 1_476_981_004_760,
      updated_after: 1_473_688_379_489,
      latest: true,
      deleted: false,
      pretty: true,
      token: TOKEN,
    });

    await client.responses.list({
      form_id: FORM_ID,
      token: "attacker-supplied",
    } as unknown as { form_id: number });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(RESPONSES_BODY));
    const controller = new AbortController();
    await client.responses.list(
      { form_id: FORM_ID },
      { signal: controller.signal },
    );
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(RESPONSES_BODY));
    const result = await client.responses.list({ form_id: FORM_ID });

    expect(result).toEqual(RESPONSES_BODY);
    expect(result.ok).toBe(true);
    expect(result.responses).toEqual(RESPONSES_BODY.responses);
  });

  it("keeps the paging metadata reachable on the result", async () => {
    const { client } = createClient(() => jsonResponse(RESPONSES_BODY));
    const result = await client.responses.list({
      form_id: FORM_ID,
      limit: 1,
      page: 1,
    });

    expect(result.paging).toEqual({ total: 57, last_page: 57 });
    expect(result.paging.total).toBe(57);
    expect(result.paging.last_page).toBe(57);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.responses
      .list({ form_id: FORM_ID })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("responses.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.responses
      .list({ form_id: FORM_ID })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("responses.list");
    expect(err.message).toBe(
      "Novara Flex responses.list: returned a non-JSON body",
    );
  });
});

describe("flex.responses.info", () => {
  it("posts response_id to baseUrl/responses.info with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(RESPONSE_BODY));
    await client.responses.info({ response_id: 23_974 });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/responses.info`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ response_id: 23_974, token: TOKEN });
  });

  it("forwards pretty and an abort signal, and keeps the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(RESPONSE_BODY));
    const controller = new AbortController();
    await client.responses.info(
      { response_id: 23_974, pretty: true },
      { signal: controller.signal },
    );

    expect(bodyOf(calls[0])).toEqual({
      response_id: 23_974,
      pretty: true,
      token: TOKEN,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);

    await client.responses.info({
      response_id: 23_974,
      token: "attacker-supplied",
    } as unknown as { response_id: number });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("returns the whole success body, not an unwrapped response", async () => {
    const { client } = createClient(() => jsonResponse(RESPONSE_BODY));
    const result = await client.responses.info({ response_id: 23_974 });

    expect(result).toEqual(RESPONSE_BODY);
    expect(result.ok).toBe(true);
    expect(result.response).toEqual(RESPONSE_BODY.response);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "content_not_found" }),
    );
    const err = (await client.responses
      .info({ response_id: 404 })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("content_not_found");
    expect(err.method).toBe("responses.info");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.responses
      .info({ response_id: 23_974 })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("responses.info");
    expect(err.message).toBe(
      "Novara Flex responses.info: returned a non-JSON body",
    );
  });
});

describe("flex.responses.flat", () => {
  it("posts form_id to baseUrl/responses.flat with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(FLAT_BODY));
    await client.responses.flat({ form_id: FORM_ID });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/responses.flat`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ form_id: FORM_ID, token: TOKEN });
  });

  it("forwards every parameter it keeps, token last", async () => {
    const { client, calls } = createClient(() => jsonResponse(FLAT_BODY));
    await client.responses.flat({
      form_id: FORM_ID,
      limit: 1000,
      page: 2,
      observer_id: "u1",
      before: 1_476_981_004_760,
      after: 1_473_688_379_489,
      updated_before: 1_476_981_004_760,
      updated_after: 1_473_688_379_489,
      format: "json",
      columns: ["f1", "f2"],
      response_ids: [1_023_833, 1_103_837],
      deleted: false,
      // CSV-only, so it has no effect here; the contract documents it, so it
      // stays accepted rather than being silently dropped by the wrapper.
      skip_field_id_mapping: true,
      skip_field_id_mapping_json: true,
      force_date_format: true,
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      form_id: FORM_ID,
      limit: 1000,
      page: 2,
      observer_id: "u1",
      before: 1_476_981_004_760,
      after: 1_473_688_379_489,
      updated_before: 1_476_981_004_760,
      updated_after: 1_473_688_379_489,
      format: "json",
      columns: ["f1", "f2"],
      response_ids: [1_023_833, 1_103_837],
      deleted: false,
      skip_field_id_mapping: true,
      skip_field_id_mapping_json: true,
      force_date_format: true,
      pretty: true,
      token: TOKEN,
    });

    await client.responses.flat({
      form_id: FORM_ID,
      token: "attacker-supplied",
    } as unknown as { form_id: number });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(FLAT_BODY));
    const controller = new AbortController();
    await client.responses.flat(
      { form_id: FORM_ID },
      { signal: controller.signal },
    );
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, mapping row and paging included", async () => {
    const { client } = createClient(() => jsonResponse(FLAT_BODY));
    const result = await client.responses.flat({ form_id: FORM_ID });

    expect(result).toEqual(FLAT_BODY);
    expect(result.ok).toBe(true);
    expect(result.responses).toHaveLength(2);
    expect(result.paging.total).toBe(57);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.responses
      .flat({ form_id: FORM_ID })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("responses.flat");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.responses
      .flat({ form_id: FORM_ID })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("responses.flat");
    expect(err.message).toBe(
      "Novara Flex responses.flat: returned a non-JSON body",
    );
  });

  it("surfaces a CSV body from the escape hatch as a transport failure", async () => {
    // The wrapper's type narrowing keeps `format: "csv"` out of
    // `flex.responses.flat`, but `call` is still typed by the contract, so a
    // caller can reach the CSV variant through it. `call` parses every body as
    // JSON, so the CSV document arrives as a transport failure. This pins that
    // `call` stays JSON-only; `flex.responses.flatCsv` is the CSV route.
    const { client } = createClient(
      () =>
        new Response("f1,f2\nNorth yard,21\n", {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "novaraflex-total-results": "57",
            "novaraflex-last-page": "1",
          },
        }),
    );
    const err = (await client
      .call("responses.flat", { form_id: FORM_ID, format: "csv" })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("responses.flat");
    expect(err.message).toBe(
      "Novara Flex responses.flat: returned a non-JSON body",
    );
    expect(err.status).toBe(200);
    expect(err.cause).toBeInstanceOf(Error);
  });
});

describe("flex.responses types", () => {
  const { client } = createClient(() => jsonResponse(RESPONSES_BODY));

  it("requires form_id and response_id and constrains the enums", () => {
    void client.responses.list({ form_id: FORM_ID });
    void client.responses.list({ form_id: FORM_ID, followups: "all" });
    void client.responses.list({ form_id: FORM_ID, followups: "pending" });
    void client.responses.info({ response_id: 23_974 });
    // @ts-expect-error responses.list requires a `form_id`
    void client.responses.list();
    // @ts-expect-error responses.list requires a `form_id`
    void client.responses.list({ limit: 1 });
    // @ts-expect-error `form_id` is an integer, not a string
    void client.responses.list({ form_id: "3987" });
    void client.responses.list({
      form_id: FORM_ID,
      // @ts-expect-error `followups` is one of "all" | "pending"
      followups: "open",
    });
    // @ts-expect-error responses.info requires a `response_id`
    void client.responses.info();
    // @ts-expect-error responses.info takes the vendor's `response_id`, not `id`
    void client.responses.info({ id: 23_974 });
    // @ts-expect-error `response_id` is an integer, not a string
    void client.responses.info({ response_id: "23974" });
    // @ts-expect-error `bogus` is not a parameter of responses.list
    void client.responses.list({ form_id: FORM_ID, bogus: 1 });
    void client.responses.list({
      form_id: FORM_ID,
      // @ts-expect-error the token is supplied by the client, not the caller
      token: "override",
    });
  });

  it("narrows responses.flat to the JSON format", () => {
    void client.responses.flat({ form_id: FORM_ID });
    void client.responses.flat({ form_id: FORM_ID, format: "json" });
    void client.responses.flat({
      form_id: FORM_ID,
      format: "json",
      limit: 1000,
      columns: ["f1"],
      response_ids: [1],
      skip_field_id_mapping: true,
      skip_field_id_mapping_json: true,
      force_date_format: true,
    });
    // @ts-expect-error `format` is narrowed to "json"; `responses.flatCsv` is the CSV route
    void client.responses.flat({ form_id: FORM_ID, format: "csv" });
    // @ts-expect-error responses.flat requires a `form_id`
    void client.responses.flat();
    // @ts-expect-error responses.flat requires a `form_id`
    void client.responses.flat({});
    // @ts-expect-error `bogus` is not a parameter of responses.flat
    void client.responses.flat({ form_id: FORM_ID, bogus: 1 });

    // The escape hatch keeps the contract's own union, CSV included.
    void client.call("responses.flat", { form_id: FORM_ID, format: "csv" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(
      client.responses.list({ form_id: FORM_ID }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"responses.list">>();
    expectTypeOf(
      client.responses.info({ response_id: 23_974 }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"responses.info">>();
    expectTypeOf(
      client.responses.flat({ form_id: FORM_ID }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"responses.flat">>();
    expectTypeOf(client.responses.list({ form_id: FORM_ID })).toEqualTypeOf(
      client.call("responses.list", { form_id: FORM_ID }),
    );
    expectTypeOf(client.responses.info({ response_id: 23_974 })).toEqualTypeOf(
      client.call("responses.info", { response_id: 23_974 }),
    );
    expectTypeOf(client.responses.flat({ form_id: FORM_ID })).toEqualTypeOf(
      client.call("responses.flat", { form_id: FORM_ID }),
    );
  });
});

describe("flex.responses.listAll", () => {
  it("walks responses.list with the maximum limit by default", async () => {
    const { client, calls } = createClient((capture) =>
      jsonResponse({
        ok: true,
        responses: bodyOf(capture).page === 1 ? [{ id: 1 }] : [{ id: 2 }],
        paging: { total: 2, last_page: 2 },
      }),
    );
    const items: unknown[] = [];
    for await (const item of client.responses.listAll({ form_id: FORM_ID }))
      items.push(item);

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE_URL}/responses.list`,
      `${BASE_URL}/responses.list`,
    ]);
    expect(bodyOf(calls[0])).toEqual({
      ...{ form_id: FORM_ID },
      limit: 500,
      page: 1,
      token: TOKEN,
    });
    expect(bodyOf(calls[1])).toEqual({
      ...{ form_id: FORM_ID },
      limit: 500,
      page: 2,
      token: TOKEN,
    });
  });

  it("rejects an invalid option on its first iteration, naming NovaraFlexCallOptions rather than call, before sending anything", async () => {
    const { client, calls } = createClient(() => jsonResponse(RESPONSES_BODY));
    const pages = client.responses.listAll(
      { form_id: FORM_ID },
      { timeoutMs: Number.NaN },
    );
    const err = await (async () => {
      for await (const _ of pages) {
        // Never reached: the first page is rejected before it is sent.
      }
    })().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect((err as Error).message).toMatch(
      /^NovaraFlexCallOptions\.timeoutMs must be a positive number/,
    );
    expect((err as Error).message).not.toContain("NovaraFlexClient.call");
    expect(calls).toHaveLength(0);
  });

  it("yields the contract's item type and takes the wrapper's arguments", () => {
    const { client } = createClient(() => jsonResponse({}));
    expectTypeOf(client.responses.listAll({ form_id: FORM_ID })).toEqualTypeOf<
      NovaraFlexPaginator<
        NonNullable<NovaraFlexResult<"responses.list">["responses"]>[number],
        NovaraFlexResult<"responses.list">
      >
    >();
    // @ts-expect-error responses.list requires a `form_id`
    void client.responses.listAll();
    // @ts-expect-error responses.list requires a `form_id`
    void client.responses.listAll({ limit: 1 });
  });
});

describe("flex.responses.flatAll", () => {
  /** Each page leads with its own mapping row unless it is skipped. */
  const flatResponder = (capture: Capture): Response => {
    const body = bodyOf(capture);
    const page = body.page as number;
    const data = [{ f1: page }];
    return jsonResponse({
      ok: true,
      responses:
        body.skip_field_id_mapping_json === true
          ? data
          : [{ f1: "Title 1", [`p${page}`]: `Page ${page}` }, ...data],
      paging: { total: 2, last_page: 2 },
    });
  };

  it("walks responses.flat with the maximum limit by default, yielding response rows only", async () => {
    const { client, calls } = createClient(flatResponder);
    const items: unknown[] = [];
    for await (const item of client.responses.flatAll({ form_id: FORM_ID }))
      items.push(item);

    expect(items).toEqual([{ f1: 1 }, { f1: 2 }]);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE_URL}/responses.flat`,
      `${BASE_URL}/responses.flat`,
    ]);
    expect(bodyOf(calls[0])).toEqual({
      form_id: FORM_ID,
      limit: 1000,
      page: 1,
      token: TOKEN,
    });
    expect(bodyOf(calls[1])).toEqual({
      form_id: FORM_ID,
      limit: 1000,
      page: 2,
      token: TOKEN,
    });
  });

  it("keeps every page's mapping row at responses[0] in pages()", async () => {
    const { client } = createClient(flatResponder);
    const rows: unknown[][] = [];
    for await (const page of client.responses
      .flatAll({ form_id: FORM_ID })
      .pages())
      rows.push(page.responses);

    expect(rows).toEqual([
      [{ f1: "Title 1", p1: "Page 1" }, { f1: 1 }],
      [{ f1: "Title 1", p2: "Page 2" }, { f1: 2 }],
    ]);
  });

  it("strips nothing when skip_field_id_mapping_json is true", async () => {
    const { client } = createClient(flatResponder);
    const items: unknown[] = [];
    for await (const item of client.responses.flatAll({
      form_id: FORM_ID,
      skip_field_id_mapping_json: true,
    }))
      items.push(item);

    expect(items).toEqual([{ f1: 1 }, { f1: 2 }]);
  });

  it("yields the contract's item type and takes the wrapper's arguments", () => {
    const { client } = createClient(() => jsonResponse({}));
    expectTypeOf(client.responses.flatAll({ form_id: FORM_ID })).toEqualTypeOf<
      NovaraFlexPaginator<
        NonNullable<NovaraFlexResult<"responses.flat">["responses"]>[number],
        NovaraFlexResult<"responses.flat">
      >
    >();
    // @ts-expect-error responses.flat requires a `form_id`
    void client.responses.flatAll();
    // @ts-expect-error responses.flat requires a `form_id`
    void client.responses.flatAll({ limit: 1 });
    // @ts-expect-error `format` is narrowed to "json"; `responses.flatCsv` is the CSV route
    void client.responses.flatAll({ form_id: FORM_ID, format: "csv" });
  });
});

/** A CSV page the way `responses.flat` serves one, headers optional. */
function csvResponse(
  headers: Record<string, string> = {
    "novaraflex-total-results": "57",
    "novaraflex-last-page": "6",
  },
  contentType = "text/csv; charset=utf-8",
): Response {
  return new Response("f1,f2\nNorth yard,21\n", {
    status: 200,
    headers: { "content-type": contentType, ...headers },
  });
}

describe("flex.responses.flatCsv", () => {
  it("posts responses.flat with format csv, token last, and manual redirects", async () => {
    const { client, calls } = createClient(() => csvResponse());
    await client.responses.flatCsv({
      form_id: FORM_ID,
      limit: 10,
      page: 2,
      skip_field_id_mapping: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/responses.flat`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.redirect).toBe("manual");
    expect(calls[0]?.init?.headers).toMatchObject({
      "content-type": "application/json",
      accept: "text/csv, application/json",
    });
    expect(bodyOf(calls[0])).toEqual({
      form_id: FORM_ID,
      limit: 10,
      page: 2,
      skip_field_id_mapping: true,
      format: "csv",
      token: TOKEN,
    });
    expect(Object.keys(bodyOf(calls[0])).slice(-2)).toEqual([
      "format",
      "token",
    ]);
  });

  it("always sends format csv, even if a caller forces format through", async () => {
    const { client, calls } = createClient(() => csvResponse());
    await client.responses.flatCsv({
      form_id: FORM_ID,
      format: "json",
    } as unknown as { form_id: number });
    expect(bodyOf(calls[0]).format).toBe("csv");
  });

  it("rejects an invalid option, naming NovaraFlexCallOptions rather than call, before sending anything", async () => {
    const { client, calls } = createClient(() => csvResponse());
    const err = await client.responses
      .flatCsv({ form_id: FORM_ID }, { retry: { maxRetries: -1 } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect((err as Error).message).toMatch(
      /^NovaraFlexCallOptions\.retry\.maxRetries must be an integer/,
    );
    expect((err as Error).message).not.toContain("NovaraFlexClient.call");
    expect(calls).toHaveLength(0);
  });

  it("resolves the document and its paging headers", async () => {
    const { client } = createClient(() => csvResponse());
    const page = await client.responses.flatCsv({ form_id: FORM_ID });
    expect(page).toEqual({
      csv: "f1,f2\nNorth yard,21\n",
      paging: { total: 57, last_page: 6 },
    });
  });

  it("matches the media type case-insensitively and ignores parameters", async () => {
    const { client } = createClient(() =>
      csvResponse(undefined, "Text/CSV ; charset=UTF-8"),
    );
    const page = await client.responses.flatCsv({ form_id: FORM_ID });
    expect(page.csv).toBe("f1,f2\nNorth yard,21\n");
  });

  const noPaging: ReadonlyArray<[string, Record<string, string>]> = [
    ["both headers are absent", {}],
    ["the total is absent", { "novaraflex-last-page": "6" }],
    ["the last page is absent", { "novaraflex-total-results": "57" }],
    [
      "the total is not an integer",
      { "novaraflex-total-results": "57.5", "novaraflex-last-page": "6" },
    ],
    [
      "the last page is negative",
      { "novaraflex-total-results": "57", "novaraflex-last-page": "-1" },
    ],
    [
      "the total is not a number",
      { "novaraflex-total-results": "many", "novaraflex-last-page": "6" },
    ],
    [
      "only the spec's old kpaehs- names are sent",
      { "kpaehs-total-results": "57", "kpaehs-last-page": "6" },
    ],
  ];

  for (const [label, headers] of noPaging) {
    it(`leaves paging out when ${label}`, async () => {
      const { client } = createClient(() => csvResponse(headers));
      const page = await client.responses.flatCsv({ form_id: FORM_ID });
      expect(page.csv).toBe("f1,f2\nNorth yard,21\n");
      expect(page.paging).toBeUndefined();
      expect("paging" in page).toBe(false);
    });
  }

  it("throws a JSON error envelope as a NovaraFlexApiError for the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "parameter_missing" }),
    );
    const err = (await client.responses
      .flatCsv({ form_id: FORM_ID })
      .catch((e: unknown) => e)) as NovaraFlexApiError;
    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("parameter_missing");
    expect(err.method).toBe("responses.flat");
  });

  const wrongTypes: ReadonlyArray<[string, () => Response, string]> = [
    [
      "a JSON success envelope",
      () => jsonResponse({ ok: true, responses: [] }),
      "a JSON success envelope",
    ],
    [
      "an HTML page",
      () =>
        new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        }),
      "text/html",
    ],
    [
      "no content type",
      () => new Response(new Uint8Array([0x61])),
      "missing a content type",
    ],
    [
      "plain text",
      () =>
        new Response("f1,f2\n", { headers: { "content-type": "text/plain" } }),
      "text/plain",
    ],
  ];

  for (const [label, respond, seen] of wrongTypes) {
    it(`rejects ${label} with reason content_type`, async () => {
      const { client } = createClient(respond);
      const err = (await client.responses
        .flatCsv({ form_id: FORM_ID })
        .catch((e: unknown) => e)) as NovaraFlexTransportError;
      expect(err).toBeInstanceOf(NovaraFlexTransportError);
      expect(err.reason).toBe("content_type");
      expect(err.method).toBe("responses.flat");
      expect(err.status).toBe(200);
      expect(err.message).toBe(
        `Novara Flex responses.flat: expected a CSV document but the response was ${seen}`,
      );
      expect(err.message.includes(TOKEN)).toBe(false);
    });
  }

  it("follows a redirect with a body-less GET and reads the CSV behind it", async () => {
    const { client, calls } = createClient(({ init }) =>
      init?.method === "POST"
        ? new Response(null, {
            status: 307,
            headers: { location: "https://files.example.test/export.csv" },
          })
        : csvResponse(),
    );
    const page = await client.responses.flatCsv({ form_id: FORM_ID });
    expect(page.paging).toEqual({ total: 57, last_page: 6 });
    expect(calls[1]?.init?.method).toBe("GET");
    expect(calls[1]?.init?.body).toBeUndefined();
    expect(calls[1]?.init?.headers).toBeUndefined();
  });
});

describe("flex.responses.flatCsv types", () => {
  const { client } = createClient(() => csvResponse());

  it("requires form_id, rejects format, and resolves to a NovaraFlexCsvPage", () => {
    expectTypeOf(client.responses.flatCsv({ form_id: FORM_ID })).toEqualTypeOf<
      Promise<NovaraFlexCsvPage>
    >();
    expectTypeOf<NovaraFlexCsvPage>().toEqualTypeOf<{
      csv: string;
      paging?: { total: number; last_page: number };
    }>();
    void client.responses.flatCsv({
      form_id: FORM_ID,
      limit: 1000,
      page: 2,
      skip_field_id_mapping: true,
      columns: ["f1"],
    });
    void client.responses.flatCsv({ form_id: FORM_ID }, { timeoutMs: 1_000 });
    // @ts-expect-error flatCsv sends `format: "csv"` itself
    void client.responses.flatCsv({ form_id: FORM_ID, format: "csv" });
    // @ts-expect-error flatCsv sends `format: "csv"` itself
    void client.responses.flatCsv({ form_id: FORM_ID, format: "json" });
    // @ts-expect-error responses.flat requires a `form_id`
    void client.responses.flatCsv({});
    // @ts-expect-error responses.flat requires a `form_id`
    void client.responses.flatCsv();
  });
});
