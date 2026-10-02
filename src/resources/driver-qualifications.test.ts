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

/** A minimal `driver-qualifications.list` success body. */
const QUALIFICATIONS_BODY = {
  ok: true,
  users: [
    {
      id: "u1",
      employeeNumber: "E-1042",
      requirements: [
        {
          id: 12,
          title: "Medical Certificate",
          status: "Current",
          expiration: "2027-01-31",
          lastCompleted: "2026-01-31",
        },
      ],
    },
  ],
};

describe("flex.driverQualifications.list", () => {
  it("posts to the vendor's hyphenated driver-qualifications.list path", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(QUALIFICATIONS_BODY),
    );
    await client.driverQualifications.list();

    expect(calls).toHaveLength(1);
    // The property is camelCased; the method name on the wire keeps the hyphen.
    expect(calls[0]?.url).toBe(`${BASE_URL}/driver-qualifications.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(QUALIFICATIONS_BODY),
    );
    await client.driverQualifications.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.driverQualifications.list({
      token: "attacker-supplied",
    } as unknown as { pretty?: boolean });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(QUALIFICATIONS_BODY),
    );
    const controller = new AbortController();
    await client.driverQualifications.list(undefined, {
      signal: controller.signal,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body under the vendor's users key", async () => {
    const { client } = createClient(() => jsonResponse(QUALIFICATIONS_BODY));
    const result = await client.driverQualifications.list();

    expect(result).toEqual(QUALIFICATIONS_BODY);
    expect(result.ok).toBe(true);
    expect(result.users).toEqual(QUALIFICATIONS_BODY.users);
    expect(result.users[0]?.requirements).toHaveLength(1);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.driverQualifications
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("driver-qualifications.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.driverQualifications
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("driver-qualifications.list");
    expect(err.message).toBe(
      "Novara Flex driver-qualifications.list: returned a non-JSON body",
    );
  });

  it("stays reachable through call under the hyphenated vendor name", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(QUALIFICATIONS_BODY),
    );
    const result = await client.call("driver-qualifications.list");

    expect(calls[0]?.url).toBe(`${BASE_URL}/driver-qualifications.list`);
    expect(result).toEqual(QUALIFICATIONS_BODY);
  });
});

describe("flex.driverQualifications types", () => {
  const { client } = createClient(() => jsonResponse(QUALIFICATIONS_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.driverQualifications.list();
    void client.driverQualifications.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of driver-qualifications.list
    void client.driverQualifications.list({ bogus: 1 });
    // @ts-expect-error driver-qualifications.list takes no paging parameters
    void client.driverQualifications.list({ limit: 10 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.driverQualifications.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.driverQualifications.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"driver-qualifications.list">
    >();
    expectTypeOf(client.driverQualifications.list()).toEqualTypeOf(
      client.call("driver-qualifications.list"),
    );
  });
});
