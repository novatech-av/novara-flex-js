import { describe, expectTypeOf, it } from "vitest";
import type {
  NovaraApiError,
  NovaraMethod,
  NovaraMethodName,
  NovaraPaging,
  NovaraRequest,
  NovaraRequestFor,
  NovaraResponse,
  NovaraSchema,
  NovaraSuccess,
  NovaraSuccessFor,
} from "./contract.js";

/** `true` when `K` is a required property of `T`. */
type IsRequired<T, K extends keyof T> =
  object extends Pick<T, K> ? false : true;

describe("generated contract", () => {
  it("exposes method URLs as keys", () => {
    expectTypeOf<"/account.info">().toExtend<NovaraMethod>();
    expectTypeOf<"/users.list">().toExtend<NovaraMethod>();
  });

  it("requires a token on every request body", () => {
    expectTypeOf<NovaraRequest<"/account.info">>().toExtend<{
      token: string;
    }>();
    expectTypeOf<
      IsRequired<NovaraRequest<"/account.info">, "token">
    >().toEqualTypeOf<true>();
    expectTypeOf<NovaraRequest<"/users.list">>().toExtend<{ token: string }>();
  });

  it("models the HTTP 200 response as success | error", () => {
    expectTypeOf<NovaraApiError>().toExtend<NovaraResponse<"/account.info">>();
    expectTypeOf<NovaraApiError["ok"]>().toEqualTypeOf<false>();
  });

  it("narrows the success member of a response", () => {
    expectTypeOf<NovaraSuccess<"/account.info">>().toExtend<{ ok: true }>();
    expectTypeOf<NovaraSuccess<"/account.info">>().toExtend<{
      account: NovaraSchema<"Account">;
    }>();
  });

  it("exposes method names without the leading slash", () => {
    expectTypeOf<"api.ping">().toExtend<NovaraMethodName>();
    expectTypeOf<"users.list">().toExtend<NovaraMethodName>();
    expectTypeOf<"/api.ping">().not.toExtend<NovaraMethodName>();
  });

  it("maps a method name back to its request and success types", () => {
    expectTypeOf<NovaraRequestFor<"api.ping">>().toExtend<{ token: string }>();
    expectTypeOf<NovaraSuccessFor<"account.info">>().toExtend<{ ok: true }>();
  });

  it("exposes shared schemas", () => {
    expectTypeOf<NovaraPaging>().toExtend<{ total?: number }>();
  });
});
