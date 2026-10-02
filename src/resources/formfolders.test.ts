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

/** A minimal `formfolders.list` success body. */
const FOLDERS_BODY = {
  ok: true,
  folders: [
    {
      id: 7,
      name: "Safety",
      sequence: 1,
      created: 1_500_000_000,
      updated: 1_500_000_100,
    },
  ],
};

describe("flex.formfolders.list", () => {
  it("posts to baseUrl/formfolders.list with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(FOLDERS_BODY));
    await client.formfolders.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/formfolders.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards pretty and never lets params override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(FOLDERS_BODY));
    await client.formfolders.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.formfolders.list({
      token: "attacker-supplied",
    } as unknown as { pretty?: boolean });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(FOLDERS_BODY));
    const controller = new AbortController();
    await client.formfolders.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(FOLDERS_BODY));
    const result = await client.formfolders.list();

    expect(result).toEqual(FOLDERS_BODY);
    expect(result.ok).toBe(true);
    expect(result.folders).toEqual(FOLDERS_BODY.folders);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.formfolders
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("formfolders.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.formfolders
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("formfolders.list");
    expect(err.message).toBe(
      "Novara Flex formfolders.list: returned a non-JSON body",
    );
  });
});

describe("flex.formfolders types", () => {
  const { client } = createClient(() => jsonResponse(FOLDERS_BODY));

  it("makes every parameter optional and rejects unknown ones", () => {
    void client.formfolders.list();
    void client.formfolders.list({});
    void client.formfolders.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of formfolders.list
    void client.formfolders.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.formfolders.list({ token: "override" });
    // @ts-expect-error `pretty` is a boolean
    void client.formfolders.list({ pretty: "yes" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.formfolders.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"formfolders.list">
    >();
    expectTypeOf(client.formfolders.list()).toEqualTypeOf(
      client.call("formfolders.list"),
    );
  });
});
