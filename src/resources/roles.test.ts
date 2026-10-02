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

/** A minimal `roles.list` success body. */
const ROLES_BODY = {
  ok: true,
  roles: [{ id: "r1", name: "Admin" }],
};

describe("flex.roles.list", () => {
  it("posts to baseUrl/roles.list with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(ROLES_BODY));
    await client.roles.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/roles.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(ROLES_BODY));
    await client.roles.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.roles.list({ token: "attacker-supplied" } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(ROLES_BODY));
    const controller = new AbortController();
    await client.roles.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(ROLES_BODY));
    const result = await client.roles.list();

    expect(result).toEqual(ROLES_BODY);
    expect(result.ok).toBe(true);
    expect(result.roles).toEqual(ROLES_BODY.roles);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.roles
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("roles.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.roles
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("roles.list");
    expect(err.message).toBe(
      "Novara Flex roles.list: returned a non-JSON body",
    );
  });
});

describe("flex.roles types", () => {
  const { client } = createClient(() => jsonResponse(ROLES_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.roles.list();
    void client.roles.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of roles.list
    void client.roles.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.roles.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.roles.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"roles.list">
    >();
    expectTypeOf(client.roles.list()).toEqualTypeOf(client.call("roles.list"));
  });
});
