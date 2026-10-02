import { describe, expectTypeOf, it } from "vitest";
import type { NovaraFlexClient } from "./index.js";

/**
 * Type-level proof that properties the contract marks required reach
 * the public response types as non-optional. Types are derived from the public
 * client only, the way a consumer sees them.
 */

/** The success body a namespace method resolves to. */
type ResultOf<F> = F extends (...args: never[]) => Promise<infer R> ? R : never;

/** One element of an array-valued property. */
type ElementOf<A> = A extends readonly (infer E)[] ? E : never;

type Client = NovaraFlexClient;
type Form = ElementOf<ResultOf<Client["forms"]["list"]>["forms"]>;
type User = ElementOf<ResultOf<Client["users"]["list"]>["users"]>;
type Project = ElementOf<ResultOf<Client["projects"]["list"]>["projects"]>;
type Followup = ElementOf<ResultOf<Client["followups"]["list"]>["followups"]>;
type Training = ElementOf<ResultOf<Client["trainings"]["list"]>["trainings"]>;
type Role = ElementOf<ResultOf<Client["roles"]["list"]>["roles"]>;
type DataList = ElementOf<ResultOf<Client["datalists"]["list"]>["datalists"]>;

describe("required response properties", () => {
  it("types forms.list ids and names as present", () => {
    expectTypeOf<Form["id"]>().toEqualTypeOf<number>();
    expectTypeOf<Form["name"]>().toEqualTypeOf<string>();
    // Present-but-null: required, and still nullable.
    expectTypeOf<Form["folder_id"]>().toEqualTypeOf<number | null>();
  });

  it("types the ids and names of other lists as present", () => {
    expectTypeOf<User["id"]>().toEqualTypeOf<string>();
    expectTypeOf<User["email"]>().toEqualTypeOf<string>();
    expectTypeOf<Project["id"]>().toEqualTypeOf<number>();
    expectTypeOf<Project["name"]>().toEqualTypeOf<string>();
    expectTypeOf<Followup["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Training["id"]>().toEqualTypeOf<number>();
    expectTypeOf<Training["title"]>().toEqualTypeOf<string>();
    expectTypeOf<Role["id"]>().toEqualTypeOf<string>();
    expectTypeOf<DataList["title"]>().toEqualTypeOf<string>();
  });

  it("requires paging on paged results", () => {
    type Page = ResultOf<Client["projects"]["list"]>;
    expectTypeOf<Page["paging"]["total"]>().toEqualTypeOf<number>();
    expectTypeOf<Page["paging"]["last_page"]>().toEqualTypeOf<number>();
  });

  it("leaves properties outside the evidence optional", () => {
    // Sent only behind the followup_display_id request flag.
    expectTypeOf<Followup>().toHaveProperty("followup_display_id");
    expectTypeOf<Pick<Followup, "followup_display_id">>().toEqualTypeOf<{
      followup_display_id?: string;
    }>();
    // Absent from responses.list, so optional on the shared schema.
    type Response = ElementOf<
      ResultOf<Client["responses"]["list"]>["responses"]
    >;
    type Revision = NonNullable<Response["latest"]>;
    expectTypeOf<Pick<Response, "latest">>().toEqualTypeOf<{
      latest?: Revision;
    }>();
  });
});
