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

/** The training every filtered request in this file asks about. */
const TRAINING_ID = 1024;

/** A minimal `completedtrainings.v2.list` success body, paging included. */
const COMPLETED_BODY = {
  ok: true,
  completedtrainings: [
    {
      id: 88_211,
      training_id: TRAINING_ID,
      m_user_id: "u1",
      created: 1_473_688_379_489,
      date_number: 20_260_914,
      special_expiration_date_number: null,
      m_instructor_id: "u2",
      group_training_id: null,
      notes: "",
      signature: null,
      files: [],
    },
  ],
  paging: { total: 57, last_page: 6 },
};

describe("flex.completedtrainings.list", () => {
  it("posts to the vendor's versioned completedtrainings.v2.list path", async () => {
    const { client, calls } = createClient(() => jsonResponse(COMPLETED_BODY));
    await client.completedtrainings.list();

    expect(calls).toHaveLength(1);
    // The SDK method name drops the version segment; the wire keeps it.
    expect(calls[0]?.url).toBe(`${BASE_URL}/completedtrainings.v2.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards the filters and paging params, token last", async () => {
    const { client, calls } = createClient(() => jsonResponse(COMPLETED_BODY));
    await client.completedtrainings.list({
      training_id: TRAINING_ID,
      user_id: "u1",
      has_attachments: true,
      limit: 1000,
      page: 2,
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      training_id: TRAINING_ID,
      user_id: "u1",
      has_attachments: true,
      limit: 1000,
      page: 2,
      pretty: true,
      token: TOKEN,
    });

    await client.completedtrainings.list({
      token: "attacker-supplied",
    } as unknown as { limit?: number });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(COMPLETED_BODY));
    const controller = new AbortController();
    await client.completedtrainings.list(undefined, {
      signal: controller.signal,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body with the paging metadata reachable", async () => {
    const { client } = createClient(() => jsonResponse(COMPLETED_BODY));
    const result = await client.completedtrainings.list({ limit: 10 });

    expect(result).toEqual(COMPLETED_BODY);
    expect(result.ok).toBe(true);
    expect(result.completedtrainings).toEqual(
      COMPLETED_BODY.completedtrainings,
    );
    // Nothing is stripped, so a caller can walk the pages itself.
    expect(result.paging).toEqual({ total: 57, last_page: 6 });
    expect(result.paging.total).toBe(57);
    expect(result.paging.last_page).toBe(6);
  });

  it("throws a NovaraFlexApiError naming the versioned vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.completedtrainings
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    // The namespace drops the version; the reported method keeps it.
    expect(err.method).toBe("completedtrainings.v2.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError naming the versioned vendor method", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.completedtrainings
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("completedtrainings.v2.list");
    expect(err.message).toBe(
      "Novara Flex completedtrainings.v2.list: returned a non-JSON body",
    );
  });

  it("stays reachable through call under the versioned vendor name", async () => {
    const { client, calls } = createClient(() => jsonResponse(COMPLETED_BODY));
    const result = await client.call("completedtrainings.v2.list", {
      training_id: TRAINING_ID,
    });

    expect(calls[0]?.url).toBe(`${BASE_URL}/completedtrainings.v2.list`);
    expect(bodyOf(calls[0])).toEqual({
      training_id: TRAINING_ID,
      token: TOKEN,
    });
    expect(result).toEqual(COMPLETED_BODY);
  });
});

describe("flex.completedtrainings types", () => {
  const { client } = createClient(() => jsonResponse(COMPLETED_BODY));

  it("makes every parameter optional and constrains their types", () => {
    void client.completedtrainings.list();
    void client.completedtrainings.list({
      training_id: TRAINING_ID,
      user_id: "u1",
      has_attachments: false,
      limit: 1,
      page: 1,
      pretty: true,
    });
    // @ts-expect-error `training_id` is an integer, not a string
    void client.completedtrainings.list({ training_id: "1024" });
    // @ts-expect-error `user_id` is a string, not a number
    void client.completedtrainings.list({ user_id: 1 });
    // @ts-expect-error `has_attachments` is a boolean, not a string
    void client.completedtrainings.list({ has_attachments: "yes" });
    // @ts-expect-error `bogus` is not a parameter of completedtrainings.v2.list
    void client.completedtrainings.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.completedtrainings.list({ token: "override" });
  });

  it("returns exactly what call returns for the versioned vendor method", () => {
    expectTypeOf(client.completedtrainings.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"completedtrainings.v2.list">
    >();
    expectTypeOf(client.completedtrainings.list()).toEqualTypeOf(
      client.call("completedtrainings.v2.list"),
    );
  });
});

describe("flex.completedtrainings.listAll", () => {
  it("walks completedtrainings.v2.list (the vendor's name, not the SDK's) with the maximum limit by default", async () => {
    const { client, calls } = createClient((capture) =>
      jsonResponse({
        ok: true,
        completedtrainings:
          bodyOf(capture).page === 1 ? [{ id: 1 }] : [{ id: 2 }],
        paging: { total: 2, last_page: 2 },
      }),
    );
    const items: unknown[] = [];
    for await (const item of client.completedtrainings.listAll())
      items.push(item);

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE_URL}/completedtrainings.v2.list`,
      `${BASE_URL}/completedtrainings.v2.list`,
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
    expectTypeOf(client.completedtrainings.listAll()).toEqualTypeOf<
      NovaraFlexPaginator<
        NonNullable<
          NovaraFlexResult<"completedtrainings.v2.list">["completedtrainings"]
        >[number],
        NovaraFlexResult<"completedtrainings.v2.list">
      >
    >();
    void client.completedtrainings.listAll();
    void client.completedtrainings.listAll(undefined, { timeoutMs: 1_000 });
  });
});
