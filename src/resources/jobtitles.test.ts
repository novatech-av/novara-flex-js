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

/** A minimal `jobtitles.list` success body. */
const JOBTITLES_BODY = {
  ok: true,
  jobtitles: [{ id: "jt1", title: "Field Technician", created: 1_500_000_000 }],
};

describe("flex.jobtitles.list", () => {
  it("posts to baseUrl/jobtitles.list with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(JOBTITLES_BODY));
    await client.jobtitles.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/jobtitles.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(JOBTITLES_BODY));
    await client.jobtitles.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.jobtitles.list({ token: "attacker-supplied" } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(JOBTITLES_BODY));
    const controller = new AbortController();
    await client.jobtitles.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(JOBTITLES_BODY));
    const result = await client.jobtitles.list();

    expect(result).toEqual(JOBTITLES_BODY);
    expect(result.ok).toBe(true);
    expect(result.jobtitles).toEqual(JOBTITLES_BODY.jobtitles);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.jobtitles
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("jobtitles.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.jobtitles
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("jobtitles.list");
    expect(err.message).toBe(
      "Novara Flex jobtitles.list: returned a non-JSON body",
    );
  });
});

describe("flex.jobtitles types", () => {
  const { client } = createClient(() => jsonResponse(JOBTITLES_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.jobtitles.list();
    void client.jobtitles.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of jobtitles.list
    void client.jobtitles.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.jobtitles.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.jobtitles.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"jobtitles.list">
    >();
    expectTypeOf(client.jobtitles.list()).toEqualTypeOf(
      client.call("jobtitles.list"),
    );
  });
});
