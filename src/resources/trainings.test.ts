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

/** A minimal `trainings.v2.list` success body. */
const TRAININGS_BODY = {
  ok: true,
  trainings: [
    {
      id: 1024,
      title: "Example Training",
      created: 1_473_688_379_489,
      lesson_id: null,
      included_trainings_id: [],
      schedule_type: "renewal",
      renewal_months: 12,
      is_highlighted: false,
      expiring_days: 30,
      window_required_for_new_employees: true,
    },
  ],
};

describe("flex.trainings.list", () => {
  it("posts to the vendor's versioned trainings.v2.list path", async () => {
    const { client, calls } = createClient(() => jsonResponse(TRAININGS_BODY));
    await client.trainings.list();

    expect(calls).toHaveLength(1);
    // The SDK method name drops the version segment; the wire keeps it.
    expect(calls[0]?.url).toBe(`${BASE_URL}/trainings.v2.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(TRAININGS_BODY));
    await client.trainings.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.trainings.list({ token: "attacker-supplied" } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(TRAININGS_BODY));
    const controller = new AbortController();
    await client.trainings.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(TRAININGS_BODY));
    const result = await client.trainings.list();

    expect(result).toEqual(TRAININGS_BODY);
    expect(result.ok).toBe(true);
    expect(result.trainings).toEqual(TRAININGS_BODY.trainings);
  });

  it("throws a NovaraFlexApiError naming the versioned vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.trainings
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    // The namespace drops the version; the reported method keeps it.
    expect(err.method).toBe("trainings.v2.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError naming the versioned vendor method", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.trainings
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("trainings.v2.list");
    expect(err.message).toBe(
      "Novara Flex trainings.v2.list: returned a non-JSON body",
    );
  });

  it("stays reachable through call under the versioned vendor name", async () => {
    const { client, calls } = createClient(() => jsonResponse(TRAININGS_BODY));
    const result = await client.call("trainings.v2.list");

    expect(calls[0]?.url).toBe(`${BASE_URL}/trainings.v2.list`);
    expect(result).toEqual(TRAININGS_BODY);
  });
});

describe("flex.trainings types", () => {
  const { client } = createClient(() => jsonResponse(TRAININGS_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.trainings.list();
    void client.trainings.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of trainings.v2.list
    void client.trainings.list({ bogus: 1 });
    // @ts-expect-error `pretty` is a boolean, not a string
    void client.trainings.list({ pretty: "yes" });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.trainings.list({ token: "override" });
  });

  it("returns exactly what call returns for the versioned vendor method", () => {
    expectTypeOf(client.trainings.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"trainings.v2.list">
    >();
    expectTypeOf(client.trainings.list()).toEqualTypeOf(
      client.call("trainings.v2.list"),
    );
  });
});
