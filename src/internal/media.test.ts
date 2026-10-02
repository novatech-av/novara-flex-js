import { describe, expect, it } from "vitest";
import {
  CSV_LAST_PAGE_HEADER,
  CSV_TOTAL_HEADER,
  isRedirectStatus,
  MAX_REDIRECTS,
  mediaTypeOf,
  parseCsvPaging,
  printableMediaType,
  resolveRedirect,
} from "./media.js";

describe("mediaTypeOf", () => {
  it("lower-cases and drops parameters and whitespace", () => {
    expect(mediaTypeOf("text/csv")).toBe("text/csv");
    expect(mediaTypeOf("Text/CSV; charset=utf-8")).toBe("text/csv");
    expect(mediaTypeOf("  application/JSON ;charset=UTF-8")).toBe(
      "application/json",
    );
  });

  it("is empty for a missing or empty header", () => {
    expect(mediaTypeOf(null)).toBe("");
    expect(mediaTypeOf(undefined)).toBe("");
    expect(mediaTypeOf("")).toBe("");
    expect(mediaTypeOf(" ; charset=utf-8")).toBe("");
  });
});

describe("printableMediaType", () => {
  it("passes a plain type/subtype", () => {
    expect(printableMediaType("image/jpeg")).toBe("image/jpeg");
    expect(printableMediaType("application/vnd.ms-excel")).toBe(
      "application/vnd.ms-excel",
    );
    expect(printableMediaType("image/svg+xml")).toBe("image/svg+xml");
  });

  it("refuses anything else", () => {
    for (const value of ["", "text", "not a media type", "a/b/c", "a/b c"]) {
      expect(printableMediaType(value), value).toBeUndefined();
    }
  });
});

describe("parseCsvPaging", () => {
  const headers = (total?: string, lastPage?: string): Headers => {
    const h = new Headers();
    if (total !== undefined) h.set(CSV_TOTAL_HEADER, total);
    if (lastPage !== undefined) h.set(CSV_LAST_PAGE_HEADER, lastPage);
    return h;
  };

  it("reads the novaraflex- pair", () => {
    expect(CSV_TOTAL_HEADER).toBe("novaraflex-total-results");
    expect(CSV_LAST_PAGE_HEADER).toBe("novaraflex-last-page");
    expect(parseCsvPaging(headers("57", "6"))).toEqual({
      total: 57,
      last_page: 6,
    });
    expect(parseCsvPaging(headers(" 0 ", "0"))).toEqual({
      total: 0,
      last_page: 0,
    });
  });

  it("is undefined unless both are non-negative integers", () => {
    for (const [total, lastPage] of [
      [undefined, undefined],
      ["57", undefined],
      [undefined, "6"],
      ["", "6"],
      ["57", "-1"],
      ["5.5", "6"],
      ["1e3", "6"],
      ["0x10", "6"],
      ["57", "six"],
      ["99999999999999999999", "6"],
    ] as const) {
      expect(parseCsvPaging(headers(total, lastPage))).toBeUndefined();
    }
  });
});

describe("isRedirectStatus", () => {
  it("is true for the statuses that redirect to a Location", () => {
    for (const status of [301, 302, 303, 307, 308]) {
      expect(isRedirectStatus(status)).toBe(true);
    }
    for (const status of [200, 300, 304, 305, 306, 309, 400, 0]) {
      expect(isRedirectStatus(status)).toBe(false);
    }
  });

  it("caps a chain at five hops", () => {
    expect(MAX_REDIRECTS).toBe(5);
  });
});

describe("resolveRedirect", () => {
  const from = new URL("https://api.example.test/v1/attachment.load");

  it("resolves absolute and relative https targets", () => {
    expect(
      resolveRedirect("https://files.example.test/a?sig=1", from, false)?.href,
    ).toBe("https://files.example.test/a?sig=1");
    expect(resolveRedirect("/files/a", from, false)?.href).toBe(
      "https://api.example.test/files/a",
    );
    expect(resolveRedirect("b", from, false)?.href).toBe(
      "https://api.example.test/v1/b",
    );
    expect(resolveRedirect("//cdn.example.test/c", from, false)?.href).toBe(
      "https://cdn.example.test/c",
    );
  });

  it("allows http: only when asked to", () => {
    expect(resolveRedirect("http://x.test/a", from, false)).toBeUndefined();
    expect(resolveRedirect("http://x.test/a", from, true)?.href).toBe(
      "http://x.test/a",
    );
  });

  it("refuses a missing, unparseable, credentialed, or non-http(s) target", () => {
    for (const location of [
      null,
      "",
      "   ",
      "https://[bad",
      "javascript:alert(1)",
      "ftp://x.test/a",
      "data:text/plain,hi",
      "file:///etc/passwd",
      "https://user:pass@x.test/a",
      "https://user@x.test/a",
    ]) {
      expect(resolveRedirect(location, from, true), String(location)).toBe(
        undefined,
      );
    }
  });
});
