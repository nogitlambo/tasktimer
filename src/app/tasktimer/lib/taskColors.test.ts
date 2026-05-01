import { describe, expect, it } from "vitest";

import { normalizeTaskColor, TASK_COLOR_PALETTE } from "./taskColors";

describe("taskColors", () => {
  it("normalizes only curated task colors", () => {
    expect(normalizeTaskColor(TASK_COLOR_PALETTE[0].toUpperCase())).toBe(TASK_COLOR_PALETTE[0]);
    expect(normalizeTaskColor(" #f59e0b ")).toBe("#f59e0b");
    expect(normalizeTaskColor("#ffffff")).toBeNull();
    expect(normalizeTaskColor(null)).toBeNull();
  });
});
