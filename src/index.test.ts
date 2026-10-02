import { describe, expect, expectTypeOf, it } from "vitest";
import * as sdk from "./index.js";
import {
  NovaraFlexApiError,
  type NovaraFlexAttachment,
  NovaraFlexClient,
  type NovaraFlexCsvPage,
  NovaraFlexError,
  type NovaraFlexPaginator,
  NovaraFlexRateLimitError,
  NovaraFlexTransportError,
  SDK_NAME,
  SDK_VERSION,
} from "./index.js";

describe("public entry point", () => {
  it("exposes the SDK name", () => {
    expect(SDK_NAME).toBe("novara-flex-js");
  });

  // The value itself is pinned to package.json by src/version.test.ts.
  it("exposes the SDK version", () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exposes the client class", () => {
    expect(typeof NovaraFlexClient).toBe("function");
  });

  it("exposes the error classes", () => {
    expect(typeof NovaraFlexError).toBe("function");
    expect(typeof NovaraFlexApiError).toBe("function");
    expect(typeof NovaraFlexTransportError).toBe("function");
    expect(typeof NovaraFlexRateLimitError).toBe("function");
    expect(Object.getPrototypeOf(NovaraFlexApiError)).toBe(NovaraFlexError);
    expect(Object.getPrototypeOf(NovaraFlexRateLimitError)).toBe(
      NovaraFlexApiError,
    );
    expect(Object.getPrototypeOf(NovaraFlexTransportError)).toBe(
      NovaraFlexError,
    );
  });

  it("exposes the paginator type the listAll methods return", () => {
    const flex = new NovaraFlexClient({ token: "t" });
    expectTypeOf(flex.projects.listAll()).toExtend<
      NovaraFlexPaginator<unknown, unknown>
    >();
    expectTypeOf<NovaraFlexPaginator<number, string>>().toExtend<
      AsyncIterable<number>
    >();
    expectTypeOf<
      ReturnType<NovaraFlexPaginator<number, string>["pages"]>
    >().toEqualTypeOf<AsyncIterable<string>>();
    expectTypeOf(flex.responses.flatAll({ form_id: 1 }).count()).toEqualTypeOf<
      Promise<number>
    >();
  });

  it("exposes the result types of the CSV and attachment methods", () => {
    const flex = new NovaraFlexClient({ token: "t" });
    expectTypeOf(flex.responses.flatCsv({ form_id: 1 })).toEqualTypeOf<
      Promise<NovaraFlexCsvPage>
    >();
    expectTypeOf(flex.oshaHours.listCsv()).toEqualTypeOf<
      Promise<NovaraFlexCsvPage>
    >();
    expectTypeOf(flex.attachment.load({ key: "k" })).toEqualTypeOf<
      Promise<NovaraFlexAttachment>
    >();
  });

  it("exports nothing else at runtime", () => {
    expect(Object.keys(sdk).sort()).toEqual([
      "NovaraFlexApiError",
      "NovaraFlexClient",
      "NovaraFlexError",
      "NovaraFlexRateLimitError",
      "NovaraFlexTransportError",
      "SDK_NAME",
      "SDK_VERSION",
    ]);
  });
});
