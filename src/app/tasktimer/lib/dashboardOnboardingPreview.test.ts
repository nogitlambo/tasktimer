import { describe, expect, it, vi } from "vitest";

import { buildDashboardRenderSummary } from "./dashboardViewModel";
import { ONBOARDING_DASHBOARD_PREVIEW } from "./dashboardOnboardingPreview";
import { notifyOnboardingStateChanged, ONBOARDING_STATE_CHANGED_EVENT } from "./onboarding";

describe("dashboard onboarding preview", () => {
  it("defines populated sample values for each onboarding dashboard panel", () => {
    expect(ONBOARDING_DASHBOARD_PREVIEW.xpProgress.totalXp).toBeGreaterThan(0);
    expect(ONBOARDING_DASHBOARD_PREVIEW.today.totalMs).toBeGreaterThan(0);
    expect(ONBOARDING_DASHBOARD_PREVIEW.weeklyGoals.totalMs).toBeGreaterThan(0);
    expect(ONBOARDING_DASHBOARD_PREVIEW.tasksCompleted.total).toBeGreaterThan(0);
    expect(ONBOARDING_DASHBOARD_PREVIEW.momentum.score).toBeGreaterThan(0);
    expect(ONBOARDING_DASHBOARD_PREVIEW.timeline.items.length).toBeGreaterThan(0);
    expect(ONBOARDING_DASHBOARD_PREVIEW.heatmap.levels.some((level) => level !== "none")).toBe(true);
  });

  it("changes dashboard render signatures when onboarding preview mode toggles", () => {
    const baseInput = {
      tasks: [],
      historyByTaskId: {},
      deletedTaskMeta: {},
      dynamicColorsEnabled: false,
      currentDayKey: "2026-04-21",
      nowMs: 123,
    };

    const withoutPreview = buildDashboardRenderSummary({
      ...baseInput,
      onboardingPreviewActive: false,
    });
    const withPreview = buildDashboardRenderSummary({
      ...baseInput,
      onboardingPreviewActive: true,
    });

    expect(withPreview.onboardingPreviewActive).toBe(true);
    expect(withoutPreview.fullSignature).not.toBe(withPreview.fullSignature);
    expect(withoutPreview.liveSignature).not.toBe(withPreview.liveSignature);
  });

  it("broadcasts an onboarding state change event", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent, CustomEvent });

    notifyOnboardingStateChanged();

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent | undefined;
    expect(event?.type).toBe(ONBOARDING_STATE_CHANGED_EVENT);

    vi.unstubAllGlobals();
  });
});
