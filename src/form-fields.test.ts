import { describe, expect, expectTypeOf, it } from "vitest";
import type { NovaraFlexClient } from "./index.js";

/**
 * Type-level proof that `forms.info` field definitions reach the
 * public response type as a discriminated union on `type`: checking `type`
 * narrows `settings` to that type's shape. Types are derived from the public
 * client only, the way a consumer sees them.
 */

/** The success body a namespace method resolves to. */
type ResultOf<F> = F extends (...args: never[]) => Promise<infer R> ? R : never;

/** One element of an array-valued (possibly optional) property. */
type ElementOf<A> = NonNullable<A> extends readonly (infer E)[] ? E : never;

type FormDetail = ResultOf<NovaraFlexClient["forms"]["info"]>["form"];
type FormField = ElementOf<FormDetail["latest"]["fields"]>;
type SettingsOf<T extends FormField["type"]> = Extract<
  FormField,
  { type: T }
>["settings"];

/** The open settings object of a type whose settings the contract leaves untyped. */
type OpenSettings = { [key: string]: unknown };

/** A minimal select field, as `forms.info` might send it. */
const selectField: FormField = {
  id: "field-1",
  title: "Choice",
  shortTitle: "",
  required: false,
  description: "",
  type: "select",
  settings: {
    style: "select",
    multiple: false,
    items: [{ label: "Yes", value: "yes", score: null }],
    sourceId: "",
  },
};

describe("form field definitions", () => {
  it("closes the type discriminant over the observed field types", () => {
    expectTypeOf<FormField["type"]>().toEqualTypeOf<
      | "attachments"
      | "calculation"
      | "checkbox"
      | "counter"
      | "datetime"
      | "description"
      | "followup"
      | "groupsignature"
      | "heading"
      | "select"
      | "sketch"
      | "subreport"
      | "text"
    >();
  });

  it("narrows settings when the type is checked", () => {
    const field = selectField as FormField;
    if (field.type === "select") {
      expectTypeOf(field.settings.style).toEqualTypeOf<string>();
      expectTypeOf(field.settings.multiple).toEqualTypeOf<boolean>();
      expectTypeOf(field.settings.sourceId).toEqualTypeOf<
        string | number | undefined
      >();
      const [option] = field.settings.items;
      expectTypeOf(option?.label).toEqualTypeOf<string | undefined>();
      expectTypeOf(option?.score).toEqualTypeOf<number | null | undefined>();
      expect(field.settings.items).toHaveLength(1);
    } else {
      expect.unreachable("the select field did not narrow");
    }
  });

  it("types the settings of every common field type", () => {
    expectTypeOf<SettingsOf<"text">["texttype"]>().toEqualTypeOf<string>();
    expectTypeOf<SettingsOf<"text">["keyboardtype"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<SettingsOf<"checkbox">["inputtype"]>().toEqualTypeOf<string>();
    expectTypeOf<
      SettingsOf<"description">["description"]
    >().toEqualTypeOf<string>();
    expectTypeOf<SettingsOf<"datetime">["date"]>().toEqualTypeOf<boolean>();
    expectTypeOf<SettingsOf<"datetime">["time"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<
      SettingsOf<"groupsignature">["pinToProfile"]
    >().toEqualTypeOf<boolean>();
    expectTypeOf<SettingsOf<"attachments">["visibility"]>().toEqualTypeOf<
      string | undefined
    >();
    type Mark = ElementOf<SettingsOf<"sketch">["marks"]>;
    expectTypeOf<ElementOf<Mark["points"]>["x"]>().toEqualTypeOf<number>();
  });

  it("keeps the settings of rare field types open", () => {
    expectTypeOf<SettingsOf<"heading">>().toEqualTypeOf<OpenSettings>();
    expectTypeOf<SettingsOf<"counter">>().toEqualTypeOf<OpenSettings>();
    expectTypeOf<SettingsOf<"calculation">>().toEqualTypeOf<OpenSettings>();
    expectTypeOf<SettingsOf<"followup">>().toEqualTypeOf<OpenSettings>();
    expectTypeOf<SettingsOf<"subreport">>().toEqualTypeOf<OpenSettings>();
  });

  it("describes earlier versions with the same field union", () => {
    type Version = ElementOf<FormDetail["versions"]>;
    expectTypeOf<ElementOf<Version["fields"]>>().toEqualTypeOf<FormField>();
    // A typed settings key is not reachable before the type is checked.
    function styleOf(field: FormField): string {
      // @ts-expect-error `style` belongs to select settings only.
      return field.settings.style;
    }
    expect(styleOf(selectField)).toBe("select");
  });
});
