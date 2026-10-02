import { describe, expect, expectTypeOf, it } from "vitest";
import type { NovaraFlexCsvPage, NovaraFlexResult } from "../client.js";
import { NovaraFlexApiError, NovaraFlexTransportError } from "../errors.js";
import type { NovaraFlexPaginator } from "../internal/paginate.js";
import {
  BASE_URL,
  bodyOf,
  createClient,
  jsonResponse,
  TOKEN,
} from "../test-support/fake-fetch.js";

/**
 * A minimal `osha-hours.list` JSON success body, paging included.
 *
 * The vendor publishes no JSON example for this method; the `hours` array and
 * its keys come from the live API, which is also what the contract now models.
 */
const OSHA_HOURS_BODY = {
  ok: true,
  hours: [
    {
      id: 991,
      establishment_id: 324,
      year: 2026,
      month: 9,
      hours: 1840,
      client_id: null,
      fo_id: null,
      lob_id: null,
    },
  ],
  paging: { total: 57, last_page: 1 },
};

describe("flex.oshaHours.list", () => {
  it("posts to the vendor's hyphenated osha-hours.list path", async () => {
    const { client, calls } = createClient(() => jsonResponse(OSHA_HOURS_BODY));
    await client.oshaHours.list();

    expect(calls).toHaveLength(1);
    // The property is camelCased; the method name on the wire keeps the hyphen.
    expect(calls[0]?.url).toBe(`${BASE_URL}/osha-hours.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards every parameter it keeps, token last", async () => {
    const { client, calls } = createClient(() => jsonResponse(OSHA_HOURS_BODY));
    await client.oshaHours.list({
      establishment_ids: [324, 325],
      year: 2026,
      months: [9, 10],
      limit: 1000,
      page: 2,
      format: "json",
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      establishment_ids: [324, 325],
      year: 2026,
      months: [9, 10],
      limit: 1000,
      page: 2,
      format: "json",
      pretty: true,
      token: TOKEN,
    });

    await client.oshaHours.list({
      token: "attacker-supplied",
    } as unknown as { year?: number });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(OSHA_HOURS_BODY));
    const controller = new AbortController();
    await client.oshaHours.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body with the paging metadata reachable", async () => {
    const { client } = createClient(() => jsonResponse(OSHA_HOURS_BODY));
    const result = await client.oshaHours.list({ limit: 10 });

    expect(result).toEqual(OSHA_HOURS_BODY);
    expect(result.ok).toBe(true);
    expect(result.hours).toEqual(OSHA_HOURS_BODY.hours);
    // Nothing is stripped, so a caller can walk the pages itself.
    expect(result.paging).toEqual({ total: 57, last_page: 1 });
    expect(result.paging.last_page).toBe(1);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.oshaHours
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("osha-hours.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.oshaHours
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("osha-hours.list");
    expect(err.message).toBe(
      "Novara Flex osha-hours.list: returned a non-JSON body",
    );
  });

  it("surfaces a CSV body from the escape hatch as a transport failure", async () => {
    // The wrapper's type narrowing keeps `format: "csv"` out of
    // `flex.oshaHours.list`, but `call` is still typed by the contract, so a
    // caller can reach the CSV variant through it. `call` parses every body as
    // JSON, so the CSV document arrives as a transport failure. This pins that
    // `call` stays JSON-only; `flex.oshaHours.listCsv` is the CSV route.
    const { client } = createClient(
      () =>
        new Response(
          "id,establishment_id,year,month,hours\n991,324,2026,9,1840\n",
          {
            status: 200,
            headers: { "content-type": "text/csv; charset=utf-8" },
          },
        ),
    );
    const err = (await client
      .call("osha-hours.list", { format: "csv" })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("osha-hours.list");
    expect(err.message).toBe(
      "Novara Flex osha-hours.list: returned a non-JSON body",
    );
    expect(err.status).toBe(200);
    expect(err.cause).toBeInstanceOf(Error);
  });
});

describe("flex.oshaHours types", () => {
  const { client } = createClient(() => jsonResponse(OSHA_HOURS_BODY));

  it("narrows osha-hours.list to the JSON format", () => {
    void client.oshaHours.list();
    void client.oshaHours.list({ format: "json" });
    void client.oshaHours.list({
      establishment_ids: [324],
      year: 2026,
      months: [1, 12],
      limit: 1000,
      page: 1,
      format: "json",
      pretty: true,
    });
    // @ts-expect-error `format` is narrowed to "json"; `oshaHours.listCsv` is the CSV route
    void client.oshaHours.list({ format: "csv" });
    // @ts-expect-error `format` is one of the contract's enum values, narrowed here to "json"
    void client.oshaHours.list({ format: "xml" });

    // The escape hatch keeps the contract's own union, CSV included.
    void client.call("osha-hours.list", { format: "csv" });
    void client.call("osha-hours.list", { format: "json" });
  });

  it("makes every parameter optional and constrains their types", () => {
    void client.oshaHours.list(undefined, { signal: AbortSignal.abort() });
    // @ts-expect-error `establishment_ids` holds integers, not strings
    void client.oshaHours.list({ establishment_ids: ["324"] });
    // @ts-expect-error `months` holds integers, not strings
    void client.oshaHours.list({ months: ["9"] });
    // @ts-expect-error `year` is an integer, not a string
    void client.oshaHours.list({ year: "2026" });
    // @ts-expect-error `bogus` is not a parameter of osha-hours.list
    void client.oshaHours.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.oshaHours.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.oshaHours.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"osha-hours.list">
    >();
    expectTypeOf(client.oshaHours.list()).toEqualTypeOf(
      client.call("osha-hours.list"),
    );
  });
});

describe("flex.oshaHours.listAll", () => {
  it("walks osha-hours.list (the vendor's name, not the SDK's) with the maximum limit by default", async () => {
    const { client, calls } = createClient((capture) =>
      jsonResponse({
        ok: true,
        hours: bodyOf(capture).page === 1 ? [{ id: 1 }] : [{ id: 2 }],
        paging: { total: 2, last_page: 2 },
      }),
    );
    const items: unknown[] = [];
    for await (const item of client.oshaHours.listAll({ year: 2026 }))
      items.push(item);

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE_URL}/osha-hours.list`,
      `${BASE_URL}/osha-hours.list`,
    ]);
    expect(bodyOf(calls[0])).toEqual({
      ...{ year: 2026 },
      limit: 1000,
      page: 1,
      token: TOKEN,
    });
    expect(bodyOf(calls[1])).toEqual({
      ...{ year: 2026 },
      limit: 1000,
      page: 2,
      token: TOKEN,
    });
  });

  it("yields the contract's item type and takes the wrapper's arguments", () => {
    const { client } = createClient(() => jsonResponse({}));
    expectTypeOf(client.oshaHours.listAll({ year: 2026 })).toEqualTypeOf<
      NovaraFlexPaginator<
        NonNullable<NovaraFlexResult<"osha-hours.list">["hours"]>[number],
        NovaraFlexResult<"osha-hours.list">
      >
    >();
    void client.oshaHours.listAll();
    void client.oshaHours.listAll(undefined, { timeoutMs: 1_000 });
    // @ts-expect-error `format` is narrowed to "json"; `oshaHours.listCsv` is the CSV route
    void client.oshaHours.listAll({ format: "csv" });
  });
});

/** A CSV page the way `osha-hours.list` serves one, headers optional. */
function csvResponse(
  headers: Record<string, string> = {
    "novaraflex-total-results": "57",
    "novaraflex-last-page": "57",
  },
): Response {
  return new Response(
    "id,establishment_id,year,month,hours\n991,324,2026,9,1840\n",
    {
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8", ...headers },
    },
  );
}

describe("flex.oshaHours.listCsv", () => {
  it("needs no parameters and sends format csv, token last", async () => {
    const { client, calls } = createClient(() => csvResponse());
    await client.oshaHours.listCsv();

    expect(calls[0]?.url).toBe(`${BASE_URL}/osha-hours.list`);
    expect(calls[0]?.init?.redirect).toBe("manual");
    expect(bodyOf(calls[0])).toEqual({ format: "csv", token: TOKEN });
  });

  it("forwards its parameters and always sends format csv", async () => {
    const { client, calls } = createClient(() => csvResponse());
    await client.oshaHours.listCsv({
      year: 2026,
      limit: 1,
      format: "json",
    } as unknown as { year: number; limit: number });
    expect(bodyOf(calls[0])).toEqual({
      year: 2026,
      limit: 1,
      format: "csv",
      token: TOKEN,
    });
  });

  it("rejects an invalid option, naming NovaraFlexCallOptions rather than call, before sending anything", async () => {
    const { client, calls } = createClient(() => csvResponse());
    const err = await client.oshaHours
      .listCsv(undefined, {
        retry: { idempotent: "yes" as unknown as boolean },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect((err as Error).message).toBe(
      "NovaraFlexCallOptions.retry.idempotent must be a boolean",
    );
    expect((err as Error).message).not.toContain("NovaraFlexClient.call");
    expect(calls).toHaveLength(0);
  });

  it("resolves the document and the novaraflex- paging headers", async () => {
    const { client } = createClient(() => csvResponse());
    expect(await client.oshaHours.listCsv({ limit: 1 })).toEqual({
      csv: "id,establishment_id,year,month,hours\n991,324,2026,9,1840\n",
      paging: { total: 57, last_page: 57 },
    });
  });

  it("leaves paging out when the headers are absent or malformed", async () => {
    for (const headers of [
      {},
      // The names the vendor documents for this method, which the live API
      // does not send.
      { "kpaehs-total-results": "57", "kpaehs-last-page": "57" },
      { "novaraflex-total-results": "", "novaraflex-last-page": "57" },
    ]) {
      const { client } = createClient(() => csvResponse(headers));
      const page = await client.oshaHours.listCsv();
      expect("paging" in page).toBe(false);
    }
  });

  it("throws an error envelope as a NovaraFlexApiError and a JSON success as content_type", async () => {
    const failing = createClient(() =>
      jsonResponse({ ok: false, error: "parameter_invalid" }),
    );
    const apiError = (await failing.client.oshaHours
      .listCsv()
      .catch((e: unknown) => e)) as NovaraFlexApiError;
    expect(apiError).toBeInstanceOf(NovaraFlexApiError);
    expect(apiError.method).toBe("osha-hours.list");

    const json = createClient(() => jsonResponse(OSHA_HOURS_BODY));
    const transport = (await json.client.oshaHours
      .listCsv()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;
    expect(transport).toBeInstanceOf(NovaraFlexTransportError);
    expect(transport.reason).toBe("content_type");
    expect(transport.method).toBe("osha-hours.list");
  });
});

describe("flex.oshaHours.listCsv types", () => {
  const { client } = createClient(() => csvResponse());

  it("makes every parameter optional, rejects format, and resolves to a NovaraFlexCsvPage", () => {
    expectTypeOf(client.oshaHours.listCsv()).toEqualTypeOf<
      Promise<NovaraFlexCsvPage>
    >();
    void client.oshaHours.listCsv({ establishment_ids: [324], months: [1] });
    void client.oshaHours.listCsv(undefined, { timeoutMs: 1_000 });
    // @ts-expect-error listCsv sends `format: "csv"` itself
    void client.oshaHours.listCsv({ format: "csv" });
    // @ts-expect-error `year` is an integer, not a string
    void client.oshaHours.listCsv({ year: "2026" });
  });
});
