import type { Milestone, Task } from "../lib/types";
import { normalizeTaskColor } from "../lib/taskColors";

type TaskProgressMarkerModel =
  | {
      kind: "baseline";
      leftPos: number;
      edgeClass: string;
      label: string;
    }
  | {
      kind: "milestone";
      leftPos: number;
      edgeClass: string;
      reached: boolean;
      showLabel: boolean;
      wrapClass: string;
      label: string;
      description: string;
    }
  | {
      kind: "goal";
      leftPos: number;
      edgeClass: string;
      reached: boolean;
      label: string;
    };

type TaskProgressModel = {
  pct: number;
  markers: TaskProgressMarkerModel[];
};

type TaskHistoryRevealPhase = "opening" | "closing" | "open" | null;

type RenderTaskCardOptions = {
  task: Task;
  taskId: string;
  elapsedMs: number;
  sortedMilestones: Milestone[];
  milestoneUnitSec: number;
  milestoneUnitSuffix: string;
  timeGoalSec: number;
  checkpointRepeatActiveTaskId: string | null | undefined;
  activeCheckpointToastTaskId: string | null | undefined;
  historyRevealPhase: TaskHistoryRevealPhase;
  showHistory: boolean;
  isHistoryPinned: boolean;
  canUseAdvancedHistory: boolean;
  canUseSocialFeatures: boolean;
  isSharedByOwner: boolean;
  dynamicColorsEnabled: boolean;
  modeColor: string;
  fillBackgroundForPct: (pct: number) => string;
  escapeHtml: (value: string) => string;
  formatMainTaskElapsedHtml: (elapsedMs: number, running: boolean) => string;
};

type RenderedTaskCard = {
  className: string;
  html: string;
};

export type TaskCardActionHandlers = Record<string, () => void>;

type DispatchTaskCardActionOptions = {
  action: string;
  canUseAdvancedHistory: boolean;
  canUseSocialFeatures: boolean;
  showUpgradePrompt: (featureName: string, plan?: "pro") => void;
  handlers: Partial<TaskCardActionHandlers>;
};

export function buildTaskProgressModel({
  milestones,
  elapsedSec,
  milestoneUnitSec,
  unitSuffix,
  timeGoalSec,
}: {
  milestones: Milestone[];
  elapsedSec: number;
  milestoneUnitSec: number;
  unitSuffix: string;
  timeGoalSec: number;
}): TaskProgressModel | null {
  const safeMilestones = Array.isArray(milestones) ? milestones : [];
  const hasMilestones = safeMilestones.length > 0;
  const hasTimeGoal = Number(timeGoalSec || 0) > 0;
  if (!hasMilestones && !hasTimeGoal) return null;

  const maxValue = hasMilestones ? Math.max(...safeMilestones.map((m) => +m.hours || 0), 0) : 0;
  const maxSec = Math.max(maxValue * milestoneUnitSec, Math.max(0, Number(timeGoalSec || 0)), 1);
  const safeElapsedSec = Math.max(0, Number(elapsedSec || 0));
  const pct = Math.min((safeElapsedSec / maxSec) * 100, 100);
  const markers: TaskProgressMarkerModel[] = [
    {
      kind: "baseline",
      leftPos: 0,
      edgeClass: "mkEdgeL",
      label: `0${unitSuffix}`,
    },
  ];

  const nextPendingIndex = safeMilestones.findIndex((m) => safeElapsedSec < (+m.hours || 0) * milestoneUnitSec);
  const labelTargetIndex = nextPendingIndex >= 0 ? nextPendingIndex : Math.max(0, safeMilestones.length - 1);

  safeMilestones.forEach((milestone, milestoneIndex) => {
    const value = +milestone.hours || 0;
    const secTarget = value * milestoneUnitSec;
    const left = Math.max(0, Math.min((secTarget / maxSec) * 100, 100));
    const reached = safeElapsedSec >= secTarget;
    const edgeClass = left <= 1 ? "mkEdgeL" : left >= 99 ? "mkEdgeR" : "";
    const leftPos = edgeClass === "mkEdgeL" ? 0 : edgeClass === "mkEdgeR" ? 100 : left;
    const label = `${value}${unitSuffix}`;
    markers.push({
      kind: "milestone",
      leftPos,
      edgeClass,
      reached,
      showLabel: milestoneIndex === labelTargetIndex,
      wrapClass: edgeClass && label.length > 8 ? "mkWrap8" : "",
      label,
      description: String(milestone.description || "").trim(),
    });
  });

  if (hasTimeGoal) {
    const goalSec = Math.max(0, Number(timeGoalSec || 0));
    const goalLeft = Math.max(0, Math.min((Math.max(0, Number(timeGoalSec || 0)) / maxSec) * 100, 100));
    const edgeClass = goalLeft <= 1 ? "mkEdgeL" : goalLeft >= 99 ? "mkEdgeR" : "";
    const leftPos = edgeClass === "mkEdgeL" ? 0 : edgeClass === "mkEdgeR" ? 100 : goalLeft;
    const goalMinutes = Math.round(goalSec / 60);
    const label =
      goalMinutes > 0 && goalMinutes % 60 === 0 ? `${goalMinutes / 60}h` : goalMinutes >= 60 ? `${Math.floor(goalMinutes / 60)}h ${goalMinutes % 60}m` : `${goalMinutes}m`;
    markers.push({
      kind: "goal",
      leftPos,
      edgeClass,
      reached: safeElapsedSec >= Math.max(0, Number(timeGoalSec || 0)),
      label,
    });
  }

  return { pct, markers };
}

export function renderTaskProgressHtml(
  model: TaskProgressModel | null,
  opts: { fillColor: string; escapeHtml: (value: string) => string }
) {
  if (!model) return "";
  const { escapeHtml, fillColor } = opts;
  const markersHtml = model.markers
    .map((marker) => {
      if (marker.kind === "baseline") {
        return `
          <div class="mkLine" style="left:0%"></div>
          <div class="mkTime mkAch ${marker.edgeClass}" style="left:${marker.leftPos}%">${escapeHtml(marker.label)}</div>`;
      }
      if (marker.kind === "goal") {
        return `
            <div class="mkFlag mkGoal ${marker.reached ? "mkAch" : "mkPend"} ${marker.edgeClass}" style="left:${marker.leftPos}%"></div>
            <div class="mkTime mkGoalTime ${marker.reached ? "mkAch" : "mkPend"} ${marker.edgeClass}" style="left:${marker.leftPos}%">${escapeHtml(marker.label)}</div>`;
      }
      const markerClass = marker.reached ? "mkAch" : "mkPend";
      return `
            <div class="mkFlag ${markerClass}" style="left:${marker.leftPos}%"></div>
            ${
              marker.showLabel
                ? `<div class="mkTime ${markerClass} ${marker.edgeClass} ${marker.wrapClass}" style="left:${marker.leftPos}%">${escapeHtml(marker.label)}</div>`
                : ``
            }
            ${
              marker.showLabel && marker.description
                ? `<div class="mkDesc ${markerClass} ${marker.edgeClass}" style="left:${marker.leftPos}%">${escapeHtml(marker.description)}</div>`
                : ``
            }`;
    })
    .join("");

  return `
          <div class="progressRow">
            <div class="progressWrap">
              <div class="progressTrack">
                <div class="progressFill" style="width:${model.pct}%;background:${fillColor}"></div>
                ${markersHtml}
              </div>
            </div>
          </div>`;
}

function renderTaskHistoryInlineHtml({
  taskName,
  historyRevealPhase,
  isHistoryPinned,
  canUseAdvancedHistory,
  escapeHtml,
}: {
  taskName: string;
  historyRevealPhase: TaskHistoryRevealPhase;
  isHistoryPinned: boolean;
  canUseAdvancedHistory: boolean;
  escapeHtml: (value: string) => string;
}) {
  return `
          <section class="historyInline historyInlineMotion${historyRevealPhase === "opening" ? " isOpening" : ""}${historyRevealPhase === "closing" ? " isClosing" : ""}${historyRevealPhase === "open" ? " isOpen" : ""}" aria-label="History for ${escapeHtml(taskName)}">
              <div class="historyTop">
                <div class="historyMeta"><div class="historyTitle historyInlineTitle">History</div></div>
                <div class="historyMeta historyTopActions">
                  <span class="historyTopDivider" aria-hidden="true"></span>
                  <button class="btn btn-ghost small historyViewSummaryBtn" type="button" data-history-action="viewSummary" title="View Summary" aria-label="View Summary">View Summary</button>
                  <button class="btn btn-ghost small historyClearLockBtn" type="button" data-history-action="clearLocks" title="Clear locked selections" aria-label="Clear locked selections" style="display:none">Clear</button>
                  <button class="historyPinBtn ${isHistoryPinned ? "isOn" : ""}" type="button" data-history-action="pin" title="${canUseAdvancedHistory ? (isHistoryPinned ? "Unpin chart" : "Pin chart") : "Pro feature: Pin chart"}" aria-label="${canUseAdvancedHistory ? (isHistoryPinned ? "Unpin chart" : "Pin chart") : "Pro feature: Pin chart"}" ${canUseAdvancedHistory ? "" : 'data-plan-locked="advancedHistory"'}>&#128204;</button>
                </div>
              </div>
            <div class="historyCanvasWrap"><canvas class="historyChartInline"></canvas></div>
            <div class="historyTrashRow"></div>
            <div class="historyRangeRow">
              <div class="historyRangeInfo">
                <div class="historyMeta historyRangeText">&nbsp;</div>
                <div class="historyRangeToggleRow" aria-label="History range">
                  <button class="switch historyRangeToggle" type="button" role="switch" aria-checked="false" data-history-range-toggle="true"></button>
                  <div class="taskScreenPillGroup historyRangeModeGroup" role="group" aria-label="History display mode">
                    <button class="taskScreenPill taskScreenHeaderBtn historyRangeModeTab isOn" type="button" data-history-range-mode="entries" aria-pressed="true">
                      <span class="taskScreenHeaderBtnText">Entries</span>
                    </button>
                    <button class="taskScreenPill taskScreenHeaderBtn historyRangeModeTab" type="button" data-history-range-mode="day" aria-pressed="false">
                      <span class="taskScreenHeaderBtnText">Day</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <button class="historyDrawerReveal" type="button" data-action="history" title="Hide history chart" aria-label="Hide history chart" aria-pressed="true" ${isHistoryPinned ? "disabled" : ""}>
              <span class="historyDrawerRevealText">HIDE CHART</span>
            </button>
          </section>
        `;
}

export function renderTaskCardHtml(options: RenderTaskCardOptions): RenderedTaskCard {
  const {
    task,
    taskId,
    elapsedMs,
    sortedMilestones,
    milestoneUnitSec,
    milestoneUnitSuffix,
    timeGoalSec,
    checkpointRepeatActiveTaskId,
    activeCheckpointToastTaskId,
    historyRevealPhase,
    showHistory,
    isHistoryPinned,
    canUseAdvancedHistory,
    canUseSocialFeatures,
    isSharedByOwner,
    dynamicColorsEnabled,
    modeColor,
    fillBackgroundForPct,
    escapeHtml,
    formatMainTaskElapsedHtml,
  } = options;
  const elapsedSec = elapsedMs / 1000;
  const hasActiveToastForTask = !!activeCheckpointToastTaskId && String(activeCheckpointToastTaskId) === taskId;
  const hasCheckpointRepeatForTask = !!checkpointRepeatActiveTaskId && String(checkpointRepeatActiveTaskId) === taskId;
  const className =
    "task" +
    (task.running ? " taskRunning" : "") +
    (task.collapsed ? " collapsed" : "") +
    (hasCheckpointRepeatForTask || hasActiveToastForTask ? " taskAlertPulse" : "");
  const taskColor = normalizeTaskColor(task.color);
  const taskColorPillHtml = taskColor
    ? `<span class="taskColorPill" aria-label="Task color" style="--task-color:${escapeHtml(taskColor)}"></span>`
    : "";
  const collapseLabel = task.collapsed ? "Show progress bar" : "Hide progress bar";
  const progressModel = buildTaskProgressModel({
    milestones: sortedMilestones,
    elapsedSec,
    milestoneUnitSec,
    unitSuffix: milestoneUnitSuffix,
    timeGoalSec,
  });
  const progressHTML = renderTaskProgressHtml(progressModel, {
    fillColor: dynamicColorsEnabled ? fillBackgroundForPct(progressModel?.pct || 0) : modeColor,
    escapeHtml,
  });
  const historyHTML = showHistory
    ? renderTaskHistoryInlineHtml({
        taskName: task.name,
        historyRevealPhase,
        isHistoryPinned,
        canUseAdvancedHistory,
        escapeHtml,
      })
    : "";
  const startStopHtml = task.running
    ? '<button class="btn btn-warn small" data-action="stop" title="Stop">Stop</button>'
    : elapsedMs > 0
      ? '<button class="btn btn-resume small" data-action="start" title="Resume">Resume</button>'
      : '<button class="btn btn-accent small" data-action="start" title="Launch">Launch</button>';
  const shareAction = isSharedByOwner ? "unshareTask" : "shareTask";
  const shareLabel = canUseSocialFeatures ? (isSharedByOwner ? "Unshare" : "Share") : "Share (Pro)";
  const shareTitle = canUseSocialFeatures ? (isSharedByOwner ? "Unshare" : "Share") : "Pro feature: Sharing";
  const manualEntryLabel = canUseAdvancedHistory ? "Add Manual Entry" : "Add Manual Entry (Pro)";
  const manualEntryTitle = canUseAdvancedHistory ? "Add Manual Entry" : "Pro feature: Manual history entry";
  return {
    className,
    html: `
        <div class="taskFlipScene">
          <div class="taskFace taskFaceFront">
            <div class="taskFaceShell taskFaceShellFront">
            ${
              hasCheckpointRepeatForTask
                ? '<button class="iconBtn checkpointMuteBtn" data-action="muteCheckpointAlert" title="Mute checkpoint alert" aria-label="Mute checkpoint alert">&#128276;</button>'
                : ""
            }
            ${taskColorPillHtml}
            <div class="row">
              <div class="taskHeadMain"><div class="name" data-action="editName" title="Open focus mode">${escapeHtml(task.name)}</div></div>
              <div class="time" data-action="focus" title="Open focus mode">${formatMainTaskElapsedHtml(elapsedMs, !!task.running)}</div>
              <div class="actions">
                ${startStopHtml}
                <button class="iconBtn" data-action="reset" title="${task.running ? "Stop task to reset" : "Reset"}" aria-label="${task.running ? "Stop task to reset" : "Reset"}" ${task.running ? "disabled" : ""}>&#10227;</button>
                <button class="iconBtn" data-action="edit" title="Edit">&#9998;</button>
                <button class="iconBtn taskFlipBtn" type="button" data-task-flip="open" title="More actions" aria-label="More actions" aria-expanded="false">&#9776;</button>
              </div>
            </div>
            ${progressHTML}
            <button class="taskHistoryReveal ${showHistory ? "isOpen" : ""}${historyRevealPhase === "opening" ? " isOpening" : ""}${historyRevealPhase === "closing" ? " isClosing" : ""}" type="button" data-action="history" title="${showHistory ? "Hide history chart" : "Show history chart"}" aria-label="${showHistory ? "Hide history chart" : "Show history chart"}" aria-pressed="${showHistory ? "true" : "false"}" ${isHistoryPinned ? "disabled" : ""}>
              <span class="taskHistoryRevealText">${showHistory ? "HIDE CHART" : "VIEW CHART"}</span>
            </button>
            ${historyHTML}
            </div>
          </div>
          <div class="taskFace taskFaceBack" aria-hidden="true" inert>
            <div class="taskFaceShell taskFaceShellBack">
            <div class="taskBack">
              <div class="taskBackHead">
                <div class="taskBackTitle">${escapeHtml(task.name)}</div>
                <button class="iconBtn taskFlipBtn taskFlipBackBtn" type="button" data-task-flip="close" title="Back to task" aria-label="Back to task" aria-expanded="false">&#8594;</button>
              </div>
              <div class="taskBackActions">
                <button class="taskMenuItem" data-action="manualEntry" title="${manualEntryTitle}" type="button" ${canUseAdvancedHistory ? "" : 'data-plan-locked="advancedHistory"'}>${manualEntryLabel}</button>
                <button class="taskMenuItem" data-action="collapse" title="${escapeHtml(collapseLabel)}" type="button">${escapeHtml(collapseLabel)}</button>
                <button class="taskMenuItem" data-action="${shareAction}" title="${shareTitle}" type="button" ${canUseSocialFeatures ? "" : 'data-plan-locked="socialFeatures"'}>${shareLabel}</button>
                <button class="taskMenuItem" data-action="exportTask" title="Export" type="button">Export</button>
                <button class="taskMenuItem taskMenuItemDelete" data-action="delete" title="Delete" type="button">Delete</button>
              </div>
            </div>
            </div>
          </div>
        </div>
      `,
  };
}

export function dispatchTaskCardAction(options: DispatchTaskCardActionOptions) {
  const { action, canUseAdvancedHistory, canUseSocialFeatures, showUpgradePrompt, handlers } = options;
  if ((action === "shareTask" || action === "unshareTask") && !canUseSocialFeatures) {
    showUpgradePrompt("Task sharing and friends", "pro");
    return true;
  }
  if (action === "manualEntry" && !canUseAdvancedHistory) {
    showUpgradePrompt("Manual history entry", "pro");
    return true;
  }
  const handler = handlers[action];
  if (!handler) return false;
  handler();
  return true;
}
