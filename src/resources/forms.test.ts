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

/** The form every request in this file asks about. */
const FORM_ID = 3987;

/** A minimal `forms.list` success body. */
const FORMS_BODY = {
  ok: true,
  forms: [
    {
      id: FORM_ID,
      name: "Safety Observation",
      description: "",
      folder_id: 7,
      sequence: 1,
      hidden: false,
      score: false,
      created: 1_500_000_000,
      updated: 1_500_000_100,
    },
  ],
};

/** A minimal `forms.info` success body, one field of the latest version included. */
const FORM_BODY = {
  ok: true,
  form: {
    ...FORMS_BODY.forms[0],
    latest: {
      version: 3,
      fields: [
        {
          id: "f1",
          title: "Location",
          shortTitle: "Loc",
          type: "text",
          description: "",
          required: true,
          settings: {},
        },
      ],
    },
  },
};

describe("flex.forms.list", () => {
  it("posts to baseUrl/forms.list with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(FORMS_BODY));
    await client.forms.list();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/forms.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });

  it("forwards pretty and never lets params override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(FORMS_BODY));
    await client.forms.list({ pretty: true });
    expect(bodyOf(calls[0])).toEqual({ pretty: true, token: TOKEN });

    await client.forms.list({ token: "attacker-supplied" } as unknown as {
      pretty?: boolean;
    });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(FORMS_BODY));
    const controller = new AbortController();
    await client.forms.list(undefined, { signal: controller.signal });
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(FORMS_BODY));
    const result = await client.forms.list();

    expect(result).toEqual(FORMS_BODY);
    expect(result.ok).toBe(true);
    expect(result.forms).toEqual(FORMS_BODY.forms);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.forms
      .list()
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("forms.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.forms
      .list()
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("forms.list");
    expect(err.message).toBe(
      "Novara Flex forms.list: returned a non-JSON body",
    );
  });
});

describe("flex.forms.info", () => {
  it("posts form_id to baseUrl/forms.info with the injected token", async () => {
    const { client, calls } = createClient(() => jsonResponse(FORM_BODY));
    await client.forms.info({ form_id: FORM_ID });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/forms.info`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({ form_id: FORM_ID, token: TOKEN });
  });

  it("forwards include_versions and an abort signal, and keeps the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(FORM_BODY));
    const controller = new AbortController();
    await client.forms.info(
      { form_id: FORM_ID, include_versions: true, pretty: true },
      { signal: controller.signal },
    );

    expect(bodyOf(calls[0])).toEqual({
      form_id: FORM_ID,
      include_versions: true,
      pretty: true,
      token: TOKEN,
    });
    expect(calls[0]?.init?.signal).toBe(controller.signal);

    await client.forms.info({
      form_id: FORM_ID,
      token: "attacker-supplied",
    } as unknown as { form_id: number });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("returns the whole success body, with the field definitions reachable", async () => {
    const { client } = createClient(() => jsonResponse(FORM_BODY));
    const result = await client.forms.info({ form_id: FORM_ID });

    expect(result).toEqual(FORM_BODY);
    expect(result.ok).toBe(true);
    expect(result.form.latest?.version).toBe(3);
    expect(result.form.latest.fields[0]?.id).toBe("f1");
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "content_not_found" }),
    );
    const err = (await client.forms
      .info({ form_id: 404 })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("content_not_found");
    expect(err.method).toBe("forms.info");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.forms
      .info({ form_id: FORM_ID })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("forms.info");
    expect(err.message).toBe(
      "Novara Flex forms.info: returned a non-JSON body",
    );
  });
});

describe("flex.forms types", () => {
  const { client } = createClient(() => jsonResponse(FORMS_BODY));

  it("makes params optional for forms.list and required for forms.info", () => {
    void client.forms.list();
    void client.forms.list({ pretty: true });
    void client.forms.info({ form_id: FORM_ID });
    void client.forms.info({
      form_id: FORM_ID,
      include_versions: false,
      pretty: true,
    });
    // @ts-expect-error forms.info requires a `form_id`
    void client.forms.info();
    // @ts-expect-error forms.info requires a `form_id`
    void client.forms.info({ include_versions: true });
    // @ts-expect-error forms.info takes the vendor's `form_id`, not `id`
    void client.forms.info({ id: FORM_ID });
    // @ts-expect-error `form_id` is an integer, not a string
    void client.forms.info({ form_id: "3987" });
    void client.forms.info({
      form_id: FORM_ID,
      // @ts-expect-error `include_versions` is a boolean
      include_versions: "yes",
    });
    // @ts-expect-error `bogus` is not a parameter of forms.list
    void client.forms.list({ bogus: 1 });
    // @ts-expect-error the token is supplied by the client, not the caller
    void client.forms.list({ token: "override" });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(client.forms.list()).resolves.toEqualTypeOf<
      NovaraFlexResult<"forms.list">
    >();
    expectTypeOf(
      client.forms.info({ form_id: FORM_ID }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"forms.info">>();
    expectTypeOf(client.forms.list()).toEqualTypeOf(client.call("forms.list"));
    expectTypeOf(client.forms.info({ form_id: FORM_ID })).toEqualTypeOf(
      client.call("forms.info", { form_id: FORM_ID }),
    );
  });
});
