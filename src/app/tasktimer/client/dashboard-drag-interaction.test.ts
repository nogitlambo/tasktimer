import { describe, expect, it } from "vitest";
import {
  isDashboardCardSizeOptionAllowed,
  sanitizeDashboardCardSize,
  shouldIgnoreDashboardPointerDragStartTarget,
  shouldOpenDashboardLockedUpgradePrompt,
  shouldUsePointerDashboardDrag,
} from "./dashboard";

function makeClosestTarget(matches: string[] = []) {
  return {
    closest: (selector: string) => (matches.includes(selector) ? { selector } : null),
  };
}

describe("dashboard drag interaction guards", () => {
  it("allows pointer drag for the primary pointer only", () => {
    expect(shouldUsePointerDashboardDrag({ button: 0, isPrimary: true })).toBe(true);
    expect(shouldUsePointerDashboardDrag({ button: 0, isPrimary: undefined })).toBe(true);
    expect(shouldUsePointerDashboardDrag({ button: 2, isPrimary: true })).toBe(false);
    expect(shouldUsePointerDashboardDrag({ button: 0, isPrimary: false })).toBe(false);
  });

  it("blocks drag starts from dashboard chrome and size controls but not card content", () => {
    expect(shouldIgnoreDashboardPointerDragStartTarget(makeClosestTarget([".dashboardSizeControl"]))).toBe(true);
    expect(
      shouldIgnoreDashboardPointerDragStartTarget(
        makeClosestTarget([
          "#dashboardRefreshBtn, #dashboardPanelMenuBtn, #dashboardEditBtn, #dashboardEditCancelBtn, #dashboardEditDoneBtn, #dashboardPanelMenuBackBtn",
        ])
      )
    ).toBe(true);
    expect(shouldIgnoreDashboardPointerDragStartTarget(makeClosestTarget(["input, select, textarea"]))).toBe(true);
    expect(shouldIgnoreDashboardPointerDragStartTarget(makeClosestTarget())).toBe(false);
    expect(shouldIgnoreDashboardPointerDragStartTarget(null)).toBe(false);
  });

  it("suppresses locked-card upgrade prompts while dashboard edit mode is active", () => {
    expect(shouldOpenDashboardLockedUpgradePrompt(false)).toBe(true);
    expect(shouldOpenDashboardLockedUpgradePrompt(true)).toBe(false);
  });

  it("keeps chart-heavy cards flexible while forcing completed to half-or-full", () => {
    expect(sanitizeDashboardCardSize("quarter", "avg-session-by-task")).toBe("quarter");
    expect(sanitizeDashboardCardSize("quarter", "heatmap")).toBe("quarter");
    expect(sanitizeDashboardCardSize("quarter", "tasks-completed")).toBe("half");
    expect(sanitizeDashboardCardSize("eighth", "tasks-completed")).toBe("half");
    expect(isDashboardCardSizeOptionAllowed("quarter", "avg-session-by-task")).toBe(true);
    expect(isDashboardCardSizeOptionAllowed("quarter", "heatmap")).toBe(true);
    expect(isDashboardCardSizeOptionAllowed("quarter", "tasks-completed")).toBe(false);
    expect(isDashboardCardSizeOptionAllowed("half", "tasks-completed")).toBe(true);
    expect(isDashboardCardSizeOptionAllowed("full", "tasks-completed")).toBe(true);
    expect(isDashboardCardSizeOptionAllowed("half", "heatmap")).toBe(true);
    expect(isDashboardCardSizeOptionAllowed("full", "avg-session-by-task")).toBe(true);
  });
});
