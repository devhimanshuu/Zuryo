import { describe, expect, it } from "vitest";
import {
  PAGE_SIZES,
  firstParam,
  pageHref,
  pageMeta,
  pageWindow,
  paginateRows,
  parseChoice,
  parsePage,
} from "@/lib/pagination";

describe("parsePage", () => {
  it("defaults to the first page for missing or invalid input", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
    expect(parsePage("999999999")).toBe(1);
  });

  it("accepts positive integers and the first value of repeated params", () => {
    expect(parsePage("2")).toBe(2);
    expect(parsePage(" 12 ")).toBe(12);
    expect(parsePage(["4", "9"])).toBe(4);
  });
});

describe("parseChoice", () => {
  const choices = ["upcoming", "completed"] as const;

  it("returns a known choice and falls back otherwise", () => {
    expect(parseChoice("completed", choices, "upcoming")).toBe("completed");
    expect(parseChoice("nope", choices, "upcoming")).toBe("upcoming");
    expect(parseChoice(undefined, choices, "upcoming")).toBe("upcoming");
    expect(parseChoice(["completed", "upcoming"], choices, "upcoming")).toBe("completed");
  });
});

describe("firstParam", () => {
  it("unwraps an array without changing a scalar", () => {
    expect(firstParam("a")).toBe("a");
    expect(firstParam(["b", "c"])).toBe("b");
    expect(firstParam(undefined)).toBeUndefined();
  });
});

describe("pageMeta", () => {
  it("computes an empty list", () => {
    expect(pageMeta(0, 1, 8)).toEqual({
      page: 1,
      pageSize: 8,
      total: 0,
      totalPages: 1,
      from: 0,
      to: 0,
      hasPrevious: false,
      hasNext: false,
    });
  });

  it("computes a middle page", () => {
    const meta = pageMeta(53, 3, 8);
    expect(meta).toMatchObject({ page: 3, totalPages: 7, from: 17, to: 24 });
    expect(meta.hasPrevious).toBe(true);
    expect(meta.hasNext).toBe(true);
  });

  it("clamps a page past the end and trims the final page", () => {
    const meta = pageMeta(53, 99, 8);
    expect(meta).toMatchObject({ page: 7, totalPages: 7, from: 49, to: 53 });
    expect(meta.hasPrevious).toBe(true);
    expect(meta.hasNext).toBe(false);
  });

  it("sanitises bad sizes and totals", () => {
    expect(pageMeta(-5, 1, 0)).toMatchObject({ total: 0, pageSize: 1, totalPages: 1 });
    expect(pageMeta(Number.NaN, 1, 10).total).toBe(0);
  });
});

describe("paginateRows", () => {
  const rows = Array.from({ length: 23 }, (_, i) => i + 1);

  it("fetches the count and page in parallel", async () => {
    const calls: Array<[number, number]> = [];
    const result = await paginateRows({
      page: 2,
      pageSize: 8,
      count: async () => rows.length,
      rows: async (skip, take) => {
        calls.push([skip, take]);
        return rows.slice(skip, skip + take);
      },
    });

    expect(calls).toEqual([[8, 8]]);
    expect(result).toMatchObject({ page: 2, from: 9, to: 16, total: 23, totalPages: 3 });
    expect(result.rows).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("re-fetches only when the requested page is past the end", async () => {
    const calls: Array<[number, number]> = [];
    const result = await paginateRows({
      page: 9,
      pageSize: 8,
      count: async () => rows.length,
      rows: async (skip, take) => {
        calls.push([skip, take]);
        return rows.slice(skip, skip + take);
      },
    });

    expect(calls).toEqual([
      [64, 8],
      [16, 8],
    ]);
    expect(result.page).toBe(3);
    expect(result.rows).toEqual([17, 18, 19, 20, 21, 22, 23]);
  });

  it("does not re-fetch for an empty result", async () => {
    let fetches = 0;
    const result = await paginateRows({
      page: 8,
      pageSize: 8,
      count: async () => 0,
      rows: async () => {
        fetches += 1;
        return [];
      },
    });

    expect(fetches).toBe(1);
    expect(result).toMatchObject({ page: 1, total: 0, totalPages: 1, rows: [] });
  });

  it("has a page size for every list surface", () => {
    expect(Object.values(PAGE_SIZES).every((size) => size > 0)).toBe(true);
  });
});

describe("pageHref", () => {
  it("returns the bare path for the first page", () => {
    expect(pageHref("/customer/notifications", {}, 1)).toBe("/customer/notifications");
  });

  it("preserves filters and repeated values, replacing the page", () => {
    expect(
      pageHref(
        "/operations/bookings",
        { status: "completed", page: "2", empty: "", tags: ["a", "b"], q: "x y" },
        3,
      ),
    ).toBe("/operations/bookings?status=completed&tags=a&q=x+y&page=3");
  });

  it("adds page numbers beyond the first", () => {
    expect(pageHref("/trainer/sessions", { status: "missed" }, 2)).toBe(
      "/trainer/sessions?status=missed&page=2",
    );
  });
});

describe("pageWindow", () => {
  it("lists every page when there are few", () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the ends and a window around a middle page", () => {
    expect(pageWindow(8, 20)).toEqual([1, "gap", 7, 8, 9, "gap", 20]);
  });

  it("expands near the start and the end", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
  });

  it("clamps impossible input", () => {
    expect(pageWindow(99, 50)).toEqual([1, "gap", 46, 47, 48, 49, 50]);
    expect(pageWindow(1, 0)).toEqual([1]);
  });
});
