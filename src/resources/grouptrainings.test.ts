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

/** A minimal `grouptrainings.list` success body. */
const GROUP_TRAININGS_BODY = {
  ok: true,
  grouptrainings: [
    {
      id: 4471,
      created: 1_473_688_379_489,
      m_trainees_id: ["u1", "u2"],
      trainings_id: [1024, 1025],
      m_instructor_id: "u3",
      notes: "",
    },
  ],
};

describe("flex.grouptrainings.list", () => {
  it("posts to baseUrl/grouptrainings.list with the injected token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(GROUP_TRAININGS_BODY),
    );
    await client.grouptrainings.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/grouptrainings.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards params and never lets them override the token", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(GROUP_TRAININGS_BODY),
    );
    await client.grouptrainings.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.grouptrainings.list({
      token: "attacker-supplied",
    } as unknown as { pretty?: boolean });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse(GROUP_TRAININGS_BODY),
    );
    const controller = new AbortController();
    await client.grouptrainings.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(GROUP_TRAININGS_BODY));
    const result = await client.grouptrainings.list();

    expect(result).toEqual(GROUP_TRAININGS_BODY);
    expect(result.ok).toBe(true);
    expect(result.grouptrainings).toEqual(GROUP_TRAININGS_BODY.grouptrainings);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.grouptrainings
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("grouptrainings.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.grouptrainings
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("grouptrainings.list");
    expect(err.message).toBe(
      "Novara Flex grouptrainings.list: returned a non-JSON body",
    );
  });
});

describe("flex.grouptrainings types", () => {
  const { client } = createClient(() => jsonResponse(GROUP_TRAININGS_BODY));

  it("accepts the documented params and rejects anything else", () => {
    void client.grouptrainings.list();
    void client.grouptrainings.list({ pretty: true });
    // @ts-expect-error `bogus` is not a parameter of grouptrainings.list
    void client.grouptrainings.list({ bogus: 1 });
    // @ts-expect-error grouptrainings.list takes no paging parameters
    void client.grouptrainings.list({ limit: 10 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.grouptrainings.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.grouptrainings.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"grouptrainings.list">
    >();
    expectTypeOf(client.grouptrainings.list()).toEqualTypeOf(
      client.call("grouptrainings.list"),
    );
  });
});
