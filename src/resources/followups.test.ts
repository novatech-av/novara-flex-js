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

/** A minimal `followups.list` success body, paging metadata included. */
const FOLLOWUPS_BODY = {
  ok: true,
  followups: [
    {
      id: "fu1",
      form_id: 3987,
      response_id: 23_974,
      open: true,
      created_on: "1473688379489",
      updated_on: "1476981004760",
      m_observer_id: "u1",
      m_assigner_id: "u1",
      m_assignee_id: "u2",
      due: null,
      resolved_on: null,
      m_completer_id: null,
      messages: [
        {
          id: "m1",
          date: 1_473_688_379_489,
          m_user_id: "u1",
          note: "Please correct.",
          attachments: [{ key: "a1", caption: "photo" }],
        },
      ],
    },
  ],
  paging: { total: 9, last_page: 9 },
};

describe("flex.followups.list", () => {
  it("posts to baseUrl/followups.list with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(FOLLOWUPS_BODY));
    await client.followups.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/followups.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards the filters and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(FOLLOWUPS_BODY));
    await client.followups.list({
      form_id: 3987,
      limit: 500,
      page: 2,
      status: "open",
      observer_id: "u1",
      assignee_id: "u2",
      response_id: 23_974,
      created_before: 1_476_981_004_760,
      created_after: 1_473_688_379_489,
      updated_before: 1_476_981_004_760,
      updated_after: 1_473_688_379_489,
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      form_id: 3987,
      limit: 500,
      page: 2,
      status: "open",
      observer_id: "u1",
      assignee_id: "u2",
      response_id: 23_974,
      created_before: 1_476_981_004_760,
      created_after: 1_473_688_379_489,
      updated_before: 1_476_981_004_760,
      updated_after: 1_473_688_379_489,
      pretty: true,
      token: TOKEN,
    });

    await client.followups.list({ token: "attacker-supplied" } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(FOLLOWUPS_BODY));
    const controller = new AbortController();
    await client.followups.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(FOLLOWUPS_BODY));
    const result = await client.followups.list();

    expect(result).toEqual(FOLLOWUPS_BODY);
    expect(result.ok).toBe(true);
    expect(result.followups).toEqual(FOLLOWUPS_BODY.followups);
  });

  it("keeps the paging metadata and the message thread reachable", async () => {
    const { client } = createClient(() => jsonResponse(FOLLOWUPS_BODY));
    const result = await client.followups.list({ limit: 1, page: 1 });

    expect(result.paging).toEqual({ total: 9, last_page: 9 });
    expect(result.paging.total).toBe(9);
    expect(result.paging.last_page).toBe(9);
    // Nothing is stripped, so the nested follow-up thread survives intact.
    expect(result.followups[0]?.messages?.[0]?.attachments?.[0]?.key).toBe(
      "a1",
    );
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.followups
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("followups.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.followups
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("followups.list");
    expect(err.message).toBe(
      "Novara Flex followups.list: returned a non-JSON body",
    );
  });
});

describe("flex.followups types", () => {
  const { client } = createClient(() => jsonResponse(FOLLOWUPS_BODY));

  it("makes every parameter optional and constrains the status enum", () => {
    void client.followups.list();
    void client.followups.list({});
    void client.followups.list({ status: "all" });
    void client.followups.list({ status: "open" });
    void client.followups.list({ status: "closed" });
    void client.followups.list({ status: "overdue" });
    // @ts-expect-error `status` is one of "all" | "open" | "closed" | "overdue"
    void client.followups.list({ status: "pending" });
    // @ts-expect-error `form_id` is an integer, not a string
    void client.followups.list({ form_id: "3987" });
    // @ts-expect-error `observer_id` is a string, not an integer
    void client.followups.list({ observer_id: 1 });
    // @ts-expect-error `response_id` is an integer, not a string
    void client.followups.list({ response_id: "23974" });
    // @ts-expect-error `bogus` is not a parameter of followups.list
    void client.followups.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.followups.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.followups.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"followups.list">
    >();
    expectTypeOf(client.followups.list()).toEqualTypeOf(
      client.call("followups.list"),
    );
  });
});

describe("flex.followups.listAll", () => {
  it("walks followups.list with the maximum limit by default", async () => {
    const { client, calls } = createClient((capture) =>
      jsonResponse({
        ok: true,
        followups: bodyOf(capture).page === 1 ? [{ id: 1 }] : [{ id: 2 }],
        paging: { total: 2, last_page: 2 },
      }),
    );
    const items: unknown[] = [];
    for await (const item of client.followups.listAll()) items.push(item);

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE_URL}/followups.list`,
      `${BASE_URL}/followups.list`,
    ]);
    expect(bodyOf(calls[0])).toEqual({
      limit: 500,
      page: 1,
      token: TOKEN,
    });
    expect(bodyOf(calls[1])).toEqual({
      limit: 500,
      page: 2,
      token: TOKEN,
    });
  });

  it("yields the contract's item type and takes the wrapper's arguments", () => {
    const { client } = createClient(() => jsonResponse({}));
    expectTypeOf(client.followups.listAll()).toEqualTypeOf<
      NovaraFlexPaginator<
        NonNullable<NovaraFlexResult<"followups.list">["followups"]>[number],
        NovaraFlexResult<"followups.list">
      >
    >();
    void client.followups.listAll();
    void client.followups.listAll(undefined, { timeoutMs: 1_000 });
  });
});
