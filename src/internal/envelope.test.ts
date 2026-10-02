import { describe, expect, it } from "vitest";
import { classifyEnvelope } from "./envelope.js";

describe("classifyEnvelope", () => {
  const invalid: ReadonlyArray<[string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["an array", []],
    ["a populated array", [{ ok: true }]],
    ["a string", "ok"],
    ["a number", 200],
    ["a boolean", true],
    ["an empty object", {}],
    ["a non-boolean ok", { ok: "yes" }],
    ["ok: false without an error code", { ok: false }],
    ["ok: false with a non-string error", { ok: false, error: 42 }],
    ["ok: false with a null error", { ok: false, error: null }],
    ["a truthy but non-literal ok", { ok: 1 }],
  ];

  for (const [label, body] of invalid) {
    it(`classifies ${label} as invalid`, () => {
      expect(classifyEnvelope(body)).toEqual({ kind: "invalid" });
    });
  }

  it("classifies ok: true as success and passes the body through", () => {
    const body = { ok: true, pong: true };
    expect(classifyEnvelope(body)).toEqual({ kind: "success", body });
  });

  it("keeps the whole body on a success, including unknown keys", () => {
    const result = classifyEnvelope({ ok: true, extra: [1, 2], paging: {} });
    expect(result).toMatchObject({ kind: "success" });
    if (result.kind !== "success") throw new Error("unreachable");
    expect(result.body).toEqual({ ok: true, extra: [1, 2], paging: {} });
  });

  it("classifies ok: false with a string error as an error", () => {
    expect(
      classifyEnvelope({
        ok: false,
        error: "token_invalid",
        description: "no",
      }),
    ).toEqual({ kind: "error", code: "token_invalid", description: "no" });
  });

  it("leaves the description undefined when it is absent", () => {
    expect(classifyEnvelope({ ok: false, error: "server_error" })).toEqual({
      kind: "error",
      code: "server_error",
      description: undefined,
    });
  });

  it("ignores a non-string description", () => {
    expect(
      classifyEnvelope({ ok: false, error: "server_error", description: 7 }),
    ).toEqual({ kind: "error", code: "server_error", description: undefined });
  });

  it("accepts an error code that is not in the contract's enum", () => {
    expect(classifyEnvelope({ ok: false, error: "invalid_token" })).toEqual({
      kind: "error",
      code: "invalid_token",
      description: undefined,
    });
  });
});
