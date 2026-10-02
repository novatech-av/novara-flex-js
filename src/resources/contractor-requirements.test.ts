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

/** The requirement every `info` request in this file asks about. */
const REQUIREMENT_ID = "2D50433E-F36B-1410-8C82-006D55A93A8F";

/**
 * A minimal `contractor-requirements.list` success body, paging metadata
 * included.
 */
const REQUIREMENTS_BODY = {
  ok: true,
  requirements: [
    {
      id: REQUIREMENT_ID,
      name: "General Liability Certificate",
      type_id: 1,
      type: "Upload",
      isActive: true,
      compliance_scoring: true,
      recurring: false,
      vendor_count: 12,
      form_expiration_date: false,
    },
  ],
  paging: { total: 7, last_page: 7 },
};

/** A minimal `contractor-requirement.info` success body. */
const REQUIREMENT_BODY = {
  ok: true,
  requirement_id: REQUIREMENT_ID,
  contractors: [
    {
      contractor_id: "D2EEA9E5-3E10-44BC-92EC-50B587B83019",
      name: "Example Contractor",
      status: "approved",
    },
  ],
};

describe("flex.contractorRequirements.list", () => {
  it("posts to baseUrl/contractor-requirements.list with the injected token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(REQUIREMENTS_BODY),
    );
    await client.contractorRequirements.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/contractor-requirements.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards the paging params and never lets them override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(REQUIREMENTS_BODY),
    );
    await client.contractorRequirements.list({
      limit: 500,
      page: 2,
      type: "Training",
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      limit: 500,
      page: 2,
      type: "Training",
      pretty: true,
      token: TOKEN,
    });

    await client.contractorRequirements.list({
      token: "attacker-supplied",
    } as unknown as { pretty?: boolean });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(REQUIREMENTS_BODY),
    );
    const controller = new AbortController();
    await client.contractorRequirements.list(undefined, {
      signal: controller.signal,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body with the paging metadata reachable", async () => {
    const { client } = createClient(() => jsonResponse(REQUIREMENTS_BODY));
    const result = await client.contractorRequirements.list({
      limit: 1,
      page: 1,
    });

    expect(result).toEqual(REQUIREMENTS_BODY);
    expect(result.ok).toBe(true);
    expect(result.requirements).toEqual(REQUIREMENTS_BODY.requirements);
    // Nothing is stripped, so a caller can walk the pages itself.
    expect(result.paging).toEqual({ total: 7, last_page: 7 });
    expect(result.paging.total).toBe(7);
    expect(result.paging.last_page).toBe(7);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.contractorRequirements
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("contractor-requirements.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.contractorRequirements
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("contractor-requirements.list");
    expect(err.message).toBe(
      "Novara Flex contractor-requirements.list: returned a non-JSON body",
    );
  });
});

describe("flex.contractorRequirements.info", () => {
  it("posts to the vendor's singular contractor-requirement.info path", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(REQUIREMENT_BODY),
    );
    await client.contractorRequirements.info({
      requirement_id: REQUIREMENT_ID,
    });

    expect(calls).toHaveLength(1);
    // The SDK folds the two vendor areas into one namespace, but the method
    // name on the wire stays the vendor's singular spelling.
    expect(calls[0]?.url).toBe(`${BASE_URL}/contractor-requirement.info`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({
      requirement_id: REQUIREMENT_ID,
      token: TOKEN,
    });
  });

  it("forwards pretty and an abort signal, and keeps the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(REQUIREMENT_BODY),
    );
    const controller = new AbortController();
    await client.contractorRequirements.info(
      { requirement_id: REQUIREMENT_ID, pretty: true },
      { signal: controller.signal },
    );

    expect(bodyOf(calls[0])).toEqual({
      requirement_id: REQUIREMENT_ID,
      pretty: true,
      token: TOKEN,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);

    await client.contractorRequirements.info({
      requirement_id: REQUIREMENT_ID,
      token: "attacker-supplied",
    } as unknown as { requirement_id: string });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("returns the whole success body, not an unwrapped contractor list", async () => {
    const { client } = createClient(() => jsonResponse(REQUIREMENT_BODY));
    const result = await client.contractorRequirements.info({
      requirement_id: REQUIREMENT_ID,
    });

    expect(result).toEqual(REQUIREMENT_BODY);
    expect(result.ok).toBe(true);
    expect(result.requirement_id).toBe(REQUIREMENT_ID);
    expect(result.contractors).toEqual(REQUIREMENT_BODY.contractors);
  });

  it("throws a NovaraFlexApiError naming the singular vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "content_not_found" }),
    );
    const err = (await client.contractorRequirements
      .info({ requirement_id: REQUIREMENT_ID })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("content_not_found");
    // The namespace is plural; the reported method is the vendor's singular one.
    expect(err.method).toBe("contractor-requirement.info");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError naming the singular vendor method", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.contractorRequirements
      .info({ requirement_id: REQUIREMENT_ID })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("contractor-requirement.info");
    expect(err.message).toBe(
      "Novara Flex contractor-requirement.info: returned a non-JSON body",
    );
  });
});

describe("flex.contractorRequirements types", () => {
  const { client } = createClient(() => jsonResponse(REQUIREMENTS_BODY));

  it("makes list params optional, requires requirement_id on info", () => {
    void client.contractorRequirements.list();
    void client.contractorRequirements.list({
      limit: 500,
      page: 1,
      pretty: true,
    });
    void client.contractorRequirements.list({ type: "Upload" });
    void client.contractorRequirements.list({ type: "Form" });
    void client.contractorRequirements.list({ type: "Signoff" });
    void client.contractorRequirements.list({ type: "Training" });
    void client.contractorRequirements.info({ requirement_id: REQUIREMENT_ID });
    void client.contractorRequirements.info({
      requirement_id: REQUIREMENT_ID,
      pretty: true,
    });
    // @ts-expect-error `type` is one of "Upload" | "Form" | "Signoff" | "Training"
    void client.contractorRequirements.list({ type: "Bogus" });
    // @ts-expect-error `bogus` is not a parameter of contractor-requirements.list
    void client.contractorRequirements.list({ bogus: 1 });
    // @ts-expect-error contractor-requirement.info requires a `requirement_id`
    void client.contractorRequirements.info();
    // @ts-expect-error the vendor's parameter is `requirement_id`, not `id`
    void client.contractorRequirements.info({ id: "x" });
    // @ts-expect-error `requirement_id` is a string, not a number
    void client.contractorRequirements.info({ requirement_id: 21 });
    void client.contractorRequirements.info({
      requirement_id: REQUIREMENT_ID,
      // @ts-expect-error the token is supplied by the client, not the caller
      token: "override",
    });
  });

  it("returns exactly what call returns for the same vendor methods", () => {
    expectTypeOf(client.contractorRequirements.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"contractor-requirements.list">
    >();
    expectTypeOf(
      client.contractorRequirements.info({ requirement_id: REQUIREMENT_ID }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"contractor-requirement.info">>();
    expectTypeOf(client.contractorRequirements.list()).toEqualTypeOf(
      client.call("contractor-requirements.list"),
    );
    // The folded namespace is exactly the singular vendor method.
    expectTypeOf(
      client.contractorRequirements.info({ requirement_id: REQUIREMENT_ID }),
    ).toEqualTypeOf(
      client.call("contractor-requirement.info", {
        requirement_id: REQUIREMENT_ID,
      }),
    );
  });
});

describe("flex.contractorRequirements.listAll", () => {
  it("walks contractor-requirements.list (the vendor's name, not the SDK's) with the maximum limit by default", async () => {
    const { client, calls } = createClient((capture) =>
      jsonResponse({
        ok: true,
        requirements: bodyOf(capture).page === 1 ? [{ id: 1 }] : [{ id: 2 }],
        paging: { total: 2, last_page: 2 },
      }),
    );
    const items: unknown[] = [];
    for await (const item of client.contractorRequirements.listAll())
      items.push(item);

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE_URL}/contractor-requirements.list`,
      `${BASE_URL}/contractor-requirements.list`,
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
    expectTypeOf(client.contractorRequirements.listAll()).toEqualTypeOf<
      NovaraFlexPaginator<
        NonNullable<
          NovaraFlexResult<"contractor-requirements.list">["requirements"]
        >[number],
        NovaraFlexResult<"contractor-requirements.list">
      >
    >();
    void client.contractorRequirements.listAll();
    void client.contractorRequirements.listAll(undefined, { timeoutMs: 1_000 });
  });
});
