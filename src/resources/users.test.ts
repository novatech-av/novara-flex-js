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

/** A minimal `users.list` success body, including the undocumented `columns`. */
const USERS_BODY = {
  ok: true,
  users: [
    {
      id: "5804f0f30ef50473af5870c6",
      firstname: "Ada",
      lastname: "Lovelace",
      email: "ada@example.test",
      created: 1_500_000_000,
      isDriver: false,
      fieldOffice_id: ["fo1"],
    },
  ],
  columns: ["firstname", "lastname", "email"],
};

/** A minimal `users.info` success body. */
const USER_BODY = {
  ok: true,
  user: USERS_BODY.users[0],
};

describe("flex.users.list", () => {
  it("posts to baseUrl/users.list with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(USERS_BODY));
    await client.users.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/users.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(USERS_BODY));
    await client.users.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.users.list({ token: "attacker-supplied" } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(USERS_BODY));
    const controller = new AbortController();
    await client.users.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, columns included", async () => {
    const { client } = createClient(() => jsonResponse(USERS_BODY));
    const result = await client.users.list();

    expect(result).toEqual(USERS_BODY);
    expect(result.users).toEqual(USERS_BODY.users);
    expect(result.columns).toEqual(USERS_BODY.columns);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.users
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("users.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.users
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("users.list");
    expect(err.message).toBe(
      "Novara Flex users.list: returned a non-JSON body",
    );
  });
});

describe("flex.users.info", () => {
  it("posts the id to baseUrl/users.info with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(USER_BODY));
    await client.users.info({ id: "5804f0f30ef50473af5870c6" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/users.info`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({
      id: "5804f0f30ef50473af5870c6",
      token: TOKEN,
    });
  });

  it("forwards pretty and an abort signal, and keeps the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(USER_BODY));
    const controller = new AbortController();
    await client.users.info(
      { id: "u1", pretty: true },
      { signal: controller.signal },
    );

    expect(bodyOf(calls[0])).toEqual({
      id: "u1",
      pretty: true,
      token: TOKEN,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);

    await client.users.info({
      id: "u1",
      token: "attacker-supplied",
    } as unknown as { id: string });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("returns the whole success body, not an unwrapped user", async () => {
    const { client } = createClient(() => jsonResponse(USER_BODY));
    const result = await client.users.info({ id: "u1" });

    expect(result).toEqual(USER_BODY);
    expect(result.ok).toBe(true);
    expect(result.user).toEqual(USER_BODY.user);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "not_found" }),
    );
    const err = (await client.users
      .info({ id: "missing" })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("not_found");
    expect(err.method).toBe("users.info");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.users
      .info({ id: "u1" })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("users.info");
    expect(err.message).toBe(
      "Novara Flex users.info: returned a non-JSON body",
    );
  });
});

describe("flex.users types", () => {
  const { client } = createClient(() => jsonResponse(USERS_BODY));

  it("makes params optional for users.list and required for users.info", () => {
    void client.users.list();
    void client.users.list({ pretty: true });
    void client.users.info({ id: "x" });
    void client.users.info({ id: "x", pretty: true });
    // @ts-expect-error users.info requires an `id`
    void client.users.info();
    // @ts-expect-error `bogus` is not a parameter of users.list
    void client.users.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.users.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.users.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"users.list">
    >();
    expectTypeOf(client.users.info({ id: "x" })).resolves.toEqualTypeOf<
      NovaraFlexResult<"users.info">
    >();
    expectTypeOf(client.users.list()).toEqualTypeOf(client.call("users.list"));
    expectTypeOf(client.users.info({ id: "x" })).toEqualTypeOf(
      client.call("users.info", { id: "x" }),
    );
  });
});
