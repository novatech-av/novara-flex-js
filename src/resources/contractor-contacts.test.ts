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

/** The contractor every request in this file asks about. */
const CONTRACTOR_ID = "D2EEA9E5-3E10-44BC-92EC-50B587B83019";

/** A minimal `contractor-contacts.list` success body. */
const CONTACTS_BODY = {
  ok: true,
  contacts: [
    {
      id: "c1",
      firstname: "Ada",
      lastname: "Lovelace",
      email: "ada@example.test",
      phone: "555-0100",
      title: "Example Contact Title",
      mine: true,
    },
  ],
};

describe("flex.contractorContacts.list", () => {
  it("posts the contractor to baseUrl/contractor-contacts.list with the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(CONTACTS_BODY));
    await client.contractorContacts.list({ contractor_id: CONTRACTOR_ID });

    expect(calls).toHaveLength(1);
    // The camelCased namespace does not change the vendor's method name.
    expect(calls[0]?.url).toBe(`${BASE_URL}/contractor-contacts.list`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({
      contractor_id: CONTRACTOR_ID,
      token: TOKEN,
    });
  });

  it("forwards the filters and never lets params override the token", async () => {
    const { client, calls } = createClient(() => jsonResponse(CONTACTS_BODY));
    await client.contractorContacts.list({
      contractor_id: CONTRACTOR_ID,
      only_mine: true,
      pretty: true,
    });
    expect(bodyOf(calls[0])).toEqual({
      contractor_id: CONTRACTOR_ID,
      only_mine: true,
      pretty: true,
      token: TOKEN,
    });

    await client.contractorContacts.list({
      contractor_id: CONTRACTOR_ID,
      token: "attacker-supplied",
    } as unknown as { contractor_id: string });
    expect(bodyOf(calls[1]).token).toBe(TOKEN);
  });

  it("forwards an abort signal", async () => {
    const { client, calls } = createClient(() => jsonResponse(CONTACTS_BODY));
    const controller = new AbortController();
    await client.contractorContacts.list(
      { contractor_id: CONTRACTOR_ID },
      { signal: controller.signal },
    );
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it("returns the whole success body, not an unwrapped array", async () => {
    const { client } = createClient(() => jsonResponse(CONTACTS_BODY));
    const result = await client.contractorContacts.list({
      contractor_id: CONTRACTOR_ID,
    });

    expect(result).toEqual(CONTACTS_BODY);
    expect(result.ok).toBe(true);
    expect(result.contacts).toEqual(CONTACTS_BODY.contacts);
  });

  it("throws a NovaraFlexApiError naming the vendor method", async () => {
    const { client } = createClient(() =>
      jsonResponse({ ok: false, error: "token_permission" }),
    );
    const err = (await client.contractorContacts
      .list({ contractor_id: CONTRACTOR_ID })
      .catch((e: unknown) => e)) as NovaraFlexApiError;

    expect(err).toBeInstanceOf(NovaraFlexApiError);
    expect(err.code).toBe("token_permission");
    expect(err.method).toBe("contractor-contacts.list");
    expect(err.message).not.toContain(TOKEN);
  });

  it("throws a NovaraFlexTransportError for a non-JSON body", async () => {
    const { client } = createClient(
      () => new Response("<html>nope</html>", { status: 200 }),
    );
    const err = (await client.contractorContacts
      .list({ contractor_id: CONTRACTOR_ID })
      .catch((e: unknown) => e)) as NovaraFlexTransportError;

    expect(err).toBeInstanceOf(NovaraFlexTransportError);
    expect(err.method).toBe("contractor-contacts.list");
    expect(err.message).toBe(
      "Novara Flex contractor-contacts.list: returned a non-JSON body",
    );
  });
});

describe("flex.contractorContacts types", () => {
  const { client } = createClient(() => jsonResponse(CONTACTS_BODY));

  it("requires contractor_id and constrains the optional filters", () => {
    void client.contractorContacts.list({ contractor_id: CONTRACTOR_ID });
    void client.contractorContacts.list({
      contractor_id: CONTRACTOR_ID,
      only_mine: false,
      pretty: true,
    });
    // @ts-expect-error contractor-contacts.list requires a `contractor_id`
    void client.contractorContacts.list();
    // @ts-expect-error contractor-contacts.list requires a `contractor_id`
    void client.contractorContacts.list({ only_mine: true });
    // @ts-expect-error `contractor_id` is a string, not a number
    void client.contractorContacts.list({ contractor_id: 21 });
    void client.contractorContacts.list({
      contractor_id: CONTRACTOR_ID,
      // @ts-expect-error `only_mine` is a boolean, not a string
      only_mine: "yes",
    });
    void client.contractorContacts.list({
      contractor_id: CONTRACTOR_ID,
      // @ts-expect-error `bogus` is not a parameter of contractor-contacts.list
      bogus: 1,
    });
    void client.contractorContacts.list({
      contractor_id: CONTRACTOR_ID,
      // @ts-expect-error the token is supplied by the client, not the caller
      token: "override",
    });
  });

  it("returns exactly what call returns for the same method", () => {
    expectTypeOf(
      client.contractorContacts.list({ contractor_id: CONTRACTOR_ID }),
    ).resolves.toEqualTypeOf<NovaraFlexResult<"contractor-contacts.list">>();
    expectTypeOf(
      client.contractorContacts.list({ contractor_id: CONTRACTOR_ID }),
    ).toEqualTypeOf(
      client.call("contractor-contacts.list", {
        contractor_id: CONTRACTOR_ID,
      }),
    );
  });
});
