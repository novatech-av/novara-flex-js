import { describe, expect, expectTypeOf, it } from "vitest";
import { NovaraFlexClient, type NovaraFlexResult } from "../client.js";
import { NovaraFlexApiError, NovaraFlexTransportError } from "../errors.js";
import {
  BASE_URL,
  bodyOf,
  type Capture,
  createClient,
  fakeFetch,
  jsonResponse,
  TOKEN,
  untilAborted,
} from "../test-support/fake-fetch.js";
import type { NovaraSchema } from "./contract.js";
import {
  type NovaraFlexPaginator,
  PAGED_METHODS,
  type PagedItem,
  paginate,
} from "./paginate.js";

/** A project with just enough fields to tell pages apart. */
function project(id: number): { id: number; name: string } {
  return { id, name: `Project ${id}` };
}

/** A `projects.list` page body. */
function projectsPage(
  ids: readonly number[],
  paging?: { total: number; last_page: number },
): Record<string, unknown> {
  return {
    ok: true,
    projects: ids.map(project),
    ...(paging ? { paging } : {}),
  };
}

/** Answer each request from `pages`, keyed by the requested `page`. */
function byPage(
  pages: Record<number, unknown>,
): (capture: Capture) => Response {
  return (capture) => {
    const page = bodyOf(capture).page as number;
    const body = pages[page];
    if (body === undefined) throw new Error(`unexpected page ${page}`);
    return jsonResponse(body);
  };
}

/** Collect everything an async iterable yields. */
async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const value of iterable) out.push(value);
  return out;
}

/** The pages a walk requested, in order. */
function requestedPages(calls: Capture[]): unknown[] {
  return calls.map((c) => bodyOf(c).page);
}

const THREE_PAGES = {
  1: projectsPage([1, 2], { total: 5, last_page: 3 }),
  2: projectsPage([3, 4], { total: 5, last_page: 3 }),
  3: projectsPage([5], { total: 5, last_page: 3 }),
};

describe("paginate", () => {
  it("walks every page in order and yields each item", async () => {
    const { client, calls } = createClient(byPage(THREE_PAGES));
    const items = await collect(
      paginate(client, "projects.list", { limit: 2 }),
    );

    expect(items.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
    expect(requestedPages(calls)).toEqual([1, 2, 3]);
    for (const call of calls) {
      expect(call.url).toBe(`${BASE_URL}/projects.list`);
      expect(bodyOf(call)).toMatchObject({ limit: 2, token: TOKEN });
    }
  });

  it("sends nothing until it is iterated", async () => {
    const { client, calls } = createClient(byPage(THREE_PAGES));
    const paginator = paginate(client, "projects.list", { limit: 2 });
    await Promise.resolve();
    expect(calls).toHaveLength(0);

    await collect(paginator);
    expect(calls).toHaveLength(3);
  });

  it("starts a fresh walk for every iteration", async () => {
    const { client, calls } = createClient(byPage(THREE_PAGES));
    const paginator = paginate(client, "projects.list", { limit: 2 });

    const first = await collect(paginator);
    const again = await collect(paginator);
    const pages = await collect(paginator.pages());

    expect(again).toEqual(first);
    expect(pages).toHaveLength(3);
    expect(requestedPages(calls)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3]);
  });

  it("stops after a single page when it is the last one", async () => {
    const { client, calls } = createClient(
      byPage({ 1: projectsPage([1, 2], { total: 2, last_page: 1 }) }),
    );
    const items = await collect(paginate(client, "projects.list"));

    expect(items.map((p) => p.id)).toEqual([1, 2]);
    expect(calls).toHaveLength(1);
  });

  it("stops after one request for an empty result with last_page 0", async () => {
    const { client, calls } = createClient(
      byPage({ 1: projectsPage([], { total: 0, last_page: 0 }) }),
    );
    expect(await collect(paginate(client, "projects.list"))).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("keeps going without paging until a page comes back empty", async () => {
    const { client, calls } = createClient(
      byPage({
        1: projectsPage([1, 2]),
        2: projectsPage([3]),
        3: projectsPage([]),
      }),
    );
    const items = await collect(
      paginate(client, "projects.list", { limit: 2 }),
    );

    expect(items.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(requestedPages(calls)).toEqual([1, 2, 3]);
  });

  it("stops on an empty page even when paging claims more pages", async () => {
    const { client, calls } = createClient(
      byPage({
        1: projectsPage([1], { total: 9, last_page: 9 }),
        2: projectsPage([], { total: 9, last_page: 9 }),
      }),
    );
    await collect(paginate(client, "projects.list", { limit: 1 }));
    expect(calls).toHaveLength(2);
  });

  it("requests the method's maximum limit when the caller omits one", async () => {
    const { client, calls } = createClient(
      byPage({ 1: projectsPage([1], { total: 1, last_page: 1 }) }),
    );
    await collect(paginate(client, "projects.list"));
    await collect(paginate(client, "projects.list", { pretty: true }));

    expect(bodyOf(calls[0])).toEqual({ limit: 500, page: 1, token: TOKEN });
    expect(bodyOf(calls[1])).toEqual({
      pretty: true,
      limit: 500,
      page: 1,
      token: TOKEN,
    });
  });

  it("passes an explicit limit through untouched", async () => {
    const { client, calls } = createClient(
      byPage({ 1: projectsPage([1], { total: 1, last_page: 1 }) }),
    );
    await collect(paginate(client, "projects.list", { limit: 7 }));
    expect(bodyOf(calls[0]).limit).toBe(7);
  });

  it("starts at the caller's page", async () => {
    const { client, calls } = createClient(byPage(THREE_PAGES));
    const items = await collect(
      paginate(client, "projects.list", { limit: 2, page: 2 }),
    );

    expect(items.map((p) => p.id)).toEqual([3, 4, 5]);
    expect(requestedPages(calls)).toEqual([2, 3]);
  });

  it("yields each page's full, untouched body from pages()", async () => {
    const { client } = createClient(
      byPage({
        1: { ...projectsPage([1], { total: 2, last_page: 2 }), extra: "kept" },
        2: projectsPage([2], { total: 2, last_page: 2 }),
      }),
    );
    const pages = await collect(
      paginate(client, "projects.list", { limit: 1 }).pages(),
    );

    expect(pages).toEqual([
      { ...projectsPage([1], { total: 2, last_page: 2 }), extra: "kept" },
      projectsPage([2], { total: 2, last_page: 2 }),
    ]);
  });

  it("sends no further request after an early break", async () => {
    const { client, calls } = createClient(byPage(THREE_PAGES));

    for await (const item of paginate(client, "projects.list", { limit: 2 })) {
      expect(item.id).toBe(1);
      break;
    }
    expect(calls).toHaveLength(1);

    for await (const page of paginate(client, "projects.list", {
      limit: 2,
    }).pages()) {
      expect(page.projects).toHaveLength(2);
      break;
    }
    expect(calls).toHaveLength(2);
  });

  it("forwards the call options to every page", async () => {
    const { client, calls } = createClient(byPage(THREE_PAGES));
    const controller = new AbortController();
    await collect(
      paginate(
        client,
        "projects.list",
        { limit: 2 },
        { signal: controller.signal },
      ),
    );

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.init?.signal).toBe(controller.signal);
    }
  });

  it("rethrows the caller's abort reason unchanged between pages", async () => {
    const { client, calls } = createClient(byPage(THREE_PAGES));
    const controller = new AbortController();
    const reason = new Error("caller gave up");
    const seen: number[] = [];

    const err = await (async () => {
      for await (const item of paginate(
        client,
        "projects.list",
        { limit: 2 },
        { signal: controller.signal },
      )) {
        seen.push(item.id ?? -1);
        if (seen.length === 2) controller.abort(reason);
      }
    })().catch((e: unknown) => e);

    expect(err).toBe(reason);
    expect(seen).toEqual([1, 2]);
    expect(calls).toHaveLength(1);
  });

  it("sends nothing when the signal is already aborted", async () => {
    const { client, calls } = createClient(byPage(THREE_PAGES));
    const reason = new Error("already gone");
    const err = await collect(
      paginate(client, "projects.list", undefined, {
        signal: AbortSignal.abort(reason),
      }),
    ).catch((e: unknown) => e);

    expect(err).toBe(reason);
    expect(calls).toHaveLength(0);
  });

  it("propagates an API error on a later page with the vendor method name", async () => {
    const { client, calls } = createClient((capture) =>
      bodyOf(capture).page === 1
        ? jsonResponse({
            ok: true,
            completedtrainings: [{ id: "c1" }],
            paging: { total: 3, last_page: 3 },
          })
        : jsonResponse({ ok: false, error: "server_error" }),
    );
    const seen: unknown[] = [];
    const err = await (async () => {
      for await (const item of paginate(client, "completedtrainings.v2.list", {
        limit: 1,
      })) {
        seen.push(item);
      }
    })().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect((err as NovaraFlexApiError).method).toBe(
      "completedtrainings.v2.list",
    );
    expect((err as NovaraFlexApiError).code).toBe("server_error");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe(`${BASE_URL}/completedtrainings.v2.list`);
  });

  it.each([
    ["missing", { ok: true, paging: { total: 1, last_page: 1 } }],
    ["not an array", { ok: true, projects: { id: 1 } }],
    ["null", { ok: true, projects: null }],
  ])(
    "throws invalid_envelope when the item container is %s",
    async (_label, body) => {
      const { client, calls } = createClient(() => jsonResponse(body));
      for (const iterable of [
        paginate(client, "projects.list"),
        paginate(client, "projects.list").pages(),
      ]) {
        const err = await collect(iterable as AsyncIterable<unknown>).catch(
          (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(NovaraFlexTransportError);
        const transport = err as NovaraFlexTransportError;
        expect(transport.reason).toBe("invalid_envelope");
        expect(transport.method).toBe("projects.list");
        expect(transport.message).toBe(
          'Novara Flex projects.list: page 1 has no "projects" array',
        );
        expect(transport.message).not.toContain(TOKEN);
      }
      expect(calls).toHaveLength(2);
    },
  );

  it("gets the client's retries on every page", async () => {
    let failed = false;
    const { fetch, calls } = fakeFetch((capture) => {
      if (bodyOf(capture).page === 2 && !failed) {
        failed = true;
        return new Response("upstream down", { status: 503 });
      }
      return byPage(THREE_PAGES)(capture);
    });
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      baseUrl: BASE_URL,
      timeoutMs: 0,
      retry: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
    });
    const items = await collect(
      paginate(client, "projects.list", { limit: 2 }),
    );

    expect(items.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
    expect(requestedPages(calls)).toEqual([1, 2, 2, 3]);
  });

  it("keeps the client out of the paginator's serialization", () => {
    const { client } = createClient(byPage(THREE_PAGES));
    const paginator = paginate(client, "projects.list");
    expect(JSON.stringify(paginator)).not.toContain(TOKEN);
    expect(Object.keys(paginator)).toEqual([]);
  });
});

describe("paginator.count", () => {
  /** A one-item `projects.list` page reporting `total` matches. */
  function countPage(total: number): Record<string, unknown> {
    return projectsPage(total > 0 ? [1] : [], {
      total,
      last_page: total,
    });
  }

  it("sends exactly one request with limit 1 and page 1", async () => {
    const { client, calls } = createClient(() => jsonResponse(countPage(42)));
    const controller = new AbortController();
    const total = await paginate(
      client,
      "responses.list",
      { form_id: 3987, after: 1_700_000_000_000, limit: 250, page: 7 },
      { signal: controller.signal },
    ).count();

    expect(total).toBe(42);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/responses.list`);
    expect(bodyOf(calls[0])).toEqual({
      form_id: 3987,
      after: 1_700_000_000_000,
      limit: 1,
      page: 1,
      token: TOKEN,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("keeps skip_field_id_mapping_json as given for responses.flat", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse({ ok: true, responses: [], paging: { total: 3 } }),
    );
    await paginate(client, "responses.flat", { form_id: 1 }).count();
    await paginate(client, "responses.flat", {
      form_id: 1,
      skip_field_id_mapping_json: true,
    }).count();

    expect(bodyOf(calls[0])).toEqual({
      form_id: 1,
      limit: 1,
      page: 1,
      token: TOKEN,
    });
    expect(bodyOf(calls[1])).toEqual({
      form_id: 1,
      skip_field_id_mapping_json: true,
      limit: 1,
      page: 1,
      token: TOKEN,
    });
  });

  it.each([0, 1, 12_345])("resolves to paging.total %i", async (total) => {
    const { client } = createClient(() => jsonResponse(countPage(total)));
    expect(await paginate(client, "projects.list").count()).toBe(total);
  });

  it.each([
    ["paging is missing", { ok: true, projects: [] }, '"paging" object'],
    [
      "paging is null",
      { ok: true, projects: [], paging: null },
      '"paging" object',
    ],
    [
      "total is missing",
      { ok: true, projects: [], paging: { last_page: 1 } },
      '"paging.total"',
    ],
    [
      "total is not an integer",
      { ok: true, projects: [], paging: { total: 1.5 } },
      '"paging.total"',
    ],
    [
      "total is negative",
      { ok: true, projects: [], paging: { total: -1 } },
      '"paging.total"',
    ],
    [
      "total is a string",
      { ok: true, projects: [], paging: { total: "7" } },
      '"paging.total"',
    ],
  ])("throws invalid_envelope when %s", async (_label, body, key) => {
    const { client, calls } = createClient(() => jsonResponse(body));
    const err = await paginate(client, "projects.list")
      .count()
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    const transport = err as NovaraFlexTransportError;
    expect(transport.reason).toBe("invalid_envelope");
    expect(transport.method).toBe("projects.list");
    expect(transport.message).toContain("Novara Flex projects.list");
    expect(transport.message).toContain(key);
    expect(transport.message).not.toContain("1.5");
    expect(transport.message).not.toContain("-1");
    expect(transport.message).not.toContain(TOKEN);
    expect(calls).toHaveLength(1);
  });

  it("propagates an API error with the vendor method name", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "parameter_invalid" }),
    );
    const err = await paginate(client, "completedtrainings.v2.list")
      .count()
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect((err as NovaraFlexApiError).method).toBe(
      "completedtrainings.v2.list",
    );
    expect((err as NovaraFlexApiError).code).toBe("parameter_invalid");
  });

  it("rethrows the caller's abort reason unchanged", async () => {
    const reason = new Error("caller gave up");
    const { client, calls } = createClient(() => jsonResponse(countPage(1)));
    const err = await paginate(client, "projects.list", undefined, {
      signal: AbortSignal.abort(reason),
    })
      .count()
      .catch((e: unknown) => e);

    expect(err).toBe(reason);
    expect(calls).toHaveLength(0);
  });

  it("rethrows an abort that lands while the request is in flight", async () => {
    const reason = new Error("caller gave up mid-request");
    const controller = new AbortController();
    const { client, calls } = createClient(({ init }) => {
      controller.abort(reason);
      return untilAborted(init?.signal);
    });
    const err = await paginate(client, "projects.list", undefined, {
      signal: controller.signal,
    })
      .count()
      .catch((e: unknown) => e);

    expect(err).toBe(reason);
    expect(calls).toHaveLength(1);
  });

  it("sends a fresh request every time it is called", async () => {
    let total = 0;
    const { client, calls } = createClient(() =>
      jsonResponse(countPage(++total)),
    );
    const paginator = paginate(client, "projects.list");

    expect(await paginator.count()).toBe(1);
    expect(await paginator.count()).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it("leaves a later walk untouched", async () => {
    const { client, calls } = createClient(byPage(THREE_PAGES));
    const paginator = paginate(client, "projects.list", { limit: 2 });

    expect(await paginator.count()).toBe(5);
    const items = await collect(paginator);

    expect(items.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
    expect(calls.map((c) => bodyOf(c).limit)).toEqual([1, 2, 2, 2]);
    expect(requestedPages(calls)).toEqual([1, 1, 2, 3]);
  });

  it("gets the client's retries", async () => {
    let failed = false;
    const { fetch, calls } = fakeFetch(() => {
      if (!failed) {
        failed = true;
        return new Response("upstream down", { status: 503 });
      }
      return jsonResponse(countPage(9));
    });
    const client = new NovaraFlexClient({
      token: TOKEN,
      fetch,
      baseUrl: BASE_URL,
      timeoutMs: 0,
      retry: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
    });

    expect(await paginate(client, "projects.list").count()).toBe(9);
    expect(calls).toHaveLength(2);
  });
});

describe("count through every …All method", () => {
  const { client, calls } = createClient(() =>
    jsonResponse({ ok: true, paging: { total: 4, last_page: 4 } }),
  );

  it.each<[string, () => NovaraFlexPaginator<unknown, unknown>]>([
    ["projects.list", () => client.projects.listAll()],
    ["contractors.list", () => client.contractors.listAll()],
    [
      "contractor-requirements.list",
      () => client.contractorRequirements.listAll(),
    ],
    ["responses.list", () => client.responses.listAll({ form_id: 1 })],
    ["responses.flat", () => client.responses.flatAll({ form_id: 1 })],
    ["followups.list", () => client.followups.listAll()],
    ["completedtrainings.v2.list", () => client.completedtrainings.listAll()],
    [
      "training-employee-status.list",
      () => client.trainingEmployeeStatus.listAll(),
    ],
    ["osha-hours.list", () => client.oshaHours.listAll()],
  ])("posts %s once with limit 1", async (method, paginator) => {
    calls.length = 0;
    expect(await paginator().count()).toBe(4);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/${method}`);
    expect(bodyOf(calls[0])).toMatchObject({ limit: 1, page: 1 });
  });

  it("covers every paged method", () => {
    expect(Object.keys(PAGED_METHODS)).toHaveLength(9);
  });
});

describe("paginate over responses.flat", () => {
  const FORM_ID = 3987;

  /** A per-page field-ID to field-title mapping row, as the vendor sends it. */
  function mapping(page: number): Record<string, string> {
    return { f1: "Title 1", [`p${page}`]: `Only on page ${page}` };
  }

  /** A flattened data row. */
  function row(id: number): Record<string, number> {
    return { f1: id };
  }

  /** A `responses.flat` page body: the mapping row first unless skipped. */
  function flatPage(
    page: number,
    ids: readonly number[],
    lastPage: number,
    withMapping = true,
  ): Record<string, unknown> {
    const rows = ids.map(row);
    return {
      ok: true,
      responses:
        withMapping && ids.length > 0 ? [mapping(page), ...rows] : rows,
      paging: { total: 5, last_page: lastPage },
    };
  }

  const FLAT_PAGES = {
    1: flatPage(1, [1, 2], 3),
    2: flatPage(2, [3, 4], 3),
    3: flatPage(3, [5], 3),
  };

  it("yields response rows only, never a page's mapping row", async () => {
    const { client, calls } = createClient(byPage(FLAT_PAGES));
    const items = await collect(
      paginate(client, "responses.flat", { form_id: FORM_ID, limit: 2 }),
    );

    expect(items).toEqual([row(1), row(2), row(3), row(4), row(5)]);
    expect(requestedPages(calls)).toEqual([1, 2, 3]);
    expect(bodyOf(calls[0])).toEqual({
      form_id: FORM_ID,
      limit: 2,
      page: 1,
      token: TOKEN,
    });
  });

  it("drops the starting page's mapping row when it is not page 1", async () => {
    const { client } = createClient(byPage(FLAT_PAGES));
    const items = await collect(
      paginate(client, "responses.flat", {
        form_id: FORM_ID,
        limit: 2,
        page: 2,
      }),
    );
    expect(items).toEqual([row(3), row(4), row(5)]);
  });

  it("leaves every page's mapping row in pages()", async () => {
    const { client } = createClient(byPage(FLAT_PAGES));
    const pages = await collect(
      paginate(client, "responses.flat", {
        form_id: FORM_ID,
        limit: 2,
      }).pages(),
    );
    expect(pages).toEqual([FLAT_PAGES[1], FLAT_PAGES[2], FLAT_PAGES[3]]);
    expect(pages.map((page) => page.responses?.[0])).toEqual([
      mapping(1),
      mapping(2),
      mapping(3),
    ]);
    // Merging the page-scoped rows yields every column's title.
    expect(
      Object.assign({}, ...pages.map((page) => page.responses?.[0])),
    ).toEqual({
      f1: "Title 1",
      p1: "Only on page 1",
      p2: "Only on page 2",
      p3: "Only on page 3",
    });
  });

  it("strips nothing when skip_field_id_mapping_json is true", async () => {
    const { client } = createClient(
      byPage({
        1: flatPage(1, [1, 2], 2, false),
        2: flatPage(2, [3], 2, false),
      }),
    );
    const items = await collect(
      paginate(client, "responses.flat", {
        form_id: FORM_ID,
        limit: 2,
        skip_field_id_mapping_json: true,
      }),
    );
    expect(items).toEqual([row(1), row(2), row(3)]);
  });

  it("does not count a lone mapping row as data when paging is missing", async () => {
    const { client, calls } = createClient(
      byPage({
        1: { ok: true, responses: [mapping(1), row(1)] },
        2: { ok: true, responses: [mapping(2)] },
      }),
    );
    const items = await collect(
      paginate(client, "responses.flat", { form_id: FORM_ID, limit: 1 }),
    );
    expect(items).toEqual([row(1)]);
    expect(calls).toHaveLength(2);
  });

  it("requests a limit of 1000 by default", async () => {
    const { client, calls } = createClient(byPage({ 1: flatPage(1, [1], 1) }));
    await collect(paginate(client, "responses.flat", { form_id: FORM_ID }));
    expect(bodyOf(calls[0]).limit).toBe(1000);
  });
});

describe("PAGED_METHODS", () => {
  it("lists the nine paged methods with their live-confirmed maxima", () => {
    expect(PAGED_METHODS).toEqual({
      "projects.list": { items: "projects", maxLimit: 500 },
      "contractors.list": { items: "contractors", maxLimit: 1000 },
      "contractor-requirements.list": { items: "requirements", maxLimit: 500 },
      "responses.list": { items: "responses", maxLimit: 500 },
      "responses.flat": { items: "responses", maxLimit: 1000 },
      "followups.list": { items: "followups", maxLimit: 500 },
      "completedtrainings.v2.list": {
        items: "completedtrainings",
        maxLimit: 1000,
      },
      "training-employee-status.list": { items: "employees", maxLimit: 1000 },
      "osha-hours.list": { items: "hours", maxLimit: 1000 },
    });
  });
});

describe("paginate types", () => {
  const { client } = createClient(byPage(THREE_PAGES));

  it("infers the contract item and page types", () => {
    const paginator = paginate(client, "projects.list");
    expectTypeOf(paginator).toEqualTypeOf<
      NovaraFlexPaginator<
        NovaraSchema<"Project">,
        NovaraFlexResult<"projects.list">
      >
    >();
    expectTypeOf<PagedItem<"projects.list">>().toEqualTypeOf<
      NovaraSchema<"Project">
    >();
    expectTypeOf<PagedItem<"training-employee-status.list">>().toEqualTypeOf<
      NovaraSchema<"TrainingEmployeeStatus">
    >();
    expectTypeOf<PagedItem<"osha-hours.list">>().toEqualTypeOf<
      NovaraSchema<"OshaHoursEntry">
    >();
    expectTypeOf(paginator.pages()).toEqualTypeOf<
      AsyncIterable<NovaraFlexResult<"projects.list">>
    >();
  });

  it("counts to a Promise<number>", () => {
    expectTypeOf(paginate(client, "projects.list").count()).toEqualTypeOf<
      Promise<number>
    >();
    expectTypeOf<
      ReturnType<NovaraFlexPaginator<string, boolean>["count"]>
    >().toEqualTypeOf<Promise<number>>();
  });

  it("takes the same arguments as call", () => {
    // @ts-expect-error responses.list requires a `form_id`
    void paginate(client, "responses.list");
    // @ts-expect-error `bogus` is not a parameter of projects.list
    void paginate(client, "projects.list", { bogus: 1 });
    // @ts-expect-error users.list is not a paged method
    void paginate(client, "users.list");
  });
});
