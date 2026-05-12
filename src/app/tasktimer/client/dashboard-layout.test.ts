import { describe, expect, it } from "vitest";
import {
  clampDashboardPlacement,
  getDashboardColumnSpan,
  getDashboardGridColumnValue,
  resolveDashboardCardPlacements,
  sanitizeDashboardCardPlacements,
} from "./dashboard-layout";

describe("dashboard layout helpers", () => {
  it("sanitizes persisted placement maps", () => {
    expect(
      sanitizeDashboardCardPlacements({
        momentum: { col: 4.9, row: "3" },
        bad: null,
      })
    ).toEqual({
      momentum: { col: 4, row: 3 },
    });
  });

  it("maps dashboard sizes to responsive column spans", () => {
    expect(getDashboardColumnSpan("full", 12)).toBe(12);
    expect(getDashboardColumnSpan("half", 12)).toBe(6);
    expect(getDashboardColumnSpan("quarter", 12)).toBe(3);
    expect(getDashboardColumnSpan("half", 2)).toBe(2);
    expect(getDashboardColumnSpan("quarter", 2)).toBe(1);
    expect(getDashboardColumnSpan("full", 1)).toBe(1);
  });

  it("clamps placements to valid starting columns for the current span", () => {
    expect(clampDashboardPlacement({ col: 12, row: 3 }, "half", 12)).toEqual({ col: 7, row: 3 });
    expect(clampDashboardPlacement({ col: 0, row: 0 }, "quarter", 2)).toEqual({ col: 1, row: 1 });
  });

  it("formats inline grid columns with the resolved span", () => {
    expect(getDashboardGridColumnValue({ col: 2, row: 1 }, "half", 12)).toBe("2 / span 6");
    expect(getDashboardGridColumnValue({ col: 12, row: 1 }, "half", 12)).toBe("7 / span 6");
    expect(getDashboardGridColumnValue({ col: 1, row: 1 }, "quarter", 2)).toBe("1 / span 1");
  });

  it("preserves free placement requests while resolving collisions", () => {
    const placements = resolveDashboardCardPlacements(
      [
        { id: "today", size: "quarter", requested: { col: 1, row: 1 }, orderIndex: 0 },
        { id: "week", size: "quarter", requested: { col: 5, row: 1 }, orderIndex: 1 },
        { id: "momentum", size: "half", requested: { col: 1, row: 2 }, orderIndex: 2 },
        { id: "heatmap", size: "half", requested: { col: 1, row: 2 }, orderIndex: 3 },
      ],
      12
    );

    expect(placements.today).toEqual({ col: 1, row: 1 });
    expect(placements.week).toEqual({ col: 5, row: 1 });
    expect(placements.momentum).toEqual({ col: 1, row: 2 });
    expect(placements.heatmap).toEqual({ col: 7, row: 2 });
  });

  it("keeps requested placement intent separate from collision resolution", () => {
    const requested = {
      today: { col: 1, row: 1 },
      week: { col: 1, row: 1 },
    };
    const placements = resolveDashboardCardPlacements(
      [
        { id: "today", size: "quarter", requested: requested.today, orderIndex: 0 },
        { id: "week", size: "quarter", requested: requested.week, orderIndex: 1 },
      ],
      12
    );

    expect(placements.week).toEqual({ col: 4, row: 1 });
    expect(requested.week).toEqual({ col: 1, row: 1 });
  });
});
