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

/** A minimal `companies.list` success body. */
const COMPANIES_BODY = {
  ok: true,
  companies: [
    { id: "c1", name: "Example Contracting", created: 1_500_000_000 },
  ],
};

describe("flex.companies.list", () => {
  it("posts to baseUrl/companies.list with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(COMPANIES_BODY));
    await client.companies.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/companies.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(COMPANIES_BODY));
    await client.companies.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.companies.list({ token: "attacker-supplied" } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(COMPANIES_BODY));
    const controller = new AbortController();
    await client.companies.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(COMPANIES_BODY));
    const result = await client.companies.list();

    expect(result).toEqual(COMPANIES_BODY);
    expect(result.ok).toBe(true);
    expect(result.companies).toEqual(COMPANIES_BODY.companies);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.companies
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("companies.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.companies
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("companies.list");
    expect(err.message).toBe(
      "Novara Flex companies.list: returned a non-JSON body",
    );
  });
});

describe("flex.companies types", () => {
  const { client } = createClient(() => jsonResponse(COMPANIES_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.companies.list();
    void client.companies.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of companies.list
    void client.companies.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.companies.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.companies.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"companies.list">
    >();
    expectTypeOf(client.companies.list()).toEqualTypeOf(
      client.call("companies.list"),
    );
  });
});
