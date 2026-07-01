import { readFileSync } from "node:fs";
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
    hasFriends: true,
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
    expect(rendered.html).toContain('data-action="shareTask"');
    expect(rendered.html).toContain('data-action="exportTask"');
    expect(rendered.html).toContain('data-action="delete"');
    expect(rendered.html).not.toContain('data-action="archive"');
    expect(rendered.html).toContain("Write &lt;docs&gt;");
  });

  it("renders back-face task menu actions with full labels", () => {
    const rendered = renderCard();

    const editIndex = rendered.html.indexOf(
      '<button class="taskMenuItem" data-action="edit" title="Edit" type="button"><span class="taskMenuTile">Edit</span></button>'
    );
    const manualEntryIndex = rendered.html.indexOf('data-action="manualEntry"');

    expect(editIndex).toBeGreaterThan(-1);
    expect(manualEntryIndex).toBeGreaterThan(-1);
    expect(editIndex).toBeLessThan(manualEntryIndex);
    expect(rendered.html).toContain('<span class="taskMenuTile">Add Entry</span>');
    expect(rendered.html).toContain('<span class="taskMenuTile">Share</span>');
    expect(rendered.html).toContain('<span class="taskMenuTile">Reset</span>');
    expect(rendered.html).toContain('<span class="taskMenuTile">Delete</span>');
    expect(rendered.html).not.toContain('<span class="taskMenuTile">Archive</span>');
    expect(rendered.html).not.toContain("taskMenuLabel");
    expect(rendered.html).not.toContain('<button class="iconBtn" data-action="edit" title="Edit">');
  });

  it("disables reset until the task has logged time", () => {
    const rendered = renderCard();

    expect(rendered.html).toContain('data-action="reset" title="No time to reset" aria-label="No time to reset" type="button" disabled');
  });

  it("enables reset after the task has logged time", () => {
    const rendered = renderCard({ elapsedMs: 60_000 });

    expect(rendered.html).toContain('data-action="reset" title="Reset" aria-label="Reset" ');
    expect(rendered.html).not.toContain('data-action="reset" title="Reset" aria-label="Reset" disabled');
  });

  it("renders a reset-neutral task with Launch as the primary action", () => {
    const rendered = renderCard({
      task: baseTask({
        accumulatedMs: 0,
        timeGoalCompletedDayKey: null,
        timeGoalCompletedWeekKey: null,
        timeGoalCompletedAtMs: null,
        timeGoalCompletedReason: null,
        timeGoalCompletedElapsedMs: null,
      }),
      elapsedMs: 0,
      isTimeGoalCompleted: false,
    });

    expect(rendered.className).toBe("task");
    expect(rendered.html).toContain('data-action="start" title="Launch"');
    expect(rendered.html).not.toContain('title="Resume"');
    expect(rendered.html).not.toContain("Done until tomorrow");
    expect(rendered.html).toContain('data-action="reset" title="No time to reset" aria-label="No time to reset" type="button" disabled');
  });

  it("renders running, alert, history, and shared-owner states", () => {
    const rendered = renderCard({
      task: baseTask({ running: true, collapsed: true }),
      elapsedMs: 12_000,
      checkpointRepeatActiveTaskId: "task-1",
      historyRevealPhase: "openingSpace",
      showHistory: true,
      isHistoryPinned: true,
      isSharedByOwner: true,
    });

    expect(rendered.className).toBe("task taskRunning collapsed taskAlertPulse taskHistoryOpeningSpace");
    expect(rendered.html).toContain('data-action="stop"');
    expect(rendered.html).toContain('data-action="muteCheckpointAlert"');
    expect(rendered.html).toContain("historyInlineMotion isOpeningSpace");
    expect(rendered.html).toContain('data-action="unshareTask"');
    expect(rendered.html).toContain('data-action="reset" title="Stop task to reset" aria-label="Stop task to reset" type="button" disabled');
    expect(rendered.html).not.toContain('data-action="archive"');
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
    expect(rendered.html).toContain('<span class="taskMenuTile">Add Entry (Pro)</span>');
    expect(rendered.html).toContain('data-action="shareTask"');
    expect(rendered.html).toContain('data-plan-locked="socialFeatures"');
    expect(rendered.html).toContain('<span class="taskMenuTile">Share (Pro)</span>');
  });

  it("disables sharing when there are no friends", () => {
    const rendered = renderCard({
      hasFriends: false,
    });

    expect(rendered.html).toContain('data-action="shareTask" title="Add friends to share tasks" type="button" disabled');
    expect(rendered.html).toContain('<span class="taskMenuTile">Share</span>');
  });

  it("renders Unshare with the full label for shared-owner tasks", () => {
    const rendered = renderCard({
      isSharedByOwner: true,
    });

    expect(rendered.html).toContain('data-action="unshareTask"');
    expect(rendered.html).toContain('<span class="taskMenuTile">Unshare</span>');
  });

  it("renders a history-tab border footprint for shell border alignment", () => {
    const rendered = renderCard();

    expect(rendered.html).toContain('class="taskFaceShell taskFaceShellFront" style="--task-history-tab-border-gap:160px"');
    expect(rendered.html).toContain('class="taskHistoryReveal ');
  });

  it("keeps the front history tab border gap from being overdrawn by the back face", () => {
    const css = readFileSync("src/app/tasktimer/styles/02-tasks.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain(".task .taskFaceShellFront::after,\nbody[data-app-page=\"tasks\"] #app[aria-label=\"TaskLaunch App\"] #appPageTasks .task.isFlipped .taskFaceShellBack::after");
    expect(css).not.toContain(".task .taskFaceShellFront::after,\nbody[data-app-page=\"tasks\"] #app[aria-label=\"TaskLaunch App\"] #appPageTasks .task .taskFaceShellBack::after");
    expect(css).toContain("--task-card-tab-border-gap: var(--task-history-tab-border-gap, 160px);");
    expect(css).toContain("--task-card-tab-border-overlap: 0px;");
    expect(css).toContain("border-color: transparent !important;");
    expect(css).toContain("overflow:visible;");
    expect(css).toContain("inset: 3px calc((var(--history-chart-tab-side) * -1) - 1px) -3px;");
    expect(css).toContain("clip-path: polygon(-1px 100%, calc(var(--history-chart-tab-side) - 1px) 0, calc(100% - var(--history-chart-tab-side) + 1px) 0, calc(100% + 1px) 100%);");
    expect(css).toContain("height: 22px;");
    expect(css).toContain("center bottom / var(--task-card-tab-border-gap) 22px no-repeat");
    expect(css).toContain("border: 1px solid var(--task-card-bottom-border-color, rgba(255,255,255,.12)) !important;");
    expect(css).toContain("border-top: 0 !important;");
    expect(css).toContain(".task.taskHistoryOpeningSpace");
    expect(css).toContain(".task.taskHistoryOpening");
    expect(css).toContain("@keyframes taskHistoryDrawerSpaceOpen");
  });

  it("centers the front primary action and pins the flip button to the task corner", () => {
    const css = readFileSync("src/app/tasktimer/styles/02-tasks.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain("grid-template-columns: minmax(0, 148px) !important;");
    expect(css).toContain("width: min(100%, 148px) !important;");
    expect(css).toContain("justify-self: center !important;");
    expect(css).toContain("grid-column: 1 / 2 !important;");
    expect(css).toContain(".task .taskFaceShellFront > .taskFlipBtn");
    expect(css).toContain("top:10px !important;");
    expect(css).toContain("right:10px !important;");
  });

  it("lays out back-face task actions as a fixed grid of labeled tiles", () => {
    const css = readFileSync("src/app/tasktimer/styles/02-tasks.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).not.toContain("position:absolute;\n  inset:0;\n  height:100%;\n  min-height:0;");
    expect(css).toContain("grid-template-rows:auto auto;");
    expect(css).toContain("grid-template-columns:repeat(3, minmax(0, 1fr));");
    expect(css).toContain("gap:4px;");
    expect(css).not.toContain("width:75%;");
    expect(css).not.toContain("justify-self:center;");
    expect(css).toContain("padding:0 16px 16px;");
    expect(css).toContain("box-sizing:border-box;");
    expect(css).toContain("aspect-ratio:4 / 3;");
    expect(css).toContain("width:100%;\n  height:100%;");
    expect(css).toContain('font-family:Orbitron, var(--font-orbitron), "Segoe UI Variable", "Segoe UI", Arial, sans-serif !important;');
    expect(css).toContain("font-size:11px;");
    expect(css).toContain("overflow-wrap:anywhere;");
    expect(css).toContain("place-items:center;");
    expect(css).not.toContain(".taskBackActions .taskMenuLabel");
  });

  it("keeps mobile task cards within the active Tasks viewport", () => {
    const css = readFileSync("src/app/tasktimer/styles/10-responsive.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain('body[data-app-page="tasks"] .wrap');
    expect(css).toContain('body[data-app-page="tasks"] #app[aria-label="TaskLaunch App"] .appPages');
    expect(css).toContain('body[data-app-page="tasks"] #app[aria-label="TaskLaunch App"] #appPageTasks');
    expect(css).toContain("width:100% !important;");
    expect(css).toContain("max-width:100% !important;");
    expect(css).toContain("margin-left:0 !important;");
    expect(css).toContain("padding-left:0 !important;");
    expect(css).toContain("padding-right:0 !important;");
  });

  it("keeps task cards hidden behind the active Schedule view", () => {
    const css = readFileSync("src/app/tasktimer/styles/02-tasks.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).toMatch(
      /body\[data-app-page="schedule"\] #app\[aria-label="TaskLaunch App"\] #appPageTasks #taskList\{\n\s*display:none !important;\n\}/
    );
  });

  it("renders completed time-goal tasks as done while preserving edit hooks", () => {
    const rendered = renderCard({
      isTimeGoalCompleted: true,
      elapsedMs: 60_000,
    });

    expect(rendered.className).toBe("task taskCompleted");
    expect(rendered.html).toContain('data-action="start"');
    expect(rendered.html).toContain("Done");
    expect(rendered.html).toContain("taskDoneIcon");
    expect(rendered.html).toContain('aria-label="Done until tomorrow" disabled');
    expect(rendered.html).toContain('data-action="reset"');
    expect(rendered.html).toContain('data-action="reset" title="Reset" aria-label="Reset"');
    expect(rendered.html).not.toContain('data-action="reset" title="Reset" aria-label="Reset" disabled');
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

  it("renders a centered percentage label only for progress-enabled task cards", () => {
    const withoutProgress = renderCard();
    const withProgress = renderCard({
      elapsedMs: 30 * 60 * 1000,
      task: baseTask({
        elapsed: 30 * 60 * 1000,
        timeGoalEnabled: true,
        timeGoalMinutes: 60,
      }),
      timeGoalSec: 60 * 60,
    });

    expect(withoutProgress.html).toContain("progressRowEmpty");
    expect(withoutProgress.html).not.toContain("progressPctLabel");
    expect(withProgress.html).toContain('<div class="progressPctLabel" aria-hidden="true">50%</div>');
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
