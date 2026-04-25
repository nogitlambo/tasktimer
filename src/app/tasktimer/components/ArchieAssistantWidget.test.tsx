import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ArchieResponseActionRow,
  onboardingPrimaryActionForStep,
  onboardingStepTargetPage,
  nextArchieResponseFeedback,
  resolveOnboardingDashboardPanelProgress,
  resolveOnboardingModuleProgress,
  shouldShowArchieResponseActionRow,
  shouldAutoAdvanceOnboardingStep,
} from "./ArchieAssistantWidget";
import {
  getOnboardingDashboardPanelStepMessage,
  onboardingModuleStepFromNavPage,
  readOnboardingDashboardPanelStepForCurrentSession,
  saveOnboardingDashboardPanelStepForCurrentSession,
  shouldOnboardingStepAwaitModuleClick,
} from "../lib/onboarding";

describe("ArchieAssistantWidget response actions", () => {
  it("renders the Archie response action row with thumb and copy controls", () => {
    const markup = renderToStaticMarkup(
      <ArchieResponseActionRow
        visible
        feedback="up"
        copyState="idle"
        onFeedback={vi.fn()}
        onCopy={vi.fn()}
      />
    );

    expect(markup).toContain("desktopRailMascotResponseActions isVisible");
    expect(markup).toContain('aria-label="Mark Archie response helpful"');
    expect(markup).toContain('aria-label="Mark Archie response unhelpful"');
    expect(markup).toContain('aria-label="Copy Archie response"');
  });

  it("toggles thumbs feedback as a mutually exclusive state", () => {
    expect(nextArchieResponseFeedback(null, "up")).toBe("up");
    expect(nextArchieResponseFeedback("up", "down")).toBe("down");
    expect(nextArchieResponseFeedback("down", "down")).toBeNull();
  });

  it("shows response actions only for completed Archie replies", () => {
    expect(
      shouldShowArchieResponseActionRow({
        busy: false,
        inputVisible: true,
        hasResponseActions: true,
        message: "Here is your Archie answer.",
      })
    ).toBe(true);
    expect(
      shouldShowArchieResponseActionRow({
        busy: true,
        inputVisible: true,
        hasResponseActions: true,
        message: "Thinking...",
      })
    ).toBe(false);
    expect(
      shouldShowArchieResponseActionRow({
        busy: false,
        inputVisible: false,
        hasResponseActions: true,
        message: "Partial response",
      })
    ).toBe(false);
    expect(
      shouldShowArchieResponseActionRow({
        busy: false,
        inputVisible: true,
        hasResponseActions: false,
        message: "What can I help with?",
      })
    ).toBe(false);
  });

  it("keeps welcome button-driven and module steps click-driven", () => {
    expect(shouldOnboardingStepAwaitModuleClick("welcome")).toBe(false);
    expect(shouldOnboardingStepAwaitModuleClick("dashboard")).toBe(true);
    expect(onboardingPrimaryActionForStep({ step: "welcome", awaitingClick: false })?.label).toBe("Let's Go!");
    expect(onboardingPrimaryActionForStep({ step: "dashboard", awaitingClick: true })).toBeNull();
    expect(onboardingPrimaryActionForStep({ step: "dashboard", awaitingClick: false, dashboardPanelStep: "xp-progress" })).toBeNull();
  });

  it("advances only when the matching onboarding module is clicked", () => {
    expect(
      resolveOnboardingModuleProgress({
        currentStep: "dashboard",
        awaitingClick: true,
        triggeredStep: "dashboard",
      })
    ).toEqual({ type: "advance", nextStep: "tasks" });
    expect(
      resolveOnboardingModuleProgress({
        currentStep: "dashboard",
        awaitingClick: true,
        triggeredStep: "friends",
      })
    ).toEqual({ type: "ignore" });
    expect(
      resolveOnboardingModuleProgress({
        currentStep: "settings",
        awaitingClick: true,
        triggeredStep: "settings",
      })
    ).toEqual({ type: "reveal_finish" });
  });

  it("auto-advances only for resumed steps that already match the open page", () => {
    expect(
      shouldAutoAdvanceOnboardingStep({
        step: "dashboard",
        awaitingClick: true,
        autoAdvanceIfCurrentPage: true,
        activePage: "dashboard",
      })
    ).toBe(true);
    expect(
      shouldAutoAdvanceOnboardingStep({
        step: "dashboard",
        awaitingClick: true,
        autoAdvanceIfCurrentPage: false,
        activePage: "dashboard",
      })
    ).toBe(false);
    expect(onboardingStepTargetPage("friends")).toBe("friends");
  });

  it("maps desktop rail pages onto onboarding module steps", () => {
    expect(onboardingModuleStepFromNavPage("dashboard")).toBe("dashboard");
    expect(onboardingModuleStepFromNavPage("friends")).toBe("friends");
    expect(onboardingModuleStepFromNavPage("settings")).toBe("settings");
    expect(onboardingModuleStepFromNavPage("none")).toBeNull();
  });

  it("advances dashboard panel walkthrough steps in order before tasks", () => {
    expect(resolveOnboardingDashboardPanelProgress("xp-progress")).toEqual({
      type: "advance_panel",
      nextPanelStep: "week-hours",
    });
    expect(resolveOnboardingDashboardPanelProgress("week-hours")).toEqual({
      type: "advance_panel",
      nextPanelStep: "weekly-time-goals",
    });
    expect(resolveOnboardingDashboardPanelProgress("weekly-time-goals")).toEqual({
      type: "advance_panel",
      nextPanelStep: "tasks-completed",
    });
    expect(resolveOnboardingDashboardPanelProgress("tasks-completed")).toEqual({
      type: "advance_step",
      nextStep: "tasks",
    });
  });

  it("stores and restores the dashboard onboarding panel step for the current session", () => {
    const sessionStorage = {
      getItem: vi.fn((key: string) => {
        if (key.endsWith(":onboardingFingerprintThisLogin")) return "uid-1:signin-1";
        if (key.endsWith(":onboardingDashboardPanelStepThisLogin")) return "weekly-time-goals";
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("window", { sessionStorage });
    const user = { uid: "uid-1", metadata: { lastSignInTime: "signin-1" } } as never;

    expect(readOnboardingDashboardPanelStepForCurrentSession(user)).toBe("weekly-time-goals");
    saveOnboardingDashboardPanelStepForCurrentSession(user, "tasks-completed");
    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      "taskticker_tasks_v1:onboardingDashboardPanelStepThisLogin",
      "tasks-completed"
    );
    expect(getOnboardingDashboardPanelStepMessage("xp-progress")).toContain("Click anywhere to move forward");
  });

  it("keeps onboarding heading-only usage scoped to layout cases", () => {
    expect(onboardingStepTargetPage("dashboard")).toBe("dashboard");
    expect(onboardingStepTargetPage("welcome")).toBeNull();
  });
});
