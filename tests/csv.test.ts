import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("joins cells with commas and rows with CRLF", () => {
    expect(toCsv([["Reference", "Total"], ["ZY-ABC12", 1200]])).toBe("Reference,Total\r\nZY-ABC12,1200");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([["NG, Tower 4", 'He said "hi"', "line\nbreak"]])).toBe(
      '"NG, Tower 4","He said ""hi""","line\nbreak"',
    );
  });

  it("renders empty and boolean cells predictably", () => {
    expect(toCsv([[null, undefined, false, true, 0]])).toBe(",,false,true,0");
  });
});
