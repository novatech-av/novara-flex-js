import { describe, expectTypeOf, it } from "vitest";
import type { NovaraFlexClient } from "./index.js";

/**
 * Type-level proof that the nested response shapes the vendor docs
 * describe reach the public response types, rather than `unknown` or an open
 * record. Types are derived from the public client only, the way a consumer
 * sees them.
 */

/** The success body a namespace method resolves to. */
type ResultOf<F> = F extends (...args: never[]) => Promise<infer R> ? R : never;

/** One element of an array-valued (possibly optional) property. */
type ElementOf<A> = NonNullable<A> extends readonly (infer E)[] ? E : never;

type Client = NovaraFlexClient;
type Response = ResultOf<Client["responses"]["info"]>["response"];
type Revision = NonNullable<Response["latest"]>;
type Answer = Revision["responses"][string];
type ResponseFollowup = ElementOf<Answer["fups"]>;
type EquipmentType = ElementOf<
  ResultOf<Client["equipmenttypes"]["list"]>["equipmenttypes"]
>;
type Schedule = ElementOf<EquipmentType["schedules"]>;
type Training = ElementOf<ResultOf<Client["trainings"]["list"]>["trainings"]>;

describe("nested response shapes", () => {
  it("types the latest revision of responses.info", () => {
    expectTypeOf<Revision["location"]>().not.toBeUnknown();
    expectTypeOf<
      NonNullable<Revision["location"]>["lat"]
    >().toEqualTypeOf<number>();
    expectTypeOf<
      NonNullable<Revision["location"]>["lon"]
    >().toEqualTypeOf<number>();
    // Null was observed on the wire for a response without a location.
    expectTypeOf<null>().toExtend<Revision["location"]>();

    expectTypeOf<Revision["weather"]>().not.toBeUnknown();
    expectTypeOf<Revision["weather"]["temperature"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<Revision["weather"]["icon"]>().toEqualTypeOf<
      string | undefined
    >();

    expectTypeOf<Revision["submitted_on"]>().toEqualTypeOf<number>();
    expectTypeOf<Revision["m_submitter_id"]>().toEqualTypeOf<string>();
  });

  it("types the answers but leaves an answer's value open", () => {
    expectTypeOf<Answer["value"]>().toBeUnknown();
    expectTypeOf<
      ElementOf<Answer["attachments"]>["key"]
    >().toEqualTypeOf<string>();
    expectTypeOf<ResponseFollowup["open"]>().toEqualTypeOf<boolean>();
    // An integer in a response, unlike the string followups.list sends.
    expectTypeOf<ResponseFollowup["followup_display_id"]>().toEqualTypeOf<
      number | undefined
    >();
  });

  it("types the follow-ups the docs show on a response and its revision", () => {
    type Item = ElementOf<ResultOf<Client["responses"]["list"]>["responses"]>;
    expectTypeOf<ElementOf<Item["fups"]>>().toEqualTypeOf<ResponseFollowup>();
    expectTypeOf<
      ElementOf<Revision["fups"]>
    >().toEqualTypeOf<ResponseFollowup>();
  });

  it("types equipment type schedules and their trigger", () => {
    type Trigger = NonNullable<Schedule["trigger"]>;
    expectTypeOf<Schedule["trigger"]>().not.toBeUnknown();
    expectTypeOf<Trigger["timing"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Trigger["frequencyInDays"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<Schedule["doRequireAttachments"]>().toEqualTypeOf<
      boolean | undefined
    >();
  });

  it("types a training's assignment condition", () => {
    type Data = NonNullable<Training["assigned_to_condition"]["data"]>;
    expectTypeOf<Training["assigned_to_condition"]["data"]>().not.toBeUnknown();
    expectTypeOf<Data["fieldId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<NonNullable<Data["settings"]>["values"]>().toEqualTypeOf<
      string[] | undefined
    >();
  });
});
