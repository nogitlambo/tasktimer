import { describe, expect, it } from "vitest";
import { formatReleaseDate } from "./releaseDate";

describe("formatReleaseDate", () => {
  it.each([
    ["2026-06-01", "1st June 2026"],
    ["2026-06-02", "2nd June 2026"],
    ["2026-06-03", "3rd June 2026"],
    ["2026-06-04", "4th June 2026"],
    ["2026-06-11", "11th June 2026"],
    ["2026-06-12", "12th June 2026"],
    ["2026-06-13", "13th June 2026"],
    ["2026-06-21", "21st June 2026"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatReleaseDate(input)).toBe(expected);
  });

  it("returns unrecognized values unchanged", () => {
    expect(formatReleaseDate("not-a-date")).toBe("not-a-date");
  });
});
