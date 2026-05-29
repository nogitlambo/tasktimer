import { describe, expect, it } from "vitest";
import { formatCompactCheckpointDuration } from "./checkpoint-duration-format";

describe("formatCompactCheckpointDuration", () => {
  it("formats checkpoint durations as compact labels", () => {
    expect(formatCompactCheckpointDuration(0)).toBe("0m");
    expect(formatCompactCheckpointDuration(30)).toBe("30s");
    expect(formatCompactCheckpointDuration(30 * 60)).toBe("30m");
    expect(formatCompactCheckpointDuration(60 * 60)).toBe("1h");
    expect(formatCompactCheckpointDuration(80 * 60)).toBe("1h 20m");
  });
});
