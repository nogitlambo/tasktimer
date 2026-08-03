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
    checkpointFlashActive: false,
    historyRevealPhase: null,
    showHistory: false,
    isHistoryPinned: false,
    canUseAdvancedHistory: true,
    canUseSocialFeatures: true,
    hasFriends: true,
    isSharedByOwner: false,
    isTimeGoalCompleted: false,
    hasTaskHistory: false,
    dynamicColorsEnabled: false,
    fullColorTaskCardsEnabled: false,
    modeColor: "#00ffff",
    fillBackgroundForPct: (pct) => `pct-${pct}`,
    escapeHtml: (value) => value.replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    formatMainTaskElapsedHtml: (elapsedMs) => `${elapsedMs}ms`,
    ...overrides,
  });
}

describe("task card view model", () => {
  function expectTaskMenuLabel(html: string, label: string) {
    expect(html).toContain(`<span class="taskMenuTileLabel">${label}</span>`);
  }

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

  it("renders inline history range controls from the current view state", () => {
    const rendered = renderCard({
      showHistory: true,
      historyRevealPhase: "open",
      historyRangeDays: 14,
      historyRangeMode: "day",
    });

    expect(rendered.html).toContain('class="switch historyRangeToggle on"');
    expect(rendered.html).toContain('aria-checked="true" data-history-range-toggle="true"');
    expect(rendered.html).toContain('data-history-range-mode="entries" aria-pressed="false"');
    expect(rendered.html).toContain('data-history-range-mode="day" aria-pressed="true"');
  });

  it("renders back-face task menu actions with full labels", () => {
    const rendered = renderCard();

    const editIndex = rendered.html.indexOf(
      '<button class="taskMenuItem" data-action="edit" title="Edit" type="button">'
    );
    const manualEntryIndex = rendered.html.indexOf('data-action="manualEntry"');

    expect(editIndex).toBeGreaterThan(-1);
    expect(manualEntryIndex).toBeGreaterThan(-1);
    expect(editIndex).toBeLessThan(manualEntryIndex);
    expectTaskMenuLabel(rendered.html, "Edit");
    expectTaskMenuLabel(rendered.html, "Add Entry");
    expectTaskMenuLabel(rendered.html, "Share");
    expectTaskMenuLabel(rendered.html, "Reset");
    expectTaskMenuLabel(rendered.html, "Export");
    expectTaskMenuLabel(rendered.html, "Delete");
    expect(rendered.html).toContain('src="/icons/icons_default/settings.webp"');
    expect(rendered.html).toContain('src="/icons/icons_default/notes.webp"');
    expect(rendered.html).toContain('src="/icons/icons_default/share.webp"');
    expect(rendered.html).toContain('src="/icons/icons_default/history.webp"');
    expect(rendered.html).toContain('src="/icons/icons_default/export.webp"');
    expect(rendered.html).toContain('src="/icons/icons_default/trash.webp"');
    expect(rendered.html).not.toContain('<span class="taskMenuTileLabel">Archive</span>');
    expect(rendered.html).not.toContain('src="/icons/icons_default/archive.webp"');
    expect(rendered.html).not.toContain("taskMenuLabel");
    expect(rendered.html).not.toContain('<button class="iconBtn" data-action="edit" title="Edit">');
  });

  it("renders Archive instead of Delete when the task has history entries", () => {
    const rendered = renderCard({ hasTaskHistory: true });

    expect(rendered.html).toContain('data-action="archive" title="Archive" aria-label="Archive" type="button"');
    expectTaskMenuLabel(rendered.html, "Archive");
    expect(rendered.html).toContain('src="/icons/icons_default/archive.webp"');
    expect(rendered.html).not.toContain('data-action="delete" title="Delete"');
    expect(rendered.html).not.toContain('<span class="taskMenuTileLabel">Delete</span>');
  });

  it("disables Archive for a running task with history entries", () => {
    const rendered = renderCard({
      task: baseTask({ running: true }),
      hasTaskHistory: true,
    });

    expect(rendered.html).toContain('data-action="archive" title="Stop task to archive" aria-label="Stop task to archive" type="button" disabled');
    expectTaskMenuLabel(rendered.html, "Archive");
    expect(rendered.html).toContain('src="/icons/icons_default/archive.webp"');
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
    expect(rendered.html).toContain("taskPrimaryAction taskPrimaryActionLaunch");
    expect(rendered.html).toContain('<span class="taskPrimaryActionPrimary">Launch</span>');
    expect(rendered.html).not.toContain("taskPrimaryActionGlyph");
    expect(rendered.html).not.toContain("taskPrimaryActionSecondary");
    expect(rendered.html).not.toContain('title="Resume"');
    expect(rendered.html).not.toContain("Done until tomorrow");
    expect(rendered.html).toContain('data-action="reset" title="No time to reset" aria-label="No time to reset" type="button" disabled');
  });

  it("renders a stopped task with elapsed time as a Resume primary action", () => {
    const rendered = renderCard({
      task: baseTask({ running: false }),
      elapsedMs: 12_000,
      isTimeGoalCompleted: false,
    });

    expect(rendered.className).toBe("task");
    expect(rendered.html).toContain('data-action="start" title="Resume" aria-label="Resume"');
    expect(rendered.html).toContain("btn btn-resume small taskPrimaryAction taskPrimaryActionResume");
    expect(rendered.html).toContain('<span class="taskPrimaryActionPrimary">Resume</span>');
    expect(rendered.html).not.toContain("taskPrimaryActionSecondary");
    expect(rendered.html).not.toContain('data-action="stop"');
    expect(rendered.html).toContain('data-action="reset" title="Reset" aria-label="Reset"');
  });

  it("automatically renders a visible checkpoint rewind action for eligible Resume buttons", () => {
    const rendered = renderCard({
      task: baseTask({
        running: false,
        milestonesEnabled: true,
        milestoneTimeUnit: "minute",
        milestones: [{ hours: 15, description: "" }],
      }),
      elapsedMs: 20 * 60 * 1000,
      sortedMilestones: [{ hours: 15, description: "" }],
      milestoneUnitSec: 60,
      isTimeGoalCompleted: false,
    });

    expect(rendered.html).toContain("taskCheckpointRewindGroup isCheckpointRewindOpen");
    expect(rendered.html).toContain('data-action="rewindCheckpoint"');
    expect(rendered.html).not.toContain('data-action="fastForwardCheckpoint"');
    expect(rendered.html).not.toContain('aria-hidden="true" tabindex="-1"');
    expect(rendered.html).toContain('data-action="start" title="Resume"');
  });

  it("renders both checkpoint arrows after rewinding to an intermediate checkpoint", () => {
    const rendered = renderCard({
      task: baseTask({
        running: false,
        milestonesEnabled: true,
        milestoneTimeUnit: "minute",
        milestones: [
          { hours: 15, description: "" },
          { hours: 30, description: "" },
          { hours: 45, description: "" },
        ],
      }),
      elapsedMs: 30 * 60 * 1000,
      sortedMilestones: [
        { hours: 15, description: "" },
        { hours: 30, description: "" },
        { hours: 45, description: "" },
      ],
      milestoneUnitSec: 60,
      isTimeGoalCompleted: false,
    });

    expect(rendered.html).toContain('data-action="rewindCheckpoint"');
    expect(rendered.html).toContain('data-action="fastForwardCheckpoint"');
    expect(rendered.html).toContain('title="Forward to next checkpoint"');
  });

  it("renders only the forward checkpoint arrow at the first checkpoint when a later checkpoint exists", () => {
    const rendered = renderCard({
      task: baseTask({
        running: false,
        milestonesEnabled: true,
        milestoneTimeUnit: "minute",
        milestones: [
          { hours: 15, description: "" },
          { hours: 30, description: "" },
        ],
      }),
      elapsedMs: 15 * 60 * 1000,
      sortedMilestones: [
        { hours: 15, description: "" },
        { hours: 30, description: "" },
      ],
      milestoneUnitSec: 60,
      isTimeGoalCompleted: false,
    });

    expect(rendered.html).toContain("taskCheckpointRewindGroup isCheckpointRewindOpen");
    expect(rendered.html).not.toContain('data-action="rewindCheckpoint"');
    expect(rendered.html).toContain('data-action="fastForwardCheckpoint"');
  });

  it("does not render checkpoint rewind at exactly the first checkpoint", () => {
    const rendered = renderCard({
      task: baseTask({
        running: false,
        milestonesEnabled: true,
        milestoneTimeUnit: "minute",
        milestones: [{ hours: 15, description: "" }],
      }),
      elapsedMs: 15 * 60 * 1000,
      sortedMilestones: [{ hours: 15, description: "" }],
      milestoneUnitSec: 60,
      isTimeGoalCompleted: false,
    });

    expect(rendered.html).not.toContain("taskCheckpointRewindGroup");
    expect(rendered.html).not.toContain('data-action="rewindCheckpoint"');
    expect(rendered.html).not.toContain('data-action="fastForwardCheckpoint"');
  });

  it("does not render checkpoint forward at the final checkpoint", () => {
    const rendered = renderCard({
      task: baseTask({
        running: false,
        milestonesEnabled: true,
        milestoneTimeUnit: "minute",
        milestones: [
          { hours: 15, description: "" },
          { hours: 30, description: "" },
        ],
      }),
      elapsedMs: 30 * 60 * 1000,
      sortedMilestones: [
        { hours: 15, description: "" },
        { hours: 30, description: "" },
      ],
      milestoneUnitSec: 60,
      isTimeGoalCompleted: false,
    });

    expect(rendered.html).toContain('data-action="rewindCheckpoint"');
    expect(rendered.html).not.toContain('data-action="fastForwardCheckpoint"');
  });

  it("renders running, alert, history, and shared-owner states", () => {
    const rendered = renderCard({
      task: baseTask({ running: true, collapsed: true }),
      elapsedMs: 12_000,
      checkpointRepeatActiveTaskId: "task-1",
      checkpointFlashActive: true,
      historyRevealPhase: "openingSpace",
      showHistory: true,
      isHistoryPinned: true,
      isSharedByOwner: true,
    });

    expect(rendered.className).toBe("task taskRunning collapsed taskCheckpointFlash taskHistoryOpeningSpace");
    expect(rendered.html).toContain('data-action="stop"');
    expect(rendered.html).toContain("taskPrimaryAction taskPrimaryActionStop");
    expect(rendered.html).toContain('data-action="muteCheckpointAlert"');
    expect(rendered.html).toContain("historyInlineMotion isOpeningSpace");
    expect(rendered.html).toContain('data-action="unshareTask"');
    expect(rendered.html).toContain('data-action="reset" title="Stop task to reset" aria-label="Stop task to reset" type="button" disabled');
    expect(rendered.html).not.toContain('data-action="archive"');
    expect(rendered.html).toContain('data-history-action="pin"');
    expect(rendered.html).toContain('data-action="history" title="Hide history chart"');
    expect(rendered.html).toContain('aria-disabled="true"');
    expect(rendered.html).not.toContain('data-action="history" title="Hide history chart" aria-label="Hide history chart" aria-pressed="true" disabled');
  });

  it("renders plan-locked labels without changing data hooks", () => {
    const rendered = renderCard({
      canUseAdvancedHistory: false,
      canUseSocialFeatures: false,
    });

    expect(rendered.html).toContain('data-action="manualEntry"');
    expect(rendered.html).toContain('data-plan-locked="advancedHistory"');
    expectTaskMenuLabel(rendered.html, "Add Entry (Pro)");
    expect(rendered.html).toContain('data-action="shareTask"');
    expect(rendered.html).toContain('data-plan-locked="socialFeatures"');
    expectTaskMenuLabel(rendered.html, "Share (Pro)");
  });

  it("disables sharing when there are no friends", () => {
    const rendered = renderCard({
      hasFriends: false,
    });

    expect(rendered.html).toContain('data-action="shareTask" title="Add friends to share tasks" type="button" disabled');
    expectTaskMenuLabel(rendered.html, "Share");
  });

  it("renders Unshare with the full label for shared-owner tasks", () => {
    const rendered = renderCard({
      isSharedByOwner: true,
    });

    expect(rendered.html).toContain('data-action="unshareTask"');
    expectTaskMenuLabel(rendered.html, "Unshare");
  });

  it("renders a history-tab border footprint for shell border alignment", () => {
    const rendered = renderCard();

    expect(rendered.html).toContain('class="taskFaceShell taskFaceShellFront" style="--task-history-tab-border-gap:160px"');
    expect(rendered.html).toContain('class="taskHistoryReveal ');
  });

  it("keeps the redesigned front-card structure and action hooks intact", () => {
    const rendered = renderCard();

    expect(rendered.html).toContain('class="taskFaceShell taskFaceShellFront"');
    expect(rendered.html).toContain('class="taskColorPill"');
    expect(rendered.html).toContain('class="iconBtn taskFlipBtn"');
    expect(rendered.html).toContain('class="name" data-action="editName"');
    expect(rendered.html).toContain('class="time" data-action="focus"');
    expect(rendered.html).toContain('class="actions"');
    expect(rendered.html).toContain('class="progressRow');
    expect(rendered.html).toContain('data-action="history"');
    expect(rendered.html).toContain('class="btn btn-accent small taskPrimaryAction taskPrimaryActionLaunch"');
    expect(rendered.html).toContain('data-action="start" title="Launch" aria-label="Launch"');
  });

  it("renders assigned task colors as the card surface when full color task cards are enabled", () => {
    const rendered = renderCard({ fullColorTaskCardsEnabled: true });

    expect(rendered.html).toContain("taskFaceShellFront taskFullColorCard");
    expect(rendered.html).toContain('style="--task-history-tab-border-gap:160px;--task-color:#33aaff"');
    expect(rendered.html).not.toContain('class="taskColorPill"');
  });

  it("keeps invalid assigned task colors on the default card surface", () => {
    const rendered = renderCard({
      task: baseTask({ color: "not-a-color" }),
      fullColorTaskCardsEnabled: true,
    });

    expect(rendered.html).not.toContain("taskFullColorCard");
    expect(rendered.html).not.toContain('class="taskColorPill"');
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
    expect(css).toContain(".task.taskCheckpointFlash::after");
    expect(css).toContain("animation: taskCheckpointOuterBorderFlash 1s steps(1, end) 5;");
    expect(css).toContain(".task.taskCheckpointFlash .historyInline");
    expect(css).toContain("animation: taskCheckpointHistoryBorderFlash 1s steps(1, end) 5;");
    expect(css).toContain(".task.isFlipped .taskFaceShellBack::before");
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
    expect(css).toContain("top: 10px !important;");
    expect(css).toContain("right: 10px !important;");
  });

  it("defines reference-style front task card styling without changing compact card dimensions", () => {
    const css = readFileSync("src/app/tasktimer/styles/02-tasks.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain("/* Task card redesign: front-face shell and layout only. Keep button chrome owned by task action rules below. */");
    expect(css).toContain("--task-card-redesign-cyan: rgba(67,229,255,.86);");
    expect(css).toContain("padding: 14px 10px 8px !important;");
    expect(css).toContain("top: 12px;");
    expect(css).toContain("width: 14px;");
    expect(css).toContain("border: 1px solid var(--task-card-outline-color) !important;");
    expect(css).toContain("border-radius: 6px;");
    expect(css).toContain("content: none !important;");
    expect(css).toContain(".task .taskFaceShellFront::after{\n  content: none !important;\n  display: none !important;");
    expect(css).toContain("border: 1px solid rgba(184,204,220,.34) !important;");
    expect(css).not.toContain("min-height: clamp(430px, 46vw, 560px);");
    expect(css).not.toContain("min-height: 92px;");
    expect(css).not.toContain("margin-top: clamp(34px, 5.2vw, 62px);");
    expect(css).toContain("/* Task action sizing ownership. */");
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

  it("dims only non-running task cards when the Tasks list has an active running task", () => {
    const css = readFileSync("src/app/tasktimer/styles/02-tasks.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain('body[data-app-page="tasks"] #app[aria-label="TaskLaunch App"] #appPageTasks #taskList.hasRunningTask .task:not(.taskRunning){');
    expect(css).toContain("opacity:.5;");
    expect(css).toContain('body[data-app-page="tasks"] #app[aria-label="TaskLaunch App"] #appPageTasks #taskList.hasRunningTask .task.taskRunning{');
    expect(css).toContain("opacity:1;");
  });

  it("defines mock-style static recess and interactive inner button styles", () => {
    const css = readFileSync("src/app/tasktimer/styles/02-tasks.css", "utf8").replace(/\r\n/g, "\n");
    const launchRule = css.match(/#app\[aria-label="TaskLaunch App"\] #appPageTasks\.appPageOn \.task \.actions > \.btn\.taskPrimaryAction\.taskPrimaryActionLaunch,[\s\S]*?body\[data-app-page="schedule"\] #app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryAction\.taskPrimaryActionLaunch\{[\s\S]*?\n\}/)?.[0] ?? "";
    const resumeRule = css.match(/#app\[aria-label="TaskLaunch App"\] #appPageTasks\.appPageOn \.task \.actions > \.btn\.taskPrimaryAction\.taskPrimaryActionResume,[\s\S]*?body\[data-app-page="schedule"\] #app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryAction\.taskPrimaryActionResume\{[\s\S]*?\n\}/)?.[0] ?? "";
    const stopRule = css.match(/#app\[aria-label="TaskLaunch App"\] #appPageTasks\.appPageOn \.task \.actions > \.btn\.taskPrimaryAction\.taskPrimaryActionStop,[\s\S]*?body\[data-app-page="schedule"\] #app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryAction\.taskPrimaryActionStop\{[\s\S]*?\n\}/)?.[0] ?? "";
    const resetRule = css.match(/#app\[aria-label="TaskLaunch App"\] #appPageTasks\.appPageOn \.task \.actions > \.btn\.taskPrimaryAction\.taskPrimaryActionReset,[\s\S]*?body\[data-app-page="schedule"\] #app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryAction\.taskPrimaryActionReset\{[\s\S]*?\n\}/)?.[0] ?? "";
    const doneRule = css.match(/#app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryActionDone\{[\s\S]*?\n\}/)?.[0] ?? "";
    const primaryActionRule =
      css.match(
        /#app\[aria-label="TaskLaunch App"\] #appPageTasks\.appPageOn \.task \.actions > \.btn\.taskPrimaryAction,[\s\S]*?body\[data-app-page="schedule"\] #app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryAction\{[\s\S]*?\n\}/
      )?.[0] ??
      "";
    const rewindGroupRule =
      css.match(
        /#app\[aria-label="TaskLaunch App"\] #appPageTasks\.appPageOn \.task \.actions > \.taskCheckpointRewindGroup,[\s\S]*?body\[data-app-page="schedule"\] #app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.taskCheckpointRewindGroup\{[\s\S]*?\n\}/
      )?.[0] ??
      "";
    const rewindButtonRule =
      css.match(
        /#app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions \.taskCheckpointRewindBtn\{[\s\S]*?\n\}/
      )?.[0] ??
      "";
    const rewindOpenRule =
      css.match(
        /#app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions \.taskCheckpointRewindGroup\.isCheckpointRewindOpen \.taskCheckpointRewindBackBtn\{[\s\S]*?\n\}/
      )?.[0] ??
      "";
    const forwardOpenRule =
      css.match(
        /#app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions \.taskCheckpointRewindGroup\.isCheckpointRewindOpen \.taskCheckpointRewindForwardBtn\{[\s\S]*?\n\}/
      )?.[0] ??
      "";
    const faceRule =
      css.match(
        /#app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryAction \.taskPrimaryActionFace\{\n  inset: 15px;[\s\S]*?\n\}/
      )?.[0] ??
      "";
    const ringRule =
      css.match(
        /#app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryAction \.taskPrimaryActionRing\{\n  inset: 0;[\s\S]*?\n\}/
      )?.[0] ??
      "";
    const hoverRule =
      css.match(/#app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryAction:hover:not\(:disabled\),[\s\S]*?\.taskPrimaryAction:focus-visible:not\(:disabled\)\{[\s\S]*?\n\}/)?.[0] ??
      "";
    const hoverFaceRule =
      css.match(/#app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryAction:hover:not\(:disabled\) \.taskPrimaryActionFace,[\s\S]*?\.taskPrimaryAction:focus-visible:not\(:disabled\) \.taskPrimaryActionFace\{[\s\S]*?\n\}/)?.[0] ??
      "";
    const pressedRule =
      css.match(/#app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryAction:active:not\(:disabled\),[\s\S]*?\.taskPrimaryAction\.isTaskPrimaryActionPressed:not\(:disabled\)\{[\s\S]*?\n\}/)?.[0] ??
      "";
    const pressedFaceRule =
      css.match(/#app\[aria-label="TaskLaunch App"\] #appPageTasks \.task \.actions > \.btn\.taskPrimaryAction:active:not\(:disabled\) \.taskPrimaryActionFace,[\s\S]*?\.taskPrimaryAction\.isTaskPrimaryActionPressed:not\(:disabled\) \.taskPrimaryActionFace\{[\s\S]*?\n\}/)?.[0] ??
      "";

    expect(primaryActionRule).toContain("--task-primary-action-size: 96px;");
    expect(primaryActionRule).toContain("--task-primary-accent: #aeb6c0;");
    expect(primaryActionRule).toContain("--task-primary-ring: #1d1e21;");
    expect(primaryActionRule).toContain("background: #090a0d !important;");
    expect(primaryActionRule).not.toContain("transform .14s cubic-bezier(.2,.8,.2,1)");
    expect(primaryActionRule).toContain('font-family: Orbitron, var(--font-orbitron), "Segoe UI Variable", "Segoe UI", Arial, sans-serif !important;');
    expect(rewindGroupRule).toContain("--task-primary-action-size: 96px;");
    expect(rewindGroupRule).toContain("--task-checkpoint-rewind-gap: 6px;");
    expect(rewindGroupRule).toContain("--task-checkpoint-rewind-size: calc(var(--task-primary-action-size) / 2);");
    expect(rewindGroupRule).toContain("width: var(--task-primary-action-size);");
    expect(rewindGroupRule).toContain("height: var(--task-primary-action-size);");
    expect(rewindGroupRule).not.toContain("width: 148px;");
    expect(rewindButtonRule).toContain("width: var(--task-checkpoint-rewind-size) !important;");
    expect(rewindButtonRule).toContain("height: var(--task-checkpoint-rewind-size) !important;");
    expect(rewindButtonRule).not.toContain("width: 42px !important;");
    expect(rewindOpenRule).toContain("left: calc(50% - (var(--task-primary-action-size) / 2) - var(--task-checkpoint-rewind-gap) - var(--task-checkpoint-rewind-size));");
    expect(forwardOpenRule).toContain("left: calc(50% + (var(--task-primary-action-size) / 2) + var(--task-checkpoint-rewind-gap));");
    expect(css).toMatch(
      /@media \(max-width: 420px\)\{[\s\S]*?\.taskCheckpointRewindGroup[\s\S]*?--task-primary-action-size: 82px;/
    );
    expect(css).not.toContain("width: 38px !important;");
    expect(css).toContain('.actions > .btn.small:not(.taskPrimaryAction),');
    expect(css).toContain('.actions .btn[data-action="start"]:not(.taskPrimaryAction),');
    expect(css).toContain('.actions .btn[data-action="stop"]:not(.taskPrimaryAction),');
    expect(css).toContain('.actions .btn.btn-resume[data-action="start"]:not(.taskPrimaryAction)::after');
    expect(css).toContain(".actions .btn:not(.taskPrimaryAction):not(.taskCheckpointRewindBtn),");
    expect(css).not.toContain('.actions .btn[data-action="start"],');
    expect(css).not.toContain('.actions .btn[data-action="stop"],');
    expect(css).not.toContain('.actions .btn.btn-resume[data-action="start"]::after');
    expect(ringRule).toContain("linear-gradient(");
    expect(ringRule).toContain("var(--task-primary-ring-top) 0%");
    expect(ringRule).toContain("var(--task-primary-ring) 54%");
    expect(ringRule).toContain("var(--task-primary-ring-bottom) 100%");
    expect(ringRule).toContain("0 0 18px var(--task-primary-ring-soft)");
    expect(ringRule).toContain("filter: brightness(.96) contrast(1.08) saturate(1.08);");
    expect(ringRule).not.toContain("color-mix(");
    expect(ringRule).not.toContain("transition: transform");
    expect(faceRule).toContain("repeating-radial-gradient");
    expect(faceRule).toContain("linear-gradient(180deg, var(--task-primary-face-top) 0%, var(--task-primary-face-mid) 48%, var(--task-primary-face-bottom) 100%) !important;");
    expect(faceRule).toContain("transform .14s cubic-bezier(.2,.8,.2,1)");
    expect(faceRule).toContain("inset 0 -10px 14px rgba(0,0,0,.52)");
    expect(faceRule).not.toContain("rgba(255,255,255,.18)");
    expect(faceRule).not.toContain("color-mix(in srgb, var(--task-primary-accent)");
    expect(css).not.toContain(".taskPrimaryActionGlyph");
    expect(css).toContain(".taskPrimaryActionPrimary");
    expect(css).toContain('font-family: Orbitron, var(--font-orbitron), "Segoe UI Variable", "Segoe UI", Arial, sans-serif !important;');
    expect(css).toContain("color: var(--task-primary-label);");
    expect(css).not.toContain(".taskPrimaryActionSecondary");
    expect(launchRule).toContain(".btn.taskPrimaryAction.taskPrimaryActionLaunch");
    expect(launchRule).toContain('body[data-app-page="tasks"]');
    expect(launchRule).toContain('body[data-app-page="schedule"]');
    expect(launchRule).toContain("--task-primary-accent: #aeb6c0;");
    expect(launchRule).toContain("--task-primary-ring-top: #26272b;");
    expect(launchRule).toContain("--task-primary-ring: #1d1e21;");
    expect(launchRule).toContain("--task-primary-ring-bottom: #0e1417;");
    expect(launchRule).toContain("--task-primary-ring-soft: rgba(38,39,43,.34);");
    expect(launchRule).toContain("--task-primary-label: #e7ebef;");
    expect(launchRule).toContain("--task-primary-face-top: #2f343b;");
    expect(launchRule).toContain("--task-primary-face-mid: #1e2228;");
    expect(launchRule).toContain("--task-primary-face-bottom: #0c0f13;");
    expect(resumeRule).toContain(".btn.taskPrimaryAction.taskPrimaryActionResume");
    expect(resumeRule).toContain('body[data-app-page="tasks"]');
    expect(resumeRule).toContain('body[data-app-page="schedule"]');
    expect(resumeRule).toContain("--task-primary-accent: #ff7070;");
    expect(resumeRule).toContain("--task-primary-ring: #ff3b3b;");
    expect(resumeRule).toContain("--task-primary-label: #ffc7c7;");
    expect(resumeRule).toContain("--task-primary-face-top: #3b1a1d;");
    expect(resumeRule).toContain("--task-primary-face-mid: #251013;");
    expect(resumeRule).toContain("--task-primary-face-bottom: #100708;");
    expect(stopRule).toContain(".btn.taskPrimaryAction.taskPrimaryActionStop");
    expect(stopRule).toContain('body[data-app-page="tasks"]');
    expect(stopRule).toContain('body[data-app-page="schedule"]');
    expect(stopRule).toContain("--task-primary-accent: #9dfcff;");
    expect(stopRule).toContain("--task-primary-ring: #00e5ff;");
    expect(stopRule).toContain("--task-primary-label: #d7feff;");
    expect(stopRule).toContain("--task-primary-face-top: #193438;");
    expect(stopRule).toContain("--task-primary-face-mid: #122226;");
    expect(stopRule).toContain("--task-primary-face-bottom: #090d10;");
    expect(resetRule).toContain(".btn.taskPrimaryAction.taskPrimaryActionReset");
    expect(resetRule).toContain('body[data-app-page="tasks"]');
    expect(resetRule).toContain('body[data-app-page="schedule"]');
    expect(resetRule).toContain("--task-primary-accent: #ffd66b;");
    expect(resetRule).toContain("--task-primary-ring: #ffd23f;");
    expect(resetRule).toContain("--task-primary-label: #ffe9a8;");
    expect(resetRule).toContain("--task-primary-face-top: #3a3018;");
    expect(resetRule).toContain("--task-primary-face-mid: #241d10;");
    expect(resetRule).toContain("--task-primary-face-bottom: #100c07;");
    expect(doneRule).toContain("--task-primary-accent: #77f0a0;");
    expect(doneRule).toContain("--task-primary-label: #c8ffd9;");
    expect(doneRule).toContain("--task-primary-face-top: #1a3827;");
    expect(doneRule).toContain("--task-primary-face-mid: #112519;");
    expect(doneRule).toContain("--task-primary-face-bottom: #07100b;");
    expect(hoverRule).toContain("transform: none !important;");
    expect(hoverFaceRule).toContain("transform: none !important;");
    expect(hoverFaceRule).not.toContain("translateY(-1px)");
    expect(pressedRule).not.toContain("transform:");
    expect(pressedFaceRule).toContain("transform: translateY(3px) scale(.975);");
    expect(css).not.toMatch(/\.taskPrimaryAction\.isTaskPrimaryActionPressed:not\(:disabled\) \.taskPrimaryActionRing\{/);
    expect(css).not.toMatch(/\.taskPrimaryAction[\s\S]*?\{\n(?:[\s\S]*?\n)?\s*transition: none !important;\n\s*transform: none !important;/);
  });

  it("renders completed time-goal tasks with a primary reset action while preserving edit hooks", () => {
    const rendered = renderCard({
      isTimeGoalCompleted: true,
      elapsedMs: 60_000,
    });

    expect(rendered.className).toBe("task taskCompleted");
    expect(rendered.html).toContain('data-action="reset" title="Reset" aria-label="Reset"');
    expect(rendered.html).toContain("btn btn-warn small taskPrimaryAction taskPrimaryActionReset");
    expect(rendered.html).toContain('<span class="taskPrimaryActionPrimary">Reset</span>');
    expect(rendered.html).not.toContain("taskPrimaryActionSecondary");
    expect(rendered.html).not.toContain('<span class="taskPrimaryActionPrimary">Done</span>');
    expect(rendered.html).not.toContain("taskDoneIcon");
    expect(rendered.html).not.toContain("taskPrimaryAction taskPrimaryActionDone");
    expect(rendered.html).not.toContain('aria-label="Done until tomorrow"');
    expect(rendered.html).not.toContain('data-action="reset" title="Reset" aria-label="Reset" type="button" disabled');
    expect(rendered.html).toContain('data-action="reset"');
    expect(rendered.html).toContain('data-action="reset" title="Reset" aria-label="Reset"');
    expect(rendered.html).not.toContain('data-action="reset" title="Reset" aria-label="Reset" disabled');
    expect(rendered.html).toContain('data-action="edit"');
  });

  it("renders stale completed runs with a disabled Completed primary action", () => {
    const rendered = renderCard({
      isTimeGoalCompleted: true,
      isStaleRecordedGoalCompleted: true,
      elapsedMs: 60_000,
    });

    expect(rendered.className).toBe("task taskCompleted");
    expect(rendered.html).toContain('data-action="reset" title="Completed" aria-label="Completed" type="button" disabled');
    expect(rendered.html).toContain("btn btn-done small taskPrimaryAction taskPrimaryActionDone");
    expect(rendered.html).toContain('<span class="taskPrimaryActionPrimary">Completed</span>');
    expect(rendered.html).not.toContain("taskPrimaryAction taskPrimaryActionReset");
    expect(rendered.html).not.toContain('<span class="taskPrimaryActionPrimary">Resume</span>');
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

  it("alternates checkpoint labels below and above the progress bar", () => {
    const rendered = renderCard({
      sortedMilestones: [
        { hours: 0.5, description: "" },
        { hours: 1, description: "" },
        { hours: 1.5, description: "" },
        { hours: 1.75, description: "" },
      ],
      timeGoalSec: 2 * 3600,
    });

    const checkpointLabelClasses = Array.from(rendered.html.matchAll(/<div class="mkTime ([^"]*)"[^>]*>(30m|1h|1h 30m|1h 45m)<\/div>/g)).map(
      (match) => match[1]
    );

    expect(checkpointLabelClasses).toHaveLength(4);
    expect(checkpointLabelClasses[0]).not.toContain("mkTimeTop");
    expect(checkpointLabelClasses[1]).toContain("mkTimeTop");
    expect(checkpointLabelClasses[2]).not.toContain("mkTimeTop");
    expect(checkpointLabelClasses[3]).toContain("mkTimeTop");
  });

  it("hides checkpoint labels containing seconds while retaining their markers", () => {
    const rendered = renderCard({
      sortedMilestones: [
        { hours: 5 / 60, description: "" },
        { hours: 5.5 / 60, description: "" },
        { hours: 8 / 60, description: "" },
      ],
      timeGoalSec: 10 * 60,
    });

    expect(rendered.html).toContain(">5m<");
    expect(rendered.html).not.toContain(">5m 30s<");
    expect(rendered.html).toMatch(/class="mkTime mkTimeTop [^"]*"[^>]*>8m<\/div>/);
    expect(rendered.html.match(/class="mkFlag mkPend"/g)).toHaveLength(3);
  });

  it("marks reached checkpoints for green tick styling while leaving pending checkpoints as dots", () => {
    const rendered = renderCard({
      elapsedMs: 6 * 60 * 1000,
      sortedMilestones: [
        { hours: 5 / 60, description: "" },
        { hours: 8 / 60, description: "" },
      ],
      timeGoalSec: 10 * 60,
    });
    const css = readFileSync(new URL("../styles/02-tasks.css", import.meta.url), "utf8");
    const reachedCheckpointRule =
      css.match(/\.mkFlag\.mkAch:not\(\.mkGoal\)\{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(rendered.html.match(/class="mkFlag mkAch"/g)).toHaveLength(1);
    expect(rendered.html.match(/class="mkFlag mkPend"/g)).toHaveLength(1);
    expect(reachedCheckpointRule).toContain("border-left: 2px solid #7dff72;");
    expect(reachedCheckpointRule).toContain("border-bottom: 2px solid #7dff72;");
    expect(reachedCheckpointRule).toContain("rotate(-45deg)");
  });

  it("keeps baseline and goal labels below the progress bar", () => {
    const rendered = renderCard({
      sortedMilestones: [
        { hours: 0.5, description: "" },
        { hours: 1, description: "" },
      ],
      timeGoalSec: 2 * 3600,
    });

    expect(rendered.html).toMatch(/class="mkTime mkAch mkEdgeL"[^>]*>0m<\/div>/);
    expect(rendered.html).toMatch(/class="mkTime mkGoalTime [^"]*"[^>]*>2h<\/div>/);
    expect(rendered.html).not.toMatch(/class="mkTime mkTimeTop mkAch mkEdgeL"[^>]*>0m<\/div>/);
    expect(rendered.html).not.toMatch(/class="mkTime mkGoalTime mkTimeTop/);
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
      action: "fastForwardCheckpoint",
      canUseAdvancedHistory: true,
      canUseSocialFeatures: true,
      showUpgradePrompt: (featureName) => calls.push(`upgrade:${featureName}`),
      handlers: {
        fastForwardCheckpoint: () => calls.push("forward"),
      },
    });

    expect(handled).toBe(true);
    expect(calls).toEqual(["forward"]);
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
