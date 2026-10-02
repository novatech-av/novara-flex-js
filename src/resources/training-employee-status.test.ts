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

/** A minimal `training-employee-status.list` success body, paging included. */
const STATUS_BODY = {
  ok: true,
  last_updated: 1_476_981_004_760,
  employees: [
    {
      status: "active",
      m_user_id: "u1",
      percent_complete: 100,
      incomplete_training_ids: [],
      complete_training_ids: [1024],
      last_completed: [
        {
          id: 1024,
          date_number: 20_260_914,
          expiresOn: null,
          startsExpiringOn: null,
          is_required: true,
        },
      ],
    },
  ],
  paging: { total: 57, last_page: 1 },
};

describe("flex.trainingEmployeeStatus.list", () => {
  it("posts to the vendor's hyphenated training-employee-status.list path", async () => {
    const { client, calls } = createClient(() => jsonResponse(STATUS_BODY));
    await client.trainingEmployeeStatus.list();

    expect(calls).toHaveLength(1);
    // The property is camelCased; the method name on the wire keeps the hyphens.
    expect(calls[0]?.url).toBe(`${BASE_URL}/training-employee-status.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards the filters and paging params, token last", async () => {
    const { client, calls } = createClient(() => jsonResponse(STATUS_BODY));
    await client.trainingEmployeeStatus.list({
      training_ids: [1024, 1025],
      m_user_ids: ["u1", "u2"],
      limit: 1000,
      page: 2,
      include_all_completions: true,
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      training_ids: [1024, 1025],
      m_user_ids: ["u1", "u2"],
      limit: 1000,
      page: 2,
      include_all_completions: true,
      pretty: true,
      token: TOKEN,
    });

    await client.trainingEmployeeStatus.list({
      token: "attacker-supplied",
    } as unknown as { limit?: number });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(STATUS_BODY));
    const controller = new AbortController();
    await client.trainingEmployeeStatus.list(undefined, {
      signal: controller.signal,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole body, paging and last_updated included", async () => {
    const { client } = createClient(() => jsonResponse(STATUS_BODY));
    const result = await client.trainingEmployeeStatus.list({ limit: 10 });

    expect(result).toEqual(STATUS_BODY);
    expect(result.ok).toBe(true);
    expect(result.employees).toEqual(STATUS_BODY.employees);
    // The roll-up may be up to 15 minutes stale, so the timestamp stays reachable.
    expect(result.last_updated).toBe(1_476_981_004_760);
    expect(result.paging).toEqual({ total: 57, last_page: 1 });
    expect(result.paging.total).toBe(57);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.trainingEmployeeStatus
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("training-employee-status.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.trainingEmployeeStatus
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("training-employee-status.list");
    expect(err.message).toBe(
      "Novara Flex training-employee-status.list: returned a non-JSON body",
    );
  });

  it("stays reachable through call under the hyphenated vendor name", async () => {
    const { client, calls } = createClient(() => jsonResponse(STATUS_BODY));
    const result = await client.call("training-employee-status.list", {
      limit: 5,
    });

    expect(calls[0]?.url).toBe(`${BASE_URL}/training-employee-status.list`);
    expect(result).toEqual(STATUS_BODY);
  });
});

describe("flex.trainingEmployeeStatus types", () => {
  const { client } = createClient(() => jsonResponse(STATUS_BODY));

  it("makes every parameter optional and constrains the arrays", () => {
    void client.trainingEmployeeStatus.list();
    void client.trainingEmployeeStatus.list({
      training_ids: [1024],
      m_user_ids: ["u1"],
      limit: 1,
      page: 1,
      include_all_completions: false,
      pretty: true,
    });
    // @ts-expect-error `training_ids` holds integers, not strings
    void client.trainingEmployeeStatus.list({ training_ids: ["1024"] });
    // @ts-expect-error `m_user_ids` holds strings, not integers
    void client.trainingEmployeeStatus.list({ m_user_ids: [1] });
    // @ts-expect-error `training_ids` is an array, not a bare integer
    void client.trainingEmployeeStatus.list({ training_ids: 1024 });
    // @ts-expect-error `bogus` is not a parameter of training-employee-status.list
    void client.trainingEmployeeStatus.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.trainingEmployeeStatus.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.trainingEmployeeStatus.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"training-employee-status.list">
    >();
    expectTypeOf(client.trainingEmployeeStatus.list()).toEqualTypeOf(
      client.call("training-employee-status.list"),
    );
  });
});

describe("flex.trainingEmployeeStatus.listAll", () => {
  it("walks training-employee-status.list (the vendor's name, not the SDK's) with the maximum limit by default", async () => {
    const { client, calls } = createClient((capture) =>
      jsonResponse({
        ok: true,
        employees: bodyOf(capture).page === 1 ? [{ id: 1 }] : [{ id: 2 }],
        paging: { total: 2, last_page: 2 },
      }),
    );
    const items: unknown[] = [];
    for await (const item of client.trainingEmployeeStatus.listAll())
      items.push(item);

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE_URL}/training-employee-status.list`,
      `${BASE_URL}/training-employee-status.list`,
    ]);
    expect(bodyOf(calls[0])).toEqual({
      limit: 1000,
      page: 1,
      token: TOKEN,
    });
    expect(bodyOf(calls[1])).toEqual({
      limit: 1000,
      page: 2,
      token: TOKEN,
    });
  });

  it("yields the contract's item type and takes the wrapper's arguments", () => {
    const { client } = createClient(() => jsonResponse({}));
    expectTypeOf(client.trainingEmployeeStatus.listAll()).toEqualTypeOf<
      NovaraFlexPaginator<
        NonNullable<
          NovaraFlexResult<"training-employee-status.list">["employees"]
        >[number],
        NovaraFlexResult<"training-employee-status.list">
      >
    >();
    void client.trainingEmployeeStatus.listAll();
    void client.trainingEmployeeStatus.listAll(undefined, { timeoutMs: 1_000 });
  });
});
