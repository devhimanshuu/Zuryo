import { describe, expect, it } from "vitest";
import {
  BOOKING_SORTS,
  BOOKING_STATUS_FILTERS,
  Q_MAX_LENGTH,
  normalizeQuery,
  parseBookingSort,
  parseBookingStatus,
  parseTrainerActive,
  parseTrainerSort,
} from "@/lib/operations-filters";

describe("normalizeQuery", () => {
  it("trims, takes the first repeated value and caps the length", () => {
    expect(normalizeQuery(undefined)).toBe("");
    expect(normalizeQuery("  ZY-ABCDE  ")).toBe("ZY-ABCDE");
    expect(normalizeQuery(["first", "second"])).toBe("first");
    expect(normalizeQuery("x".repeat(200))).toHaveLength(Q_MAX_LENGTH);
  });
});

describe("parseBookingStatus", () => {
  it("accepts known statuses case-insensitively and rejects everything else", () => {
    expect(parseBookingStatus("confirmed")).toBe("CONFIRMED");
    expect(parseBookingStatus("IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(parseBookingStatus(["completed", "failed"])).toBe("COMPLETED");
    expect(parseBookingStatus("all")).toBeNull();
    expect(parseBookingStatus("nope")).toBeNull();
    expect(parseBookingStatus(undefined)).toBeNull();
    expect(BOOKING_STATUS_FILTERS).toHaveLength(6);
  });
});

describe("parseBookingSort", () => {
  it("falls back to newest", () => {
    expect(parseBookingSort("oldest")).toBe("oldest");
    expect(parseBookingSort("updated")).toBe("updated");
    expect(parseBookingSort("sideways")).toBe("newest");
    expect(parseBookingSort(undefined)).toBe("newest");
    expect(BOOKING_SORTS).toHaveLength(3);
  });
});

describe("parseTrainerActive", () => {
  it("maps active/inactive and leaves the rest unfiltered", () => {
    expect(parseTrainerActive("active")).toBe(true);
    expect(parseTrainerActive("INACTIVE")).toBe(false);
    expect(parseTrainerActive("all")).toBeNull();
    expect(parseTrainerActive("true")).toBeNull();
    expect(parseTrainerActive(undefined)).toBeNull();
  });
});

describe("parseTrainerSort", () => {
  it("falls back to name", () => {
    expect(parseTrainerSort("experience")).toBe("experience");
    expect(parseTrainerSort("nope")).toBe("name");
  });
});
