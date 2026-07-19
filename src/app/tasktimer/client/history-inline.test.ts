import { describe, expect, it } from "vitest";
import { calculateHistoryInlineColumnLayout } from "./history-inline";

describe("history inline chart layout", () => {
  it("keeps the final visible column gap consistent after reserving 3D depth", () => {
    const layout = calculateHistoryInlineColumnLayout({
      plotEntryLeft: 36,
      plotEntryW: 286,
      slotCount: 7,
      gap: 6,
    });

    const positions = Array.from({ length: 7 }, (_, index) => layout.xForIndex(index));
    const gaps = positions.slice(1).map((x, index) => x - (positions[index] + layout.barW));

    expect(new Set(gaps)).toEqual(new Set([6]));
    expect(positions[6] + layout.barW + layout.columnDepthX).toBeLessThanOrEqual(36 + 286);
  });
});
