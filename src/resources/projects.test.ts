import { describe, expect, expectTypeOf, it } from "vitest";
import type { NovaraFlexResult } from "../client.js";
import { NovaraFlexApiError, NovaraFlexTransportError } from "../errors.js";
import type { NovaraFlexPaginator } from "../internal/paginate.js";
import {
  BASE_URL,
  bodyOf,
  createClient,
  jsonResponse,
  TOKEN,
} from "../test-support/fake-fetch.js";

/** A minimal `projects.list` success body, paging metadata included. */
const PROJECTS_BODY = {
  ok: true,
  projects: [
    {
      id: 21,
      name: "Example Project",
      number: "P-0021",
      created: 1_500_000_000,
      active: true,
      attachments: [],
    },
  ],
  paging: { total: 42, last_page: 42 },
};

/** A minimal `projects.info` success body. */
const PROJECT_BODY = {
  ok: true,
  project: PROJECTS_BODY.projects[0],
};

describe("flex.projects.list", () => {
  it("posts to baseUrl/projects.list with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(PROJECTS_BODY));
    await client.projects.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/projects.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards the paging params and never lets them override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(PROJECTS_BODY));
    await client.projects.list({ limit: 100, page: 2, pretty: true });
    expect(bodyOf(calls[0])).toEqual({
      limit: 100,
      page: 2,
      pretty: true,
      token: TOKEN,
    });

    await client.projects.list({ token: "attacker-supplied" } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(PROJECTS_BODY));
    const controller = new AbortController();
    await client.projects.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("rejects an invalid option, naming NovaraFlexCallOptions rather than call, before sending anything", async () => {
    const { client, calls } = createClient(() => jsonResponse(PROJECTS_BODY));
    const err = await client.projects
      .list(undefined, {
        retry: "fast" as unknown as { maxRetries: number },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect((err as Error).message).toBe(
      "NovaraFlexCallOptions.retry must be an object",
    );
    expect((err as Error).message).not.toContain("NovaraFlexClient.call");
    expect(calls).toHaveLength(0);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(PROJECTS_BODY));
    const result = await client.projects.list();

    expect(result).toEqual(PROJECTS_BODY);
    expect(result.ok).toBe(true);
    expect(result.projects).toEqual(PROJECTS_BODY.projects);
  });

  it("keeps the paging metadata reachable on the result", async () => {
    const { client } = createClient(() => jsonResponse(PROJECTS_BODY));
    const result = await client.projects.list({ limit: 1, page: 1 });

    // Nothing is stripped, so a caller can walk the pages itself; listAll
    // does it for them.
    expect(result.paging).toEqual({ total: 42, last_page: 42 });
    expect(result.paging.total).toBe(42);
    expect(result.paging.last_page).toBe(42);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.projects
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("projects.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.projects
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("projects.list");
    expect(err.message).toBe(
      "Novara Flex projects.list: returned a non-JSON body",
    );
  });
});

describe("flex.projects.info", () => {
  it("posts project_id to baseUrl/projects.info with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(PROJECT_BODY));
    await client.projects.info({ project_id: 21 });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/projects.info`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ project_id: 21, token: TOKEN });
  });

  it("forwards pretty and an abort signal, and keeps the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(PROJECT_BODY));
    const controller = new AbortController();
    await client.projects.info(
      { project_id: 21, pretty: true },
      { signal: controller.signal },
    );

    expect(bodyOf(calls[0])).toEqual({
      project_id: 21,
      pretty: true,
      token: TOKEN,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);

    await client.projects.info({
      project_id: 21,
      token: "attacker-supplied",
    } as unknown as { project_id: number });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("returns the whole success body, not an unwrapped project", async () => {
    const { client } = createClient(() => jsonResponse(PROJECT_BODY));
    const result = await client.projects.info({ project_id: 21 });

    expect(result).toEqual(PROJECT_BODY);
    expect(result.ok).toBe(true);
    expect(result.project).toEqual(PROJECT_BODY.project);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "not_found" }),
    );
    const err = (await client.projects
      .info({ project_id: 404 })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("not_found");
    expect(err.method).toBe("projects.info");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.projects
      .info({ project_id: 21 })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("projects.info");
    expect(err.message).toBe(
      "Novara Flex projects.info: returned a non-JSON body",
    );
  });
});

describe("flex.projects types", () => {
  const { client } = createClient(() => jsonResponse(PROJECTS_BODY));

  it("makes params optional for projects.list and required for projects.info", () => {
    void client.projects.list();
    void client.projects.list({ limit: 500, page: 1, pretty: true });
    void client.projects.info({ project_id: 21 });
    void client.projects.info({ project_id: 21, pretty: true });
    // @ts-expect-error projects.info requires a `project_id`
    void client.projects.info();
    // @ts-expect-error projects.info takes the vendor's `project_id`, not `id`
    void client.projects.info({ id: 21 });
    // @ts-expect-error `project_id` is an integer, not a string
    void client.projects.info({ project_id: "21" });
    // @ts-expect-error `bogus` is not a parameter of projects.list
    void client.projects.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.projects.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.projects.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"projects.list">
    >();
    expectTypeOf(
      client.projects.info({ project_id: 21 }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"projects.info">>();
    expectTypeOf(client.projects.list()).toEqualTypeOf(
      client.call("projects.list"),
    );
    expectTypeOf(client.projects.info({ project_id: 21 })).toEqualTypeOf(
      client.call("projects.info", { project_id: 21 }),
    );
  });
});

describe("flex.projects.listAll", () => {
  it("walks projects.list with the maximum limit by default", async () => {
    const { client, calls } = createClient((capture) =>
      jsonResponse({
        ok: true,
        projects: bodyOf(capture).page === 1 ? [{ id: 1 }] : [{ id: 2 }],
        paging: { total: 2, last_page: 2 },
      }),
    );
    const items: unknown[] = [];
    for await (const item of client.projects.listAll()) items.push(item);

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE_URL}/projects.list`,
      `${BASE_URL}/projects.list`,
    ]);
    expect(bodyOf(calls[0])).toEqual({
      limit: 500,
      page: 1,
      token: TOKEN,
    });
    expect(bodyOf(calls[1])).toEqual({
      limit: 500,
      page: 2,
      token: TOKEN,
    });
  });

  it("yields the contract's item type and takes the wrapper's arguments", () => {
    const { client } = createClient(() => jsonResponse({}));
    expectTypeOf(client.projects.listAll()).toEqualTypeOf<
      NovaraFlexPaginator<
        NonNullable<NovaraFlexResult<"projects.list">["projects"]>[number],
        NovaraFlexResult<"projects.list">
      >
    >();
    void client.projects.listAll();
    void client.projects.listAll(undefined, { timeoutMs: 1_000 });
  });
});
