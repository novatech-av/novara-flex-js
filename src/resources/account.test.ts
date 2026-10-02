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

/** A minimal `account.info` success body. */
const ACCOUNT_BODY = {
  ok: true,
  account: {
    id: "5804f0f30ef50473af5870c6",
    name: "Example Org",
    subdomain: "example",
    created: 1_500_000_000,
    expiresOn: 1_900_000_000,
    userMetafields: [{ id: "mf1", name: "Badge", type: "text", list_id: 3 }],
  },
};

describe("flex.account.info", () => {
  it("posts to baseUrl/account.info with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(ACCOUNT_BODY));
    await client.account.info();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/account.info`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(ACCOUNT_BODY));
    await client.account.info({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.account.info({ token: "attacker-supplied" } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(ACCOUNT_BODY));
    const controller = new AbortController();
    await client.account.info(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped account", async () => {
    const { client } = createClient(() => jsonResponse(ACCOUNT_BODY));
    const result = await client.account.info();

    expect(result).toEqual(ACCOUNT_BODY);
    expect(result.ok).toBe(true);
    expect(result.account).toEqual(ACCOUNT_BODY.account);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.account
      .info()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("account.info");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.account
      .info()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("account.info");
    expect(err.message).toBe(
      "Novara Flex account.info: returned a non-JSON body",
    );
  });
});

describe("flex.account types", () => {
  const { client } = createClient(() => jsonResponse(ACCOUNT_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.account.info();
    void client.account.info({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of account.info
    void client.account.info({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.account.info({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.account.info()).resolves.toEqualTypeOf<
      NovaraFlexResult<"account.info">
    >();
    expectTypeOf(client.account.info()).toEqualTypeOf(
      client.call("account.info"),
    );
  });
});
