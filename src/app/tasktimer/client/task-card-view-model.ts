import type { Milestone, Task } from "../lib/types";
import { normalizeTaskColor } from "../lib/taskColors";
import { formatCompactCheckpointDuration } from "./checkpoint-duration-format";

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
      wrapClass: string;
      labelPositionClass: "" | "mkTimeTop";
      showLabel: boolean;
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

type TaskHistoryRevealPhase = "openingSpace" | "opening" | "closing" | "closingSpace" | "open" | null;

const TASK_HISTORY_TAB_BORDER_GAP_PX = 160;

export type TaskPrimaryActionState = "launch" | "resume" | "stop" | "reset" | "done";

type TaskPrimaryActionModel = {
  className: string;
  dataAction: "start" | "stop" | "reset";
  title: string;
  ariaLabel: string;
  disabled: boolean;
  innerHtml: string;
};

type RenderTaskCardOptions = {
  task: Task;
  taskId: string;
  elapsedMs: number;
  sortedMilestones: Milestone[];
  milestoneUnitSec: number;
  milestoneUnitSuffix: string;
  timeGoalSec: number;
  checkpointRepeatActiveTaskId: string | null | undefined;
  checkpointFlashActive: boolean;
  historyRevealPhase: TaskHistoryRevealPhase;
  showHistory: boolean;
  isHistoryPinned: boolean;
  canUseAdvancedHistory: boolean;
  canUseSocialFeatures: boolean;
  hasFriends: boolean;
  isSharedByOwner: boolean;
  isTimeGoalCompleted: boolean;
  hasTaskHistory: boolean;
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

function renderTaskBackActionTile(label: string, escapeHtml: (value: string) => string, iconSrc?: string) {
  const trimmedLabel = label.trim();
  const iconHtml = iconSrc
    ? `<img class="taskMenuTileIcon" src="${escapeHtml(iconSrc)}" alt="" aria-hidden="true" />`
    : "";
  return `<span class="taskMenuTile">${iconHtml}<span class="taskMenuTileLabel">${escapeHtml(trimmedLabel)}</span></span>`;
}

function renderTaskPrimaryActionLabelHtml(state: TaskPrimaryActionState) {
  const labels: Record<TaskPrimaryActionState, string> = {
    launch: "Launch",
    resume: "Resume",
    stop: "Stop",
    reset: "Reset",
    done: "Reset",
  };
  return `<span class="taskPrimaryActionText"><span class="taskPrimaryActionPrimary">${labels[state]}</span></span>`;
}

export function getTaskPrimaryActionModel(state: TaskPrimaryActionState, opts?: { doneTitle?: string }): TaskPrimaryActionModel {
  const title =
    state === "done" ? opts?.doneTitle || "Done until tomorrow" : state === "reset" ? "Reset" : state === "resume" ? "Resume" : state === "stop" ? "Stop" : "Launch";
  const stateClass = state[0].toUpperCase() + state.slice(1);
  const baseClass =
    state === "done"
      ? "btn btn-done small"
      : state === "resume"
        ? "btn btn-resume small"
        : state === "stop" || state === "reset"
          ? "btn btn-warn small"
          : "btn btn-accent small";

  return {
    className: `${baseClass} taskPrimaryAction taskPrimaryAction${stateClass}`,
    dataAction: state === "stop" ? "stop" : state === "reset" ? "reset" : "start",
    title,
    ariaLabel: title,
    disabled: state === "done",
    innerHtml: `<span class="taskPrimaryActionRing" aria-hidden="true"></span><span class="taskPrimaryActionFace"><span class="taskPrimaryActionLabel">${renderTaskPrimaryActionLabelHtml(
      state
    )}</span></span>`,
  };
}

export function renderTaskPrimaryActionHtml(state: TaskPrimaryActionState, opts?: { doneTitle?: string }) {
  const model = getTaskPrimaryActionModel(state, opts);
  return `<button class="${model.className}" data-action="${model.dataAction}" title="${model.title}" aria-label="${model.ariaLabel}" type="button" ${
    model.disabled ? "disabled" : ""
  }>${model.innerHtml}</button>`;
}

function getPreviousRenderedCheckpointTargetMs({
  elapsedMs,
  sortedMilestones,
  milestoneUnitSec,
}: {
  elapsedMs: number;
  sortedMilestones: Milestone[];
  milestoneUnitSec: number;
}) {
  const safeElapsedMs = Math.max(0, Math.floor(Number(elapsedMs) || 0));
  const unitSec = Math.max(0, Number(milestoneUnitSec) || 0);
  if (!(safeElapsedMs > 0) || !(unitSec > 0) || !Array.isArray(sortedMilestones) || !sortedMilestones.length) return null;
  const targetMsValues = Array.from(
    new Set(
      sortedMilestones
        .map((milestone) => Math.max(0, Math.round((Number(milestone?.hours) || 0) * unitSec)) * 1000)
        .filter((value) => value > 0)
    )
  ).sort((a, b) => a - b);
  for (let index = targetMsValues.length - 1; index >= 0; index -= 1) {
    const targetMs = targetMsValues[index]!;
    if (targetMs < safeElapsedMs) return targetMs;
  }
  return null;
}

function getRenderedCheckpointTargetMsValues({
  sortedMilestones,
  milestoneUnitSec,
}: {
  sortedMilestones: Milestone[];
  milestoneUnitSec: number;
}) {
  const unitSec = Math.max(0, Number(milestoneUnitSec) || 0);
  if (!(unitSec > 0) || !Array.isArray(sortedMilestones) || !sortedMilestones.length) return [];
  return Array.from(
    new Set(
      sortedMilestones
        .map((milestone) => Math.max(0, Math.round((Number(milestone?.hours) || 0) * unitSec)) * 1000)
        .filter((value) => value > 0)
    )
  ).sort((a, b) => a - b);
}

function getNextRenderedCheckpointTargetMs({
  elapsedMs,
  sortedMilestones,
  milestoneUnitSec,
}: {
  elapsedMs: number;
  sortedMilestones: Milestone[];
  milestoneUnitSec: number;
}) {
  const safeElapsedMs = Math.max(0, Math.floor(Number(elapsedMs) || 0));
  const targetMsValues = getRenderedCheckpointTargetMsValues({ sortedMilestones, milestoneUnitSec });
  for (let index = 0; index < targetMsValues.length; index += 1) {
    const targetMs = targetMsValues[index]!;
    if (targetMs > safeElapsedMs) return targetMs;
  }
  return null;
}

function isElapsedAtRenderedCheckpoint({
  elapsedMs,
  sortedMilestones,
  milestoneUnitSec,
}: {
  elapsedMs: number;
  sortedMilestones: Milestone[];
  milestoneUnitSec: number;
}) {
  const safeElapsedMs = Math.max(0, Math.floor(Number(elapsedMs) || 0));
  return getRenderedCheckpointTargetMsValues({ sortedMilestones, milestoneUnitSec }).includes(safeElapsedMs);
}

function renderTaskPrimaryActionWithRewindHtml({
  state,
  elapsedMs,
  sortedMilestones,
  milestoneUnitSec,
}: {
  state: TaskPrimaryActionState;
  elapsedMs: number;
  sortedMilestones: Milestone[];
  milestoneUnitSec: number;
}) {
  if (state !== "resume") return renderTaskPrimaryActionHtml(state);
  const previousTargetMs = getPreviousRenderedCheckpointTargetMs({ elapsedMs, sortedMilestones, milestoneUnitSec });
  const nextTargetMs = isElapsedAtRenderedCheckpoint({ elapsedMs, sortedMilestones, milestoneUnitSec })
    ? getNextRenderedCheckpointTargetMs({ elapsedMs, sortedMilestones, milestoneUnitSec })
    : null;
  if (previousTargetMs == null && nextTargetMs == null) return renderTaskPrimaryActionHtml(state);
  const previousButtonHtml =
    previousTargetMs == null
      ? ""
      : `<button class="btn btn-ghost small taskCheckpointRewindBtn taskCheckpointRewindBackBtn" data-action="rewindCheckpoint" title="Back to previous checkpoint" aria-label="Back to previous checkpoint" type="button">&#8592;</button>`;
  const nextButtonHtml =
    nextTargetMs == null
      ? ""
      : `<button class="btn btn-ghost small taskCheckpointRewindBtn taskCheckpointRewindForwardBtn" data-action="fastForwardCheckpoint" title="Forward to next checkpoint" aria-label="Forward to next checkpoint" type="button">&#8594;</button>`;
  return `
                  <div class="taskCheckpointRewindGroup isCheckpointRewindOpen">
                    ${previousButtonHtml}
                    ${renderTaskPrimaryActionHtml(state)}
                    ${nextButtonHtml}
                  </div>`;
}

export function buildTaskProgressModel({
  milestones,
  elapsedSec,
  milestoneUnitSec,
  timeGoalSec,
}: {
  milestones: Milestone[];
  elapsedSec: number;
  milestoneUnitSec: number;
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
      label: formatCompactCheckpointDuration(0),
    },
  ];

  let visibleMilestoneLabelIndex = 0;
  safeMilestones.forEach((milestone) => {
    const value = +milestone.hours || 0;
    const secTarget = value * milestoneUnitSec;
    const showLabel = Math.round(secTarget) % 60 === 0;
    const left = Math.max(0, Math.min((secTarget / maxSec) * 100, 100));
    const reached = safeElapsedSec >= secTarget;
    const edgeClass = left <= 1 ? "mkEdgeL" : left >= 99 ? "mkEdgeR" : "";
    const leftPos = edgeClass === "mkEdgeL" ? 0 : edgeClass === "mkEdgeR" ? 100 : left;
    const label = formatCompactCheckpointDuration(secTarget);
    markers.push({
      kind: "milestone",
      leftPos,
      edgeClass,
      reached,
      wrapClass: edgeClass && label.length > 8 ? "mkWrap8" : "",
      labelPositionClass: showLabel && visibleMilestoneLabelIndex % 2 === 1 ? "mkTimeTop" : "",
      showLabel,
      label,
      description: "",
    });
    if (showLabel) visibleMilestoneLabelIndex += 1;
  });

  if (hasTimeGoal) {
    const goalSec = Math.max(0, Number(timeGoalSec || 0));
    const goalLeft = Math.max(0, Math.min((Math.max(0, Number(timeGoalSec || 0)) / maxSec) * 100, 100));
    const edgeClass = goalLeft <= 1 ? "mkEdgeL" : goalLeft >= 99 ? "mkEdgeR" : "";
    const leftPos = edgeClass === "mkEdgeL" ? 0 : edgeClass === "mkEdgeR" ? 100 : goalLeft;
    const label = formatCompactCheckpointDuration(goalSec);
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
  if (!model) {
    return `
          <div class="progressRow progressRowEmpty" aria-hidden="true">
            <div class="progressWrap"></div>
          </div>`;
  }
  const { escapeHtml, fillColor } = opts;
  const progressPctLabel = `${Math.round(model.pct)}%`;
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
                ? `<div class="mkTime ${marker.labelPositionClass} ${markerClass} ${marker.edgeClass} ${marker.wrapClass}" style="left:${marker.leftPos}%">${escapeHtml(marker.label)}</div>`
                : ""
            }
            `;
    })
    .join("");

  return `
          <div class="progressRow">
            <div class="progressWrap">
              <div class="progressTrack">
                <div class="progressFill" style="width:${model.pct}%;background:${fillColor}"></div>
                <div class="progressPctLabel" aria-hidden="true">${escapeHtml(progressPctLabel)}</div>
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
          <section class="historyInline historyInlineMotion${historyRevealPhase === "openingSpace" ? " isOpeningSpace" : ""}${historyRevealPhase === "opening" ? " isOpening" : ""}${historyRevealPhase === "closing" ? " isClosing" : ""}${historyRevealPhase === "closingSpace" ? " isClosingSpace" : ""}${historyRevealPhase === "open" ? " isOpen" : ""}" aria-label="History for ${escapeHtml(taskName)}">
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
            <button class="historyDrawerReveal" type="button" data-action="history" title="Hide history chart" aria-label="Hide history chart" aria-pressed="true" ${isHistoryPinned ? 'aria-disabled="true"' : ""}>
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
    timeGoalSec,
    checkpointRepeatActiveTaskId,
    checkpointFlashActive,
    historyRevealPhase,
    showHistory,
    isHistoryPinned,
    canUseAdvancedHistory,
    canUseSocialFeatures,
    hasFriends,
    isSharedByOwner,
    isTimeGoalCompleted,
    hasTaskHistory,
    dynamicColorsEnabled,
    modeColor,
    fillBackgroundForPct,
    escapeHtml,
    formatMainTaskElapsedHtml,
  } = options;
  const elapsedSec = elapsedMs / 1000;
  const hasCheckpointRepeatForTask = !!checkpointRepeatActiveTaskId && String(checkpointRepeatActiveTaskId) === taskId;
  const className =
    "task" +
    (task.running ? " taskRunning" : "") +
    (isTimeGoalCompleted ? " taskCompleted" : "") +
    (task.collapsed ? " collapsed" : "") +
    (checkpointFlashActive ? " taskCheckpointFlash" : "") +
    (historyRevealPhase === "openingSpace" ? " taskHistoryOpeningSpace" : "") +
    (historyRevealPhase === "opening" ? " taskHistoryOpening" : "") +
    (historyRevealPhase === "closing" ? " taskHistoryClosing" : "") +
    (historyRevealPhase === "closingSpace" ? " taskHistoryClosingSpace" : "") +
    (historyRevealPhase === "open" ? " taskHistoryOpen" : "");
  const taskColor = normalizeTaskColor(task.color);
  const taskColorPillHtml = taskColor
    ? `<span class="taskColorPill" aria-label="Task color" style="--task-color:${escapeHtml(taskColor)}"></span>`
    : "";
  const progressModel = buildTaskProgressModel({
    milestones: sortedMilestones,
    elapsedSec,
    milestoneUnitSec,
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
  const primaryActionState: TaskPrimaryActionState = isTimeGoalCompleted
    ? "reset"
    : task.running
      ? "stop"
      : elapsedMs > 0
        ? "resume"
        : "launch";
  const startStopHtml = renderTaskPrimaryActionWithRewindHtml({
    state: primaryActionState,
    elapsedMs,
    sortedMilestones,
    milestoneUnitSec,
  });
  const hasResettableTime = elapsedMs > 0;
  const resetLabel = task.running
    ? "Stop task to reset"
    : hasResettableTime
      ? "Reset"
      : "No time to reset";
  const shareAction = isSharedByOwner ? "unshareTask" : "shareTask";
  const shareLabel = canUseSocialFeatures ? (isSharedByOwner ? "Unshare" : "Share") : "Share (Pro)";
  const shareDisabled = canUseSocialFeatures && !isSharedByOwner && !hasFriends;
  const shareTitle = canUseSocialFeatures
    ? isSharedByOwner
      ? "Unshare"
      : hasFriends
        ? "Share"
        : "Add friends to share tasks"
    : "Pro feature: Sharing";
  const manualEntryLabel = canUseAdvancedHistory ? "Add Entry" : "Add Entry (Pro)";
  const manualEntryTitle = canUseAdvancedHistory ? "Add Entry" : "Pro feature: Manual history entry";
  const destructiveAction = hasTaskHistory ? "archive" : "delete";
  const destructiveLabel = hasTaskHistory ? "Archive" : "Delete";
  const destructiveTitle = hasTaskHistory && task.running ? "Stop task to archive" : destructiveLabel;
  const destructiveDisabled = hasTaskHistory && task.running;
  const destructiveIconSrc = hasTaskHistory ? "/icons/icons_default/archive.webp" : "/icons/icons_default/trash.webp";
  return {
    className,
    html: `
        <div class="taskFlipScene">
          <div class="taskFace taskFaceFront">
            <div class="taskFaceShell taskFaceShellFront" style="--task-history-tab-border-gap:${TASK_HISTORY_TAB_BORDER_GAP_PX}px">
            ${
              hasCheckpointRepeatForTask
                ? '<button class="iconBtn checkpointMuteBtn" data-action="muteCheckpointAlert" title="Mute checkpoint alert" aria-label="Mute checkpoint alert">&#128276;</button>'
                : ""
            }
            ${taskColorPillHtml}
            <button class="iconBtn taskFlipBtn" type="button" data-task-flip="open" title="More actions" aria-label="More actions" aria-expanded="false">&#9776;</button>
            <div class="row">
              <div class="taskHeadMain"><div class="name" data-action="editName" title="Open focus mode">${escapeHtml(task.name)}</div></div>
              <div class="time" data-action="focus" title="Open focus mode">${formatMainTaskElapsedHtml(elapsedMs, !!task.running)}</div>
              <div class="actions">
                ${startStopHtml}
              </div>
            </div>
            ${progressHTML}
            <button class="taskHistoryReveal ${showHistory ? "isOpen" : ""}${historyRevealPhase === "openingSpace" ? " isOpeningSpace" : ""}${historyRevealPhase === "opening" ? " isOpening" : ""}${historyRevealPhase === "closing" ? " isClosing" : ""}${historyRevealPhase === "closingSpace" ? " isClosingSpace" : ""}" type="button" data-action="history" title="${showHistory ? "Hide history chart" : "Show history chart"}" aria-label="${showHistory ? "Hide history chart" : "Show history chart"}" aria-pressed="${showHistory ? "true" : "false"}" ${isHistoryPinned ? 'aria-disabled="true"' : ""}>
              <span class="taskHistoryRevealText">${showHistory ? "HIDE CHART" : "VIEW CHART"}</span>
            </button>
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
                <button class="taskMenuItem" data-action="edit" title="Edit" type="button">${renderTaskBackActionTile("Edit", escapeHtml, "/icons/icons_default/settings.webp")}</button>
                <button class="taskMenuItem" data-action="manualEntry" title="${manualEntryTitle}" type="button" ${canUseAdvancedHistory ? "" : 'data-plan-locked="advancedHistory"'}>${renderTaskBackActionTile(manualEntryLabel, escapeHtml, "/icons/icons_default/notes.webp")}</button>
                <button class="taskMenuItem" data-action="${shareAction}" title="${shareTitle}" type="button" ${shareDisabled ? "disabled" : ""} ${canUseSocialFeatures ? "" : 'data-plan-locked="socialFeatures"'}>${renderTaskBackActionTile(shareLabel, escapeHtml, "/icons/icons_default/share.webp")}</button>
                <button class="taskMenuItem" data-action="reset" title="${resetLabel}" aria-label="${resetLabel}" type="button" ${task.running || !hasResettableTime ? "disabled" : ""}>${renderTaskBackActionTile("Reset", escapeHtml, "/icons/icons_default/history.webp")}</button>
                <button class="taskMenuItem" data-action="exportTask" title="Export" type="button">${renderTaskBackActionTile("Export", escapeHtml, "/icons/icons_default/export.webp")}</button>
                <button class="taskMenuItem taskMenuItemDelete" data-action="${destructiveAction}" title="${destructiveTitle}" aria-label="${destructiveTitle}" type="button" ${destructiveDisabled ? "disabled" : ""}>${renderTaskBackActionTile(destructiveLabel, escapeHtml, destructiveIconSrc)}</button>
              </div>
            </div>
            </div>
          </div>
          ${historyHTML}
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
