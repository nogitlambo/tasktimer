import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { dispatchTaskCardAction, renderTaskCardHtml } from "./task-card-view-model";

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Write <docs>",
    elapsed: 0,
    running: false,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    timeGoalEnabled: false,
    timeGoalMinutes: 0,
    color: "#33aaff",
    ...overrides,
  } as Task;
}

function renderCard(overrides: Partial<Parameters<typeof renderTaskCardHtml>[0]> = {}) {
  return renderTaskCardHtml({
    task: baseTask(),
    taskId: "task-1",
    elapsedMs: 0,
    sortedMilestones: [],
    milestoneUnitSec: 3600,
    milestoneUnitSuffix: "h",
    timeGoalSec: 0,
    checkpointRepeatActiveTaskId: null,
    activeCheckpointToastTaskId: null,
    historyRevealPhase: null,
    showHistory: false,
    isHistoryPinned: false,
    canUseAdvancedHistory: true,
    canUseSocialFeatures: true,
    isSharedByOwner: false,
    isTimeGoalCompleted: false,
    dynamicColorsEnabled: false,
    modeColor: "#00ffff",
    fillBackgroundForPct: (pct) => `pct-${pct}`,
    escapeHtml: (value) => value.replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    formatMainTaskElapsedHtml: (elapsedMs) => `${elapsedMs}ms`,
    ...overrides,
  });
}

describe("task card view model", () => {
  it("renders the stable task card action hooks", () => {
    const rendered = renderCard();

    expect(rendered.className).toBe("task");
    expect(rendered.html).toContain('data-action="start"');
    expect(rendered.html).toContain('data-action="reset"');
    expect(rendered.html).toContain('data-action="edit"');
    expect(rendered.html).toContain('data-action="history"');
    expect(rendered.html).toContain('data-action="manualEntry"');
    expect(rendered.html).toContain('data-action="collapse"');
    expect(rendered.html).toContain('data-action="shareTask"');
    expect(rendered.html).toContain('data-action="archive"');
    expect(rendered.html).toContain('data-action="exportTask"');
    expect(rendered.html).toContain('data-action="delete"');
    expect(rendered.html).toContain("Write &lt;docs&gt;");
  });

  it("disables reset until the task has logged time", () => {
    const rendered = renderCard();

    expect(rendered.html).toContain('data-action="reset" title="No time to reset" aria-label="No time to reset" disabled');
  });

  it("enables reset after the task has logged time", () => {
    const rendered = renderCard({ elapsedMs: 60_000 });

    expect(rendered.html).toContain('data-action="reset" title="Reset" aria-label="Reset" ');
    expect(rendered.html).not.toContain('data-action="reset" title="Reset" aria-label="Reset" disabled');
  });

  it("renders running, alert, history, and shared-owner states", () => {
    const rendered = renderCard({
      task: baseTask({ running: true, collapsed: true }),
      elapsedMs: 12_000,
      checkpointRepeatActiveTaskId: "task-1",
      historyRevealPhase: "opening",
      showHistory: true,
      isHistoryPinned: true,
      isSharedByOwner: true,
    });

    expect(rendered.className).toBe("task taskRunning collapsed taskAlertPulse");
    expect(rendered.html).toContain('data-action="stop"');
    expect(rendered.html).toContain('data-action="muteCheckpointAlert"');
    expect(rendered.html).toContain("historyInlineMotion isOpening");
    expect(rendered.html).toContain('data-action="unshareTask"');
    expect(rendered.html).toContain('data-action="archive" title="Stop task to archive" type="button" disabled');
    expect(rendered.html).toContain('data-history-action="pin"');
    expect(rendered.html).toContain('data-action="history" title="Hide history chart"');
    expect(rendered.html).toContain("disabled");
  });

  it("renders plan-locked labels without changing data hooks", () => {
    const rendered = renderCard({
      canUseAdvancedHistory: false,
      canUseSocialFeatures: false,
    });

    expect(rendered.html).toContain('data-action="manualEntry"');
    expect(rendered.html).toContain('data-plan-locked="advancedHistory"');
    expect(rendered.html).toContain("Add Manual Entry (Pro)");
    expect(rendered.html).toContain('data-action="shareTask"');
    expect(rendered.html).toContain('data-plan-locked="socialFeatures"');
    expect(rendered.html).toContain("Share (Pro)");
  });

  it("renders a history-tab border footprint for shell border alignment", () => {
    const rendered = renderCard();

    expect(rendered.html).toContain('class="taskFaceShell taskFaceShellFront" style="--task-history-tab-border-gap:160px"');
    expect(rendered.html).toContain('class="taskHistoryReveal ');
  });

  it("renders completed time-goal tasks as done while preserving edit hooks", () => {
    const rendered = renderCard({
      isTimeGoalCompleted: true,
    });

    expect(rendered.className).toBe("task taskCompleted");
    expect(rendered.html).toContain('data-action="start"');
    expect(rendered.html).toContain("Done");
    expect(rendered.html).toContain("taskDoneIcon");
    expect(rendered.html).toContain('aria-label="Done until tomorrow" disabled');
    expect(rendered.html).toContain('data-action="reset"');
    expect(rendered.html).toContain('data-action="edit"');
  });

  it("renders checkpoint labels as compact durations instead of raw decimals", () => {
    const rendered = renderCard({
      sortedMilestones: [{ hours: 1.3333333333333333, description: "Break" }],
      timeGoalSec: 2 * 3600,
    });

    expect(rendered.html).toContain("1h 20m");
    expect(rendered.html).not.toContain("1.3333333333333333h");
    expect(rendered.html).not.toContain("Break");
  });

  it("renders all checkpoint time markers on the progress bar", () => {
    const rendered = renderCard({
      sortedMilestones: [
        { hours: 0.5, description: "" },
        { hours: 1.3333333333333333, description: "" },
        { hours: 1.75, description: "" },
      ],
      timeGoalSec: 2 * 3600,
    });

    expect(rendered.html).toContain(">30m<");
    expect(rendered.html).toContain(">1h 20m<");
    expect(rendered.html).toContain(">1h 45m<");
  });

  it("dispatches allowed task card actions", () => {
    const calls: string[] = [];

    const handled = dispatchTaskCardAction({
      action: "start",
      canUseAdvancedHistory: true,
      canUseSocialFeatures: true,
      showUpgradePrompt: (featureName) => calls.push(`upgrade:${featureName}`),
      handlers: {
        start: () => calls.push("start"),
      },
    });

    expect(handled).toBe(true);
    expect(calls).toEqual(["start"]);
  });

  it("gates locked task card actions before invoking handlers", () => {
    const calls: string[] = [];

    const manualHandled = dispatchTaskCardAction({
      action: "manualEntry",
      canUseAdvancedHistory: false,
      canUseSocialFeatures: true,
      showUpgradePrompt: (featureName) => calls.push(`upgrade:${featureName}`),
      handlers: {
        manualEntry: () => calls.push("manual"),
      },
    });
    const shareHandled = dispatchTaskCardAction({
      action: "shareTask",
      canUseAdvancedHistory: true,
      canUseSocialFeatures: false,
      showUpgradePrompt: (featureName) => calls.push(`upgrade:${featureName}`),
      handlers: {
        shareTask: () => calls.push("share"),
      },
    });

    expect(manualHandled).toBe(true);
    expect(shareHandled).toBe(true);
    expect(calls).toEqual(["upgrade:Manual history entry", "upgrade:Task sharing and friends"]);
  });
});
