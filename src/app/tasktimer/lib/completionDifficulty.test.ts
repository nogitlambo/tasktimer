import { describe, expect, it } from "vitest";

import { completionDifficultyLabel, normalizeCompletionDifficulty } from "./completionDifficulty";

describe("completion difficulty helpers", () => {
  it("normalizes only enum values from 1 through 5", () => {
    expect(normalizeCompletionDifficulty(1)).toBe(1);
    expect(normalizeCompletionDifficulty("5")).toBe(5);
    expect(normalizeCompletionDifficulty(0)).toBeUndefined();
    expect(normalizeCompletionDifficulty(6)).toBeUndefined();
    expect(normalizeCompletionDifficulty(2.5)).toBeUndefined();
    expect(normalizeCompletionDifficulty("hard")).toBeUndefined();
  });

  it("returns labels for valid difficulty values", () => {
    expect(completionDifficultyLabel(1)).toBe("Very Difficult");
    expect(completionDifficultyLabel(3)).toBe("Neutral");
    expect(completionDifficultyLabel(5)).toBe("Very Easy");
    expect(completionDifficultyLabel(null)).toBeNull();
  });
});
