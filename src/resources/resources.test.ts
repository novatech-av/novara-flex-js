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

/** A minimal `resources.list` success body. */
const RESOURCES_BODY = {
  ok: true,
  resources: [
    {
      id: "5804f0f80ef50473af587886",
      title: "Example Resource",
      created: 1_473_688_379_489,
      sequence: 1,
      tags: ["Safety"],
      shouldBeAvailableOffline: true,
      versions: [
        {
          version: "2",
          description: "",
          creator_id: "5804f0f30ef50473af5870c6",
          created: 1_473_688_379_489,
          approvedOn: 1_476_981_004_760,
          // `file` is null when the version is a link instead of an upload.
          file: null,
          link: "https://example.test/plan",
          type: "link",
          // An undocumented key: nothing is stripped, so it survives the call.
          size: 0,
        },
      ],
    },
  ],
};

describe("flex.resources.list", () => {
  it("posts to baseUrl/resources.list with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(RESOURCES_BODY));
    await client.resources.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/resources.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(RESOURCES_BODY));
    await client.resources.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.resources.list({
      token: "attacker-supplied",
    } as unknown as { pretty?: boolean });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(RESOURCES_BODY));
    const controller = new AbortController();
    await client.resources.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, versions and all", async () => {
    const { client } = createClient(() => jsonResponse(RESOURCES_BODY));
    const result = await client.resources.list();

    expect(result).toEqual(RESOURCES_BODY);
    expect(result.ok).toBe(true);
    expect(result.resources).toEqual(RESOURCES_BODY.resources);
    // Nothing is unwrapped: the version entries come back intact, including the
    // undocumented `size` the wire carries for an uploaded document.
    expect(result.resources[0]?.versions?.[0]?.file).toBeNull();
    expect(result.resources[0]?.versions?.[0]?.size).toBe(0);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.resources
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("resources.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.resources
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("resources.list");
    expect(err.message).toBe(
      "Novara Flex resources.list: returned a non-JSON body",
    );
  });
});

describe("flex.resources types", () => {
  const { client } = createClient(() => jsonResponse(RESOURCES_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.resources.list();
    void client.resources.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of resources.list
    void client.resources.list({ bogus: 1 });
    // @ts-expect-error `pretty` is a boolean, not a string
    void client.resources.list({ pretty: "x" });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.resources.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.resources.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"resources.list">
    >();
    expectTypeOf(client.resources.list()).toEqualTypeOf(
      client.call("resources.list"),
    );
  });
});
