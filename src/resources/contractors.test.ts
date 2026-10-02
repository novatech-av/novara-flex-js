import { describe, expect, expectTypeOf, it } from "vitest";
import type { NovaraFlexResult } from "../client.js";
import { NovaraFlexApiError, NovaraFlexTransportError } from "../errors.js";
import type { NovaraFlexPaginator } from "../internal/paginate.js";
import {
  BASE_URL,
  bodyOf,
  createClient,
  jsonResponse,
  TOKEN,
} from "../test-support/fake-fetch.js";

/** A minimal `contractors.list` success body, paging metadata included. */
const CONTRACTORS_BODY = {
  ok: true,
  contractors: [
    {
      id: "D2EEA9E5-3E10-44BC-92EC-50B587B83019",
      name: "Example Contractor",
      city: "Exampleton",
      state: "TX",
      approval_status: "approved",
      contractor_compliance_score: 98.5,
      employee_compliance_score: 100,
      auto_approve: false,
    },
  ],
  paging: { total: 42, last_page: 42 },
};

describe("flex.contractors.list", () => {
  it("posts to baseUrl/contractors.list with the injected token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(CONTRACTORS_BODY),
    );
    await client.contractors.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/contractors.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards the paging params and never lets them override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(CONTRACTORS_BODY),
    );
    await client.contractors.list({
      limit: 1000,
      page: 2,
      status: "approved",
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      limit: 1000,
      page: 2,
      status: "approved",
      pretty: true,
      token: TOKEN,
    });

    await client.contractors.list({ token: "attacker-supplied" } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(CONTRACTORS_BODY),
    );
    const controller = new AbortController();
    await client.contractors.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(CONTRACTORS_BODY));
    const result = await client.contractors.list();

    expect(result).toEqual(CONTRACTORS_BODY);
    expect(result.ok).toBe(true);
    expect(result.contractors).toEqual(CONTRACTORS_BODY.contractors);
  });

  it("keeps the paging metadata reachable on the result", async () => {
    const { client } = createClient(() => jsonResponse(CONTRACTORS_BODY));
    const result = await client.contractors.list({ limit: 1, page: 1 });

    // Nothing is stripped, so a caller can walk the pages itself; listAll
    // does it for them.
    expect(result.paging).toEqual({ total: 42, last_page: 42 });
    expect(result.paging.total).toBe(42);
    expect(result.paging.last_page).toBe(42);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.contractors
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("contractors.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.contractors
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("contractors.list");
    expect(err.message).toBe(
      "Novara Flex contractors.list: returned a non-JSON body",
    );
  });
});

describe("flex.contractors types", () => {
  const { client } = createClient(() => jsonResponse(CONTRACTORS_BODY));

  it("makes every parameter optional and constrains the status filter", () => {
    void client.contractors.list();
    void client.contractors.list({ limit: 1000, page: 1, pretty: true });
    void client.contractors.list({ status: "new" });
    void client.contractors.list({ status: "pending" });
    void client.contractors.list({ status: "approved" });
    void client.contractors.list({ status: "denied" });
    // @ts-expect-error `status` is one of "new" | "pending" | "approved" | "denied"
    void client.contractors.list({ status: "rejected" });
    // @ts-expect-error `limit` is an integer, not a string
    void client.contractors.list({ limit: "1000" });
    // @ts-expect-error `bogus` is not a parameter of contractors.list
    void client.contractors.list({ bogus: 1 });
    // @ts-expect-error `contractor_id` belongs to contractor-contacts.list
    void client.contractors.list({ contractor_id: "x" });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.contractors.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.contractors.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"contractors.list">
    >();
    expectTypeOf(client.contractors.list()).toEqualTypeOf(
      client.call("contractors.list"),
    );
  });
});

describe("flex.contractors.listAll", () => {
  it("walks contractors.list with the maximum limit by default", async () => {
    const { client, calls } = createClient((capture) =>
      jsonResponse({
        ok: true,
        contractors: bodyOf(capture).page === 1 ? [{ id: 1 }] : [{ id: 2 }],
        paging: { total: 2, last_page: 2 },
      }),
    );
    const items: unknown[] = [];
    for await (const item of client.contractors.listAll({ status: "approved" }))
      items.push(item);

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE_URL}/contractors.list`,
      `${BASE_URL}/contractors.list`,
    ]);
    expect(bodyOf(calls[0])).toEqual({
      ...{ status: "approved" },
      limit: 1000,
      page: 1,
      token: TOKEN,
    });
    expect(bodyOf(calls[1])).toEqual({
      ...{ status: "approved" },
      limit: 1000,
      page: 2,
      token: TOKEN,
    });
  });

  it("yields the contract's item type and takes the wrapper's arguments", () => {
    const { client } = createClient(() => jsonResponse({}));
    expectTypeOf(
      client.contractors.listAll({ status: "approved" }),
    ).toEqualTypeOf<
      NovaraFlexPaginator<
        NonNullable<
          NovaraFlexResult<"contractors.list">["contractors"]
        >[number],
        NovaraFlexResult<"contractors.list">
      >
    >();
    void client.contractors.listAll();
    void client.contractors.listAll(undefined, { timeoutMs: 1_000 });
  });
});
