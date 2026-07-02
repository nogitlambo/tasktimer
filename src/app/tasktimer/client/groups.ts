/* eslint-disable @typescript-eslint/no-explicit-any */

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  approveFriendRequest,
  buildSharedTaskImportConfig,
  cancelOutgoingFriendRequest,
  declineFriendRequest,
  deleteFriendship,
  deleteSharedTaskSummary,
  loadFriendProfile,
  loadFriendships,
  loadIncomingFriendRequestEmailHints,
  loadIncomingRequests,
  loadOutgoingFriendRequestEmailHints,
  loadOutgoingRequests,
  loadSharedTaskSummariesForOwner,
  loadSharedTaskSummariesForViewer,
  sendFriendRequest,
  type SharedTaskImportConfig,
  type SharedTaskSummary,
  upsertSharedTaskSummary,
} from "../lib/friendsStore";
import { localDayKey } from "../lib/history";
import { formatDashboardDurationShort, getDashboardWeekdayLabels, startOfCurrentWeekMs } from "../lib/historyChart";
import { getRankLabelById, getRankThumbnailDescriptor } from "../lib/rewards";
import { buildImportedSharedTask, hasImportedSharedTask } from "../lib/sharedTaskImport";
import { normalizeTaskColor } from "../lib/taskColors";
import { checkpointValueToSliderSeconds, formatCheckpointSliderLabel, type CheckpointSliderUnit } from "./checkpoint-slider";
import type { TaskTimerGroupsContext } from "./context";
import { hideOverlay, showOverlay } from "./overlay-visibility";

type GroupsBusyResult<T> =
  | { ok: true; value: T; timedOut: false }
  | { ok: false; message: string; timedOut: boolean; error?: unknown };

type GroupsSnapshotLoaders = {
  loadIncomingRequests: typeof loadIncomingRequests;
  loadOutgoingRequests: typeof loadOutgoingRequests;
  loadIncomingFriendRequestEmailHints: typeof loadIncomingFriendRequestEmailHints;
  loadOutgoingFriendRequestEmailHints: typeof loadOutgoingFriendRequestEmailHints;
  loadFriendships: typeof loadFriendships;
  loadFriendProfile: typeof loadFriendProfile;
  loadSharedTaskSummariesForViewer: typeof loadSharedTaskSummariesForViewer;
  loadSharedTaskSummariesForOwner: typeof loadSharedTaskSummariesForOwner;
};

type SharedTaskMetricsTask = {
  timeGoalEnabled?: boolean;
  timeGoalPeriod?: "day" | "week";
  timeGoalMinutes?: number;
  running?: boolean;
  startMs?: number | null;
};

type SharedTaskCardSummary = {
  dailyGoalMs?: number | null;
  todayLoggedMs?: number;
  weekLoggedMs?: number;
  weekGoalMs?: number | null;
  focusTrend7dMs?: number[];
};

type SharedTaskHistoryEntryLike = {
  ts?: unknown;
  ms?: unknown;
};

type FriendAcceptAnimationSource = {
  friendUid: string;
  alias: string;
  avatarSrc: string;
  sourceRect: DOMRect | null;
};

type FriendProfileModalOpenOptions = {
  zoomSource?: HTMLElement | null;
};

const defaultGroupsSnapshotLoaders: GroupsSnapshotLoaders = {
  loadIncomingRequests,
  loadOutgoingRequests,
  loadIncomingFriendRequestEmailHints,
  loadOutgoingFriendRequestEmailHints,
  loadFriendships,
  loadFriendProfile,
  loadSharedTaskSummariesForViewer,
  loadSharedTaskSummariesForOwner,
};

export function getFriendProfileOpenUidFromTarget(target: unknown) {
  const btn = (target as { closest?: (selector: string) => HTMLElement | null } | null)?.closest?.("[data-friend-profile-open]");
  return String(btn?.getAttribute?.("data-friend-profile-open") || "").trim();
}

export function getFriendRequestActionCompleteStatus(action: "approve" | "decline" | "cancel") {
  return action === "approve"
    ? "Friend request approved."
    : action === "decline"
      ? "Friend request declined."
      : "Friend request cancelled.";
}

export function deriveFriendEmailByUid(
  uid: string,
  incomingRows: Array<{ senderUid?: string; senderEmail?: string | null; status?: string }>,
  outgoingRows: Array<{ receiverUid?: string; receiverEmail?: string | null; status?: string }>
) {
  const currentUid = String(uid || "").trim();
  const emailByUid: Record<string, string> = {};
  if (!currentUid) return emailByUid;
  incomingRows.forEach((row) => {
    if (row.status !== "approved") return;
    const peerUid = String(row.senderUid || "").trim();
    const email = String(row.senderEmail || "").trim();
    if (peerUid && email) emailByUid[peerUid] = email;
  });
  outgoingRows.forEach((row) => {
    if (row.status !== "approved") return;
    const peerUid = String(row.receiverUid || "").trim();
    const email = String(row.receiverEmail || "").trim();
    if (peerUid && email) emailByUid[peerUid] = email;
  });
  return emailByUid;
}

export function getSharedTaskGoalMetrics(task: SharedTaskMetricsTask | null | undefined) {
  const goalMinutes = Math.max(0, Number(task?.timeGoalMinutes || 0));
  if (!(task?.timeGoalEnabled && goalMinutes > 0)) return { dailyGoalMs: null, weekGoalMs: null };
  if (task.timeGoalPeriod === "day") {
    return {
      dailyGoalMs: Math.floor(goalMinutes * 60_000),
      weekGoalMs: Math.floor(goalMinutes * 7 * 60_000),
    };
  }
  if (task.timeGoalPeriod === "week") {
    return {
      dailyGoalMs: Math.floor((goalMinutes * 60_000) / 7),
      weekGoalMs: Math.floor(goalMinutes * 60_000),
    };
  }
  return { dailyGoalMs: null, weekGoalMs: null };
}

export function formatSharedTaskWeekPercent(summary: SharedTaskCardSummary): string {
  const weekGoalMs = summary.weekGoalMs == null ? null : Math.max(0, Number(summary.weekGoalMs || 0));
  if (!(weekGoalMs && weekGoalMs > 0)) return "No goal";
  const weekLoggedMs = Math.max(0, Number(summary.weekLoggedMs || 0));
  return `${Math.max(0, Math.min(100, Math.round((weekLoggedMs / weekGoalMs) * 100)))}%`;
}

function formatCompactDurationForSharedCard(msRaw: number): string {
  const totalMs = Math.max(0, Math.floor(Number(msRaw) || 0));
  let totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  totalSeconds -= days * 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds -= hours * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${String(days).padStart(2, "0")}d`);
  if (hours > 0) parts.push(`${String(hours).padStart(2, "0")}h`);
  if (minutes > 0) parts.push(`${String(minutes).padStart(2, "0")}m`);
  if (seconds > 0) parts.push(`${String(seconds).padStart(2, "0")}s`);
  if (!parts.length) parts.push("00s");
  return parts.join(" ");
}

function formatCompactDurationForSharedChartTick(msRaw: number): string {
  const totalMs = Math.max(0, Math.floor(Number(msRaw) || 0));
  let totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  totalSeconds -= days * 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds -= hours * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  if (!parts.length) parts.push("0s");
  return parts.join(" ");
}

function formatSharedTaskSettingToggle(value: unknown): string {
  return value ? "On" : "Off";
}

function formatSharedTaskSettingTime(value: unknown): string {
  const normalized = String(value || "").trim();
  return normalized || "None";
}

function formatSharedTaskSettingTaskType(value: SharedTaskImportConfig["taskType"]): string {
  return value === "once-off" ? "Once-off" : "Recurring";
}

function formatSharedTaskSettingGoalValue(config: SharedTaskImportConfig): string {
  if (!config.timeGoalEnabled) return "Off";
  const value = Math.max(0, Number(config.timeGoalValue) || 0);
  const unit = config.timeGoalUnit === "minute" ? "minute" : "hour";
  return `${value} ${value === 1 ? unit : `${unit}s`} ${config.timeGoalPeriod === "day" ? "per day" : "per week"}`;
}

function formatSharedTaskSettingMilestoneTime(
  milestone: SharedTaskImportConfig["milestones"][number],
  unit: SharedTaskImportConfig["milestoneTimeUnit"]
): string {
  const value = Math.max(0, Number(milestone?.hours) || 0);
  if (unit === "day") return `${value}d`;
  return formatCheckpointSliderLabel(checkpointValueToSliderSeconds(value, (unit === "minute" ? "minute" : "hour") as CheckpointSliderUnit));
}

function getSharedTaskSettingMilestoneMinutes(milestone: SharedTaskImportConfig["milestones"][number], unit: SharedTaskImportConfig["milestoneTimeUnit"]): number {
  const value = Math.max(0, Number(milestone?.hours) || 0);
  if (unit === "day") return value * 24 * 60;
  if (unit === "minute") return value;
  return value * 60;
}

type SharedTaskCheckpointLabelSide = "top" | "bottom";

type SharedTaskCheckpointTimelineLayout = {
  markerLeftPct: number;
  labelShiftPx: number;
  labelWidthPx: number;
  labelSide: SharedTaskCheckpointLabelSide;
};

type SharedTaskCheckpointTimelineLayoutResult = {
  layouts: SharedTaskCheckpointTimelineLayout[];
  requiresScroll: boolean;
  scrollWidthPx: number;
};

const SHARED_TASK_CHECKPOINT_TIMELINE_MIN_WIDTH_PX = 360;
const SHARED_TASK_CHECKPOINT_TIMELINE_MAX_WIDTH_PX = 2400;
const SHARED_TASK_CHECKPOINT_LABEL_MIN_WIDTH_PX = 22;
const SHARED_TASK_CHECKPOINT_LABEL_MAX_WIDTH_PX = 58;
const SHARED_TASK_CHECKPOINT_LABEL_HORIZONTAL_PADDING_PX = 8;
const SHARED_TASK_CHECKPOINT_LABEL_CHAR_WIDTH_PX = 7;
const SHARED_TASK_CHECKPOINT_LABEL_GAP_PX = 4;
const SHARED_TASK_CHECKPOINT_LABEL_SCROLL_SHIFT_RATIO = 1;

function clampSharedTaskTimelinePct(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function formatSharedTaskTimelinePct(value: number): string {
  const rounded = Math.round(clampSharedTaskTimelinePct(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatSharedTaskTimelinePx(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function estimateSharedTaskCheckpointLabelWidthPx(label: string): number {
  const text = String(label || "").trim();
  return Math.max(
    SHARED_TASK_CHECKPOINT_LABEL_MIN_WIDTH_PX,
    Math.min(
      SHARED_TASK_CHECKPOINT_LABEL_MAX_WIDTH_PX,
      Math.ceil(text.length * SHARED_TASK_CHECKPOINT_LABEL_CHAR_WIDTH_PX + SHARED_TASK_CHECKPOINT_LABEL_HORIZONTAL_PADDING_PX)
    )
  );
}

function spreadSharedTaskCheckpointLabelPcts(
  items: Array<{ index: number; markerLeftPct: number; labelWidthPx: number }>,
  timelineWidthPx: number
): Array<{ index: number; labelShiftPx: number }> {
  if (!items.length) return [];
  const sortedItems = [...items].sort((a, b) => a.markerLeftPct - b.markerLeftPct || a.index - b.index);
  const markerLeftPx = sortedItems.map((item) => (clampSharedTaskTimelinePct(item.markerLeftPct) / 100) * timelineWidthPx);
  const labelCentersPx = sortedItems.map((item, index) =>
    Math.max(item.labelWidthPx / 2, Math.min(timelineWidthPx - item.labelWidthPx / 2, markerLeftPx[index]))
  );

  for (let index = 1; index < labelCentersPx.length; index += 1) {
    const previous = sortedItems[index - 1];
    const current = sortedItems[index];
    const minimumCenter = labelCentersPx[index - 1] + previous.labelWidthPx / 2 + SHARED_TASK_CHECKPOINT_LABEL_GAP_PX + current.labelWidthPx / 2;
    labelCentersPx[index] = Math.max(labelCentersPx[index], minimumCenter);
  }

  const lastIndex = labelCentersPx.length - 1;
  const lastItem = sortedItems[lastIndex];
  if (labelCentersPx[lastIndex] > timelineWidthPx - lastItem.labelWidthPx / 2) {
    labelCentersPx[lastIndex] = timelineWidthPx - lastItem.labelWidthPx / 2;
    for (let index = lastIndex - 1; index >= 0; index -= 1) {
      const current = sortedItems[index];
      const next = sortedItems[index + 1];
      const maximumCenter = labelCentersPx[index + 1] - current.labelWidthPx / 2 - SHARED_TASK_CHECKPOINT_LABEL_GAP_PX - next.labelWidthPx / 2;
      labelCentersPx[index] = Math.min(labelCentersPx[index], maximumCenter);
    }
  }

  if (labelCentersPx[0] < sortedItems[0].labelWidthPx / 2) {
    const offset = sortedItems[0].labelWidthPx / 2 - labelCentersPx[0];
    for (let index = 0; index < labelCentersPx.length; index += 1) {
      labelCentersPx[index] += offset;
    }
  }

  return sortedItems.map((item, index) => {
    const shiftPx = labelCentersPx[index] - markerLeftPx[index];
    return { index: item.index, labelShiftPx: shiftPx };
  });
}

function getSharedTaskCheckpointLayoutAtWidth(
  markers: Array<{ index: number; markerLeftPct: number; labelWidthPx: number; labelSide: SharedTaskCheckpointLabelSide }>,
  timelineWidthPx: number
): SharedTaskCheckpointTimelineLayout[] {
  const labelShiftByIndex = new Map<number, number>();
  (["top", "bottom"] as const).forEach((labelSide) => {
    spreadSharedTaskCheckpointLabelPcts(
      markers
        .filter((marker) => markers.length < 3 || marker.labelSide === labelSide)
        .map((marker) => ({ index: marker.index, markerLeftPct: marker.markerLeftPct, labelWidthPx: marker.labelWidthPx })),
      timelineWidthPx
    ).forEach((layout) => labelShiftByIndex.set(layout.index, layout.labelShiftPx));
  });
  return markers.map(
    (marker): SharedTaskCheckpointTimelineLayout => ({
      markerLeftPct: marker.markerLeftPct,
      labelShiftPx: labelShiftByIndex.get(marker.index) ?? 0,
      labelWidthPx: marker.labelWidthPx,
      labelSide: marker.labelSide,
    })
  );
}

function hasSharedTaskCheckpointDetachedLabels(layouts: SharedTaskCheckpointTimelineLayout[]): boolean {
  return layouts.some((layout) => Math.abs(layout.labelShiftPx) > layout.labelWidthPx * SHARED_TASK_CHECKPOINT_LABEL_SCROLL_SHIFT_RATIO);
}

export function getSharedTaskCheckpointTimelineLayouts(
  markerLeftPcts: number[],
  labelWidthsPx: number[],
  availableWidthPx = SHARED_TASK_CHECKPOINT_TIMELINE_MIN_WIDTH_PX
): SharedTaskCheckpointTimelineLayoutResult {
  const normalizedMarkers = markerLeftPcts.map((markerLeftPct, index) => ({
    index,
    markerLeftPct: clampSharedTaskTimelinePct(markerLeftPct),
    labelWidthPx: Math.max(SHARED_TASK_CHECKPOINT_LABEL_MIN_WIDTH_PX, Number(labelWidthsPx[index]) || SHARED_TASK_CHECKPOINT_LABEL_MIN_WIDTH_PX),
    labelSide: (index % 2 === 0 ? "top" : "bottom") as SharedTaskCheckpointLabelSide,
  }));
  const availableWidth = Math.max(1, Number(availableWidthPx) || SHARED_TASK_CHECKPOINT_TIMELINE_MIN_WIDTH_PX);
  const availableLayouts = getSharedTaskCheckpointLayoutAtWidth(normalizedMarkers, availableWidth);
  if (!hasSharedTaskCheckpointDetachedLabels(availableLayouts)) {
    return { layouts: availableLayouts, requiresScroll: false, scrollWidthPx: availableWidth };
  }

  const maxLayouts = getSharedTaskCheckpointLayoutAtWidth(normalizedMarkers, SHARED_TASK_CHECKPOINT_TIMELINE_MAX_WIDTH_PX);
  if (hasSharedTaskCheckpointDetachedLabels(maxLayouts)) {
    return { layouts: maxLayouts, requiresScroll: true, scrollWidthPx: SHARED_TASK_CHECKPOINT_TIMELINE_MAX_WIDTH_PX };
  }

  let low = availableWidth;
  let high = SHARED_TASK_CHECKPOINT_TIMELINE_MAX_WIDTH_PX;
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    const midLayouts = getSharedTaskCheckpointLayoutAtWidth(normalizedMarkers, mid);
    if (hasSharedTaskCheckpointDetachedLabels(midLayouts)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const scrollWidthPx = Math.min(SHARED_TASK_CHECKPOINT_TIMELINE_MAX_WIDTH_PX, Math.ceil(high));
  const layouts = getSharedTaskCheckpointLayoutAtWidth(normalizedMarkers, scrollWidthPx);
  return { layouts, requiresScroll: true, scrollWidthPx };
}

function getSharedTaskCheckpointTimelineBaseWidthPx(timeline: HTMLElement): number {
  const parent = timeline.parentElement;
  const scroller = parent?.classList?.contains("sharedTaskCheckpointTimelineScroller") ? parent : null;
  const baseElement = (scroller?.parentElement || parent || timeline) as HTMLElement;
  const rectWidth = baseElement.getBoundingClientRect?.().width || 0;
  const clientWidth = baseElement.clientWidth || 0;
  const measuredWidth = Math.max(rectWidth, clientWidth);
  return measuredWidth > 0 ? measuredWidth : SHARED_TASK_CHECKPOINT_TIMELINE_MIN_WIDTH_PX;
}

function getSharedTaskCheckpointTimelineScrollWrapper(timeline: HTMLElement): HTMLElement | null {
  const parent = timeline.parentElement;
  return parent?.classList?.contains("sharedTaskCheckpointTimelineScroller") ? parent : null;
}

function setSharedTaskCheckpointTimelineScrollState(timeline: HTMLElement, requiresScroll: boolean, scrollWidthPx: number) {
  const existingWrapper = getSharedTaskCheckpointTimelineScrollWrapper(timeline);
  if (requiresScroll) {
    timeline.style.setProperty("--checkpoint-timeline-min-width", `${formatSharedTaskTimelinePx(scrollWidthPx)}px`);
    if (existingWrapper) return;
    const parent = timeline.parentElement;
    if (!parent || !timeline.ownerDocument) return;
    const wrapper = timeline.ownerDocument.createElement("div");
    wrapper.className = "sharedTaskCheckpointTimelineScroller";
    parent.insertBefore(wrapper, timeline);
    wrapper.appendChild(timeline);
    return;
  }
  timeline.style.removeProperty("--checkpoint-timeline-min-width");
  if (!existingWrapper?.parentElement) return;
  existingWrapper.parentElement.insertBefore(timeline, existingWrapper);
  existingWrapper.remove();
}

function syncSharedTaskCheckpointTimelineLayout(
  timeline: HTMLElement,
  availableWidthPx = getSharedTaskCheckpointTimelineBaseWidthPx(timeline)
) {
  const markers = Array.from(timeline.querySelectorAll<HTMLElement>(".sharedTaskCheckpointTimelineMarker"));
  if (!markers.length) return;
  const layout = getSharedTaskCheckpointTimelineLayouts(
    markers.map((marker) => Number.parseFloat(marker.style.getPropertyValue("--checkpoint-left")) || 0),
    markers.map((marker) =>
      Math.max(
        SHARED_TASK_CHECKPOINT_LABEL_MIN_WIDTH_PX,
        Number.parseFloat(marker.style.getPropertyValue("--checkpoint-label-width")) ||
          marker.querySelector<HTMLElement>(".sharedTaskCheckpointTimelineLabel")?.getBoundingClientRect?.().width ||
          SHARED_TASK_CHECKPOINT_LABEL_MIN_WIDTH_PX
      )
    ),
    availableWidthPx
  );
  layout.layouts.forEach((markerLayout, index) => {
    markers[index]?.style.setProperty("--checkpoint-label-shift", `${formatSharedTaskTimelinePx(markerLayout.labelShiftPx)}px`);
  });
  setSharedTaskCheckpointTimelineScrollState(timeline, layout.requiresScroll, layout.scrollWidthPx);
}

function syncSharedTaskCheckpointTimelineLabels(root: ParentNode | null) {
  root?.querySelectorAll<HTMLElement>(".sharedTaskCheckpointTimeline").forEach((timeline) => {
    syncSharedTaskCheckpointTimelineLayout(timeline);
  });
}

export function renderSharedTaskMetricRows(summary: SharedTaskCardSummary, escapeHtmlUI: (value: unknown) => string) {
  return `<div class="friendSharedTaskMeta"><span class="friendSharedTaskMetaLabel">Today:</span> ${escapeHtmlUI(
                    formatCompactDurationForSharedCard(Number(summary.todayLoggedMs || 0))
                  )}</div>
                  <div class="friendSharedTaskMeta"><span class="friendSharedTaskMetaLabel">This Week:</span> ${escapeHtmlUI(
                    formatCompactDurationForSharedCard(Number(summary.weekLoggedMs || 0))
                  )}</div>`;
}

const sharedTaskDayIndexesByWeekStart: Record<Parameters<typeof startOfCurrentWeekMs>[1], number[]> = {
  sun: [0, 1, 2, 3, 4, 5, 6],
  mon: [1, 2, 3, 4, 5, 6, 0],
  tue: [2, 3, 4, 5, 6, 0, 1],
  wed: [3, 4, 5, 6, 0, 1, 2],
  thu: [4, 5, 6, 0, 1, 2, 3],
  fri: [5, 6, 0, 1, 2, 3, 4],
  sat: [6, 0, 1, 2, 3, 4, 5],
};

function roundSharedTaskChartMaxMs(maxMsRaw: number) {
  const maxMs = Math.max(0, Math.floor(Number(maxMsRaw) || 0));
  if (maxMs <= 0) return 60 * 60_000;
  const hourMs = 60 * 60_000;
  const fifteenMinuteMs = 15 * 60_000;
  if (maxMs >= hourMs) return Math.ceil(maxMs / hourMs) * hourMs;
  return Math.ceil(maxMs / fifteenMinuteMs) * fifteenMinuteMs;
}

export function renderSharedTaskWeeklyChart(
  summary: SharedTaskCardSummary,
  weekStarting: Parameters<typeof startOfCurrentWeekMs>[1],
  escapeHtmlUI: (value: unknown) => string
) {
  const rawTrend = Array.isArray(summary.focusTrend7dMs) ? summary.focusTrend7dMs : [];
  const trend = new Array(7).fill(0).map((_, i) => Math.max(0, Math.floor(Number(rawTrend[i] || 0))));
  const dayIndexes = sharedTaskDayIndexesByWeekStart[weekStarting] || sharedTaskDayIndexesByWeekStart.mon;
  const labels = getDashboardWeekdayLabels(weekStarting);
  const orderedValues = dayIndexes.map((dayIndex) => trend[dayIndex] || 0);
  const dailyGoalMs = summary.dailyGoalMs == null ? null : Math.max(0, Math.floor(Number(summary.dailyGoalMs || 0)));
  const hasGoalScale = !!(dailyGoalMs && dailyGoalMs > 0);
  const chartMaxMs = hasGoalScale ? dailyGoalMs : roundSharedTaskChartMaxMs(Math.max(...orderedValues, 0));
  const maxLabel = hasGoalScale ? formatCompactDurationForSharedChartTick(chartMaxMs) : formatCompactDurationForSharedCard(chartMaxMs);
  const yAxisLabels = hasGoalScale
    ? [1, 0.75, 0.5, 0.25].map((ratio) => formatCompactDurationForSharedChartTick(chartMaxMs * ratio))
    : [maxLabel, "0"];
  const barsHtml = orderedValues
    .map((value, index) => {
      const label = labels[index] || "";
      const duration = formatCompactDurationForSharedCard(value);
      const heightPct = chartMaxMs > 0 ? Math.max(0, Math.min(100, Math.round((value / chartMaxMs) * 100))) : 0;
      const barClass = value > 0 ? "friendSharedTaskChartBar isActive" : "friendSharedTaskChartBar";
      return `<div class="friendSharedTaskChartBarSlot" title="${escapeHtmlUI(`${label}: ${duration}`)}" aria-label="${escapeHtmlUI(
        `${label}: ${duration}`
      )}">
                      <span class="${barClass}" style="--friend-shared-task-chart-bar: ${heightPct}%"></span>
                    </div>`;
    })
    .join("");
  const labelsHtml = labels.map((label) => `<span>${escapeHtmlUI(label)}</span>`).join("");
  const yAxisLabelsHtml = yAxisLabels.map((label) => `<span>${escapeHtmlUI(label)}</span>`).join("");
  const chartClass = hasGoalScale ? "friendSharedTaskChart isGoalScale" : "friendSharedTaskChart";
  const chartAriaLabel = hasGoalScale
    ? `Weekly logged time chart. Goal scale 0 to ${maxLabel}.`
    : `Weekly logged time chart. Scale 0 to ${maxLabel}.`;
  return `<div class="${chartClass}" role="img" aria-label="${escapeHtmlUI(
    chartAriaLabel
  )}">
                  <div class="friendSharedTaskChartYAxis" aria-hidden="true">
                    ${yAxisLabelsHtml}
                  </div>
                  <div class="friendSharedTaskChartBody">
                    <div class="friendSharedTaskChartBars">${barsHtml}</div>
                    <div class="friendSharedTaskChartXAxis" aria-hidden="true">${labelsHtml}</div>
                  </div>
                </div>`;
}

export function computeSharedTaskTimingMetrics(options: {
  task: SharedTaskMetricsTask | null | undefined;
  entries: SharedTaskHistoryEntryLike[];
  nowMs: number;
  weekStarting: Parameters<typeof startOfCurrentWeekMs>[1];
  normalizeHistoryTimestampMs: (value: unknown) => number;
}) {
  const nowValue = Math.max(0, Math.floor(Number(options.nowMs) || 0));
  const entries = Array.isArray(options.entries) ? options.entries : [];
  const weekStartMs = startOfCurrentWeekMs(nowValue, options.weekStarting);
  const todayKey = localDayKey(nowValue);
  const weekEntries = entries.filter((entry) => options.normalizeHistoryTimestampMs(entry?.ts) >= weekStartMs);
  const weekTotalMs = weekEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry?.ms || 0)), 0);
  const todayLoggedHistoryMs = entries
    .filter((entry) => localDayKey(options.normalizeHistoryTimestampMs(entry?.ts)) === todayKey)
    .reduce((sum, entry) => sum + Math.max(0, Number(entry?.ms || 0)), 0);
  const daysElapsed = Math.max(1, Math.floor((nowValue - weekStartMs) / (24 * 60 * 60 * 1000)) + 1);
  const avgWeekMs = Math.floor(weekTotalMs / daysElapsed);
  const allHistoryMs = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry?.ms || 0)), 0);
  const runningMs =
    options.task && options.task.running && Number.isFinite(Number(options.task.startMs))
      ? Math.max(0, nowValue - Number(options.task.startMs || 0))
      : 0;
  const focusTrend7dMs = [0, 0, 0, 0, 0, 0, 0];
  weekEntries.forEach((entry) => {
    const ts = options.normalizeHistoryTimestampMs(entry?.ts);
    if (!ts) return;
    const dayIdx = new Date(ts).getDay();
    if (dayIdx >= 0 && dayIdx <= 6) focusTrend7dMs[dayIdx] += Math.max(0, Number(entry?.ms || 0));
  });
  if (runningMs > 0) {
    const dayIdx = new Date(nowValue).getDay();
    if (dayIdx >= 0 && dayIdx <= 6) focusTrend7dMs[dayIdx] += runningMs;
  }
  const goalMetrics = getSharedTaskGoalMetrics(options.task);
  return {
    dailyGoalMs: goalMetrics.dailyGoalMs,
    todayLoggedMs: Math.floor(todayLoggedHistoryMs + runningMs),
    weekLoggedMs: Math.floor(weekTotalMs + runningMs),
    weekGoalMs: goalMetrics.weekGoalMs,
    avgWeekMs,
    totalMs: Math.floor(allHistoryMs + runningMs),
    focusTrend7dMs: focusTrend7dMs.map((value) => Math.max(0, Math.floor(Number(value) || 0))),
  };
}

export async function loadGroupsSnapshotForUid(uid: string, loaders: GroupsSnapshotLoaders = defaultGroupsSnapshotLoaders) {
  const [incomingResult, outgoingResult, incomingEmailResult, outgoingEmailResult, friendshipsResult] = await Promise.allSettled([
    loaders.loadIncomingRequests(uid),
    loaders.loadOutgoingRequests(uid),
    loaders.loadIncomingFriendRequestEmailHints(uid),
    loaders.loadOutgoingFriendRequestEmailHints(uid),
    loaders.loadFriendships(uid),
  ]);
  const incoming = incomingResult.status === "fulfilled" ? incomingResult.value || [] : [];
  const outgoing = outgoingResult.status === "fulfilled" ? outgoingResult.value || [] : [];
  const incomingEmailRows = incomingEmailResult.status === "fulfilled" ? incomingEmailResult.value || [] : [];
  const outgoingEmailRows = outgoingEmailResult.status === "fulfilled" ? outgoingEmailResult.value || [] : [];
  const friendships = friendshipsResult.status === "fulfilled" ? friendshipsResult.value || [] : [];
  const friendEmailByUid = deriveFriendEmailByUid(uid, incomingEmailRows, outgoingEmailRows);
  const requestPeerUids = [...incoming, ...outgoing]
    .map((row) => (row.senderUid === uid ? row.receiverUid : row.senderUid))
    .map((peerUid) => String(peerUid || "").trim())
    .filter(Boolean);
  const profileUids = Array.from(
    new Set([
      ...friendships
        .map((row) => (row.users[0] === uid ? row.users[1] : row.users[0]))
        .map((peerUid) => String(peerUid || "").trim())
        .filter(Boolean),
      ...requestPeerUids,
    ])
  );
  const profileEntries = await Promise.allSettled(
    profileUids.map(async (peerUid) => {
      const profile = await loaders.loadFriendProfile(peerUid);
      return [peerUid, profile] as const;
    })
  );
  const nextFriendProfileCache = {} as Record<string, Awaited<ReturnType<typeof loadFriendProfile>>>;
  profileEntries.forEach((result) => {
    if (result.status !== "fulfilled" || !result.value) return;
    const [peerUid, profile] = result.value;
    if (!peerUid) return;
    nextFriendProfileCache[peerUid] = profile;
  });
  const [sharedForViewerResult, sharedForOwnerResult] = await Promise.allSettled([
    loaders.loadSharedTaskSummariesForViewer(uid),
    loaders.loadSharedTaskSummariesForOwner(uid),
  ]);
  return {
    incoming,
    outgoing,
    friendships,
    friendProfileCache: nextFriendProfileCache,
    friendEmailByUid,
    sharedSummaries: sharedForViewerResult.status === "fulfilled" ? sharedForViewerResult.value || [] : [],
    ownSharedSummaries: sharedForOwnerResult.status === "fulfilled" ? sharedForOwnerResult.value || [] : [],
  };
}

export function createTaskTimerGroups(ctx: TaskTimerGroupsContext) {
  const { els } = ctx;
  let friendProfileCloseTimer: number | null = null;

  function canUseSocialFeatures() {
    return ctx.hasEntitlement("socialFeatures");
  }

  function renderGroupsLockedState() {
    if (els.groupsFriendsTitle) {
      els.groupsFriendsTitle.textContent = "Friends | 0";
    }
    if (els.groupsFriendsList) {
      els.groupsFriendsList.innerHTML = '<div class="settingsDetailNote isEmptyStatus">Upgrade to Pro to unlock friends, sharing, and social progress.</div>';
    }
    if (els.groupsSharedByYouList) {
      els.groupsSharedByYouList.innerHTML = '<div class="settingsDetailNote isEmptyStatus">Shared tasks are available on Pro.</div>';
    }
    if (els.groupsIncomingRequestsList) {
      els.groupsIncomingRequestsList.innerHTML = '<div class="settingsDetailNote isEmptyStatus">Friend requests are available on Pro.</div>';
    }
    if (els.groupsOutgoingRequestsList) {
      els.groupsOutgoingRequestsList.innerHTML = '<div class="settingsDetailNote isEmptyStatus">Outgoing requests are available on Pro.</div>';
    }
    if (els.openFriendRequestModalBtn) els.openFriendRequestModalBtn.disabled = true;
  }

  function openFriendRequestModal() {
    if (!canUseSocialFeatures()) {
      ctx.showUpgradePrompt("Friends and sharing", "pro");
      return;
    }
    showOverlay(els.friendRequestModal as HTMLElement | null);
    if (els.friendRequestEmailInput) els.friendRequestEmailInput.value = "";
    setFriendRequestModalStatus("");
    window.setTimeout(() => {
      try {
        els.friendRequestEmailInput?.focus();
      } catch {
        // ignore
      }
    }, 0);
  }

  function closeFriendRequestModal() {
    hideOverlay(els.friendRequestModal as HTMLElement | null);
    setFriendRequestModalStatus("");
  }

  function setFriendRequestModalStatus(message: string, tone: "error" | "success" | "info" = "info") {
    if (!els.friendRequestModalStatus) return;
    const text = String(message || "").trim();
    const statusEl = els.friendRequestModalStatus as HTMLElement;
    statusEl.textContent = text;
    statusEl.style.display = text ? "block" : "none";
    statusEl.style.color = "";
    if (!text) return;
    if (tone === "error") {
      statusEl.style.color = "#ff8f8f";
      return;
    }
    if (tone === "success") {
      statusEl.style.color = "var(--accent, #35e8ff)";
      return;
    }
    statusEl.style.color = "rgba(188,214,230,.78)";
  }

  function clearFriendProfileZoomState() {
    const overlay = els.friendProfileModal as HTMLElement | null;
    if (!overlay) return;
    overlay.classList.remove("isFriendProfileZoomingIn", "isFriendProfileZoomingOut");
    const modal = overlay.querySelector?.(".modal") as HTMLElement | null;
    modal?.style.removeProperty("--friend-profile-zoom-origin-x");
    modal?.style.removeProperty("--friend-profile-zoom-origin-y");
  }

  function finishFriendProfileClose() {
    if (friendProfileCloseTimer != null) {
      window.clearTimeout(friendProfileCloseTimer);
      friendProfileCloseTimer = null;
    }
    clearFriendProfileZoomState();
    hideOverlay(els.friendProfileModal as HTMLElement | null);
    ctx.setActiveFriendProfileUid(null);
    ctx.setActiveFriendProfileName("");
  }

  function applyFriendProfileZoomOrigin(zoomSource?: HTMLElement | null) {
    const overlay = els.friendProfileModal as HTMLElement | null;
    const modal = overlay?.querySelector?.(".modal") as HTMLElement | null;
    if (!overlay || !modal || !zoomSource || prefersReducedFriendMotion()) return;
    const sourceRect = zoomSource.getBoundingClientRect?.() || null;
    const modalRect = modal.getBoundingClientRect?.() || null;
    if (!isUsableFriendAnimationRect(sourceRect) || !isUsableFriendAnimationRect(modalRect)) return;
    const originX = sourceRect.left + sourceRect.width / 2 - modalRect.left;
    const originY = sourceRect.top + sourceRect.height / 2 - modalRect.top;
    modal.style.setProperty("--friend-profile-zoom-origin-x", `${Math.max(0, Math.min(modalRect.width, originX))}px`);
    modal.style.setProperty("--friend-profile-zoom-origin-y", `${Math.max(0, Math.min(modalRect.height, originY))}px`);
  }

  function animateFriendProfileOpen(zoomSource?: HTMLElement | null) {
    const overlay = els.friendProfileModal as HTMLElement | null;
    if (!overlay || prefersReducedFriendMotion() || typeof window.requestAnimationFrame !== "function") return;
    clearFriendProfileZoomState();
    applyFriendProfileZoomOrigin(zoomSource);
    overlay.classList.add("isFriendProfileZoomingIn");
    window.requestAnimationFrame(() => {
      overlay.classList.remove("isFriendProfileZoomingIn");
    });
  }

  function closeFriendProfileModal() {
    const overlay = els.friendProfileModal as HTMLElement | null;
    if (!overlay || overlay.style.display === "none" || prefersReducedFriendMotion()) {
      finishFriendProfileClose();
      return;
    }
    if (friendProfileCloseTimer != null) return;
    clearFriendProfileZoomState();
    overlay.classList.add("isFriendProfileZoomingOut");
    friendProfileCloseTimer = window.setTimeout(finishFriendProfileClose, 220);
  }

  function openFriendProfileModal(friendUid: string, opts?: FriendProfileModalOpenOptions) {
    const uid = ctx.getCurrentUid();
    if (!uid || !els.friendProfileModal) return;
    const targetUid = String(friendUid || "").trim();
    if (!targetUid) return;
    if (friendProfileCloseTimer != null) {
      window.clearTimeout(friendProfileCloseTimer);
      friendProfileCloseTimer = null;
    }

    const rankedFriends = ctx
      .getGroupsFriendships()
      .map((row) => {
        const peerUid = row.users[0] === uid ? row.users[1] : row.users[0];
        if (!peerUid) return null;
        const profile = ctx.getMergedFriendProfile(peerUid, row.profileByUid?.[peerUid]);
        const alias = String(profile?.alias || "").trim() || peerUid;
        const currentRankId = String(profile?.currentRankId || "").trim() || "unranked";
        const totalXp = Math.max(0, Math.floor(Number(profile?.totalXp || 0) || 0));
        const completedTaskCount = Math.max(0, Math.floor(Number(profile?.completedTaskCount || 0) || 0));
        const email = String(ctx.getFriendEmailByUid()[peerUid] || "").trim();
        const avatarSrc = ctx.getFriendAvatarSrc(profile);
        const sharedCount = ctx.getGroupsSharedSummaries().filter((entry) => entry.ownerUid === peerUid).length;
        const createdAtMs =
          row.createdAt && typeof (row.createdAt as any).toMillis === "function"
            ? Number((row.createdAt as any).toMillis())
            : Number.NaN;
        const summaries = ctx.getGroupsSharedSummaries().filter((entry) => entry.ownerUid === peerUid);
        const sharedTotalMs = summaries.reduce((sum, entry) => sum + Math.max(0, Number(entry.totalTimeLoggedMs || 0) || 0), 0);
        const sharedAverageMs = summaries.length
          ? Math.floor(
              summaries.reduce((sum, entry) => sum + Math.max(0, Number(entry.avgTimeLoggedThisWeekMs || 0) || 0), 0) / summaries.length
            )
          : 0;
        return { peerUid, alias, email, avatarSrc, currentRankId, totalXp, completedTaskCount, sharedCount, sharedTotalMs, sharedAverageMs, createdAtMs };
      })
      .filter(
        (row): row is {
          peerUid: string;
          alias: string;
          email: string;
          avatarSrc: string;
          currentRankId: string;
          totalXp: number;
          completedTaskCount: number;
          sharedCount: number;
          sharedTotalMs: number;
          sharedAverageMs: number;
          createdAtMs: number;
        } => !!row
      )
      .sort((a, b) => {
        if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount;
        const byAlias = a.alias.localeCompare(b.alias, undefined, { sensitivity: "base" });
        if (byAlias !== 0) return byAlias;
        return a.peerUid.localeCompare(b.peerUid, undefined, { sensitivity: "base" });
      });

    const row = rankedFriends.find((entry) => entry.peerUid === targetUid);
    if (!row) return;
    const memberSinceText = Number.isFinite(row.createdAtMs) ? new Date(row.createdAtMs).toLocaleDateString() : "Unknown";

    if (els.friendProfileAvatar) {
      els.friendProfileAvatar.src = row.avatarSrc;
      els.friendProfileAvatar.alt = "";
    }
    if (els.friendProfileName) els.friendProfileName.textContent = row.alias;
    if (els.friendProfileEmail) {
      els.friendProfileEmail.textContent = row.email;
      (els.friendProfileEmail as HTMLElement).style.display = row.email ? "block" : "none";
    }
    if (els.friendProfileRankImage) {
      const rankThumbnail = getRankThumbnailDescriptor(row.currentRankId);
      if (rankThumbnail.kind === "image") {
        els.friendProfileRankImage.src = rankThumbnail.src;
        els.friendProfileRankImage.style.display = "block";
        if (els.friendProfileRankPlaceholder) (els.friendProfileRankPlaceholder as HTMLElement).style.display = "none";
      } else {
        els.friendProfileRankImage.removeAttribute("src");
        els.friendProfileRankImage.style.display = "none";
        if (els.friendProfileRankPlaceholder) {
          (els.friendProfileRankPlaceholder as HTMLElement).textContent = rankThumbnail.label;
          (els.friendProfileRankPlaceholder as HTMLElement).style.display = "grid";
        }
      }
    }
    if (els.friendProfileRank) els.friendProfileRank.textContent = getRankLabelById(row.currentRankId);
    if (els.friendProfileXp) els.friendProfileXp.textContent = new Intl.NumberFormat().format(row.totalXp);
    if (els.friendProfileSharedTaskCount) els.friendProfileSharedTaskCount.textContent = String(row.sharedCount);
    if (els.friendProfileSharedTime) els.friendProfileSharedTime.textContent = formatDashboardDurationShort(row.sharedTotalMs);
    if (els.friendProfileCompletedTaskCount) els.friendProfileCompletedTaskCount.textContent = new Intl.NumberFormat().format(row.completedTaskCount);
    if (els.friendProfileMemberSince) els.friendProfileMemberSince.textContent = `Member since ${memberSinceText}`;
    ctx.setActiveFriendProfileUid(row.peerUid);
    ctx.setActiveFriendProfileName(row.alias);
    showOverlay(els.friendProfileModal as HTMLElement | null);
    animateFriendProfileOpen(opts?.zoomSource || null);
  }

  function getTaskCreatedAtMs(taskId: string): number | null {
    const task = ctx.getTasks().find((row) => String(row.id || "") === String(taskId));
    const raw = (task as any)?.createdAt;
    if (raw && typeof raw.toMillis === "function") return Math.max(0, Number(raw.toMillis()) || 0);
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
    const entries = (ctx.getHistoryByTaskId()[taskId] || []).slice();
    if (!entries.length) return null;
    const minTs = entries.reduce(
      (min, entry) => Math.min(min, ctx.normalizeHistoryTimestampMs((entry as any)?.ts)),
      Number.MAX_SAFE_INTEGER
    );
    return minTs > 0 && Number.isFinite(minTs) ? Math.floor(minTs) : null;
  }

  function computeTaskSharingMetrics(taskId: string) {
    const history = ctx.getHistoryByTaskId();
    const task = ctx.getTasks().find((row) => String(row.id || "") === String(taskId));
    const timingMetrics = computeSharedTaskTimingMetrics({
      task,
      entries: history[taskId] || [],
      nowMs: Date.now(),
      weekStarting: ctx.getWeekStarting(),
      normalizeHistoryTimestampMs: ctx.normalizeHistoryTimestampMs,
    });
    let checkpointScaleMs: number | null = null;
    if (task && Array.isArray((task as any).milestones) && (task as any).milestones.length) {
      const unitSec =
        (task as any).milestoneTimeUnit === "day"
          ? 86400
          : (task as any).milestoneTimeUnit === "minute"
            ? 60
            : 3600;
      const maxCheckpointUnits = (task as any).milestones.reduce((max: number, milestone: any) => {
        const hours = Number(milestone?.hours || 0);
        return Number.isFinite(hours) ? Math.max(max, hours) : max;
      }, 0);
      const candidate = Math.floor(maxCheckpointUnits * unitSec * 1000);
      checkpointScaleMs = candidate > 0 ? candidate : null;
    }
    return {
      createdAtMs: getTaskCreatedAtMs(taskId),
      dailyGoalMs: timingMetrics.dailyGoalMs,
      todayLoggedMs: timingMetrics.todayLoggedMs,
      weekLoggedMs: timingMetrics.weekLoggedMs,
      weekGoalMs: timingMetrics.weekGoalMs,
      avgWeekMs: timingMetrics.avgWeekMs,
      totalMs: timingMetrics.totalMs,
      focusTrend7dMs: timingMetrics.focusTrend7dMs,
      checkpointScaleMs,
    };
  }

  function getSharedFriendUidsForTask(taskId: string): string[] {
    const uid = ctx.getCurrentUid();
    if (!uid || !taskId) return [];
    return ctx
      .getOwnSharedSummaries()
      .filter((row) => row.ownerUid === uid && row.taskId === taskId)
      .map((row) => row.friendUid);
  }

  function setShareTaskStatus(message: string, tone: "error" | "success" | "info" = "info") {
    if (!els.shareTaskStatus) return;
    const text = String(message || "").trim();
    const statusEl = els.shareTaskStatus as HTMLElement;
    statusEl.textContent = text;
    statusEl.style.display = text ? "block" : "none";
    statusEl.style.color = "";
    if (!text) return;
    if (tone === "error") {
      statusEl.style.color = "#ff8f8f";
      return;
    }
    if (tone === "success") {
      statusEl.style.color = "var(--accent, #35e8ff)";
      return;
    }
    statusEl.style.color = "rgba(188,214,230,.78)";
  }

  function isShareTaskSpecificScopeSelected() {
    return String(els.shareTaskScopeSelect?.value || "all") === "specific";
  }

  function getShareTaskScopeDropdownEls() {
    const modal = els.shareTaskModal as HTMLElement | null;
    return {
      button: modal?.querySelector<HTMLButtonElement>("#shareTaskScopeDropdownButton") || null,
      label: modal?.querySelector<HTMLElement>("#shareTaskScopeDropdownLabel") || null,
      list: modal?.querySelector<HTMLElement>("#shareTaskScopeDropdownList") || null,
      options: Array.from(modal?.querySelectorAll<HTMLButtonElement>("[data-share-task-scope-option]") || []),
    };
  }

  function getShareTaskScopeLabel(value: string) {
    return value === "specific" ? "Specific friend(s)" : "All friends";
  }

  function setShareTaskScopeDropdownOpen(open: boolean) {
    const dropdownEls = getShareTaskScopeDropdownEls();
    if (dropdownEls.button) dropdownEls.button.setAttribute("aria-expanded", open ? "true" : "false");
    if (dropdownEls.list) dropdownEls.list.hidden = !open;
  }

  function syncShareTaskScopeDropdownUi() {
    const value = String(els.shareTaskScopeSelect?.value || "all");
    const dropdownEls = getShareTaskScopeDropdownEls();
    if (dropdownEls.label) dropdownEls.label.textContent = getShareTaskScopeLabel(value);
    dropdownEls.options.forEach((option) => {
      const selected = String(option.getAttribute("data-share-task-scope-option") || "all") === value;
      option.classList.toggle("isSelected", selected);
      option.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function setShareTaskScopeValue(value: string) {
    const nextValue = value === "specific" ? "specific" : "all";
    if (els.shareTaskScopeSelect) els.shareTaskScopeSelect.value = nextValue;
    syncShareTaskScopeDropdownUi();
    renderShareTaskFriendOptions();
    syncShareTaskScopeUi();
  }

  function focusShareTaskScopeOption(offset: number) {
    const dropdownEls = getShareTaskScopeDropdownEls();
    if (!dropdownEls.options.length) return;
    const currentValue = String(els.shareTaskScopeSelect?.value || "all");
    const currentIndex = Math.max(
      0,
      dropdownEls.options.findIndex((option) => String(option.getAttribute("data-share-task-scope-option") || "all") === currentValue)
    );
    const nextIndex = Math.min(dropdownEls.options.length - 1, Math.max(0, currentIndex + offset));
    dropdownEls.options[nextIndex]?.focus();
  }

  function handleShareTaskScopeDropdownKeyDown(e: any) {
    const target = e?.target as HTMLElement | null;
    if (!target?.closest?.("#shareTaskScopeDropdown")) return;
    const key = String(e?.key || "");
    const dropdownEls = getShareTaskScopeDropdownEls();
    const option = target.closest("[data-share-task-scope-option]") as HTMLElement | null;
    const button = target.closest("#shareTaskScopeDropdownButton") as HTMLElement | null;
    if (key === "Escape") {
      e?.preventDefault?.();
      setShareTaskScopeDropdownOpen(false);
      dropdownEls.button?.focus();
      return;
    }
    if (button && (key === "ArrowDown" || key === "ArrowUp")) {
      e?.preventDefault?.();
      setShareTaskScopeDropdownOpen(true);
      focusShareTaskScopeOption(key === "ArrowDown" ? 0 : dropdownEls.options.length - 1);
      return;
    }
    if (!option) return;
    if (key === "Enter" || key === " ") {
      e?.preventDefault?.();
      setShareTaskScopeValue(String(option.getAttribute("data-share-task-scope-option") || "all"));
      setShareTaskScopeDropdownOpen(false);
      dropdownEls.button?.focus();
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      e?.preventDefault?.();
      const optionIndex = dropdownEls.options.indexOf(option as HTMLButtonElement);
      const nextIndex =
        key === "Home"
          ? 0
          : key === "End"
            ? dropdownEls.options.length - 1
            : Math.min(dropdownEls.options.length - 1, Math.max(0, optionIndex + (key === "ArrowDown" ? 1 : -1)));
      dropdownEls.options[nextIndex]?.focus();
    }
  }

  function getShareTaskFriendRows() {
    const uid = ctx.getCurrentUid();
    if (!uid || !ctx.getGroupsFriendships().length) return [] as Array<{ friendUid: string; alias: string }>;
    return ctx
      .getGroupsFriendships()
      .map((row) => {
        const friendUid = row.users[0] === uid ? row.users[1] : row.users[0];
        if (!friendUid) return null;
        const profile = ctx.getMergedFriendProfile(friendUid, row.profileByUid?.[friendUid]);
        const aliasRaw = String(profile?.alias || "").trim();
        const alias = aliasRaw.includes("@") ? aliasRaw.split("@")[0] || friendUid : aliasRaw || friendUid;
        return { friendUid, alias };
      })
      .filter((row): row is { friendUid: string; alias: string } => !!row);
  }

  function getShareTaskAvailability(taskId: string) {
    const friendRows = getShareTaskFriendRows();
    const sharedFriendUidSet = new Set(getSharedFriendUidsForTask(taskId));
    const availableFriendRows = friendRows.filter((row) => !sharedFriendUidSet.has(row.friendUid));
    return {
      friendRows,
      sharedFriendUidSet,
      availableFriendRows,
      isSharedWithAllFriends: friendRows.length > 0 && availableFriendRows.length === 0,
    };
  }

  function syncShareTaskModalAvailabilityUi(opts?: { taskName?: string }) {
    const mode = ctx.getShareTaskMode() === "unshare" ? "unshare" : "share";
    const activeTaskId = String(ctx.getShareTaskTaskId() || "").trim();
    const taskName =
      String(opts?.taskName || "").trim() ||
      String(ctx.getTasks()[ctx.getShareTaskIndex() ?? -1]?.name || "").trim() ||
      "Untitled task";
    if (mode === "unshare") {
      const targetCount = getSharedFriendUidsForTask(activeTaskId).length;
      setShareTaskModalModeUi({ mode, taskName, hasChoices: targetCount > 0 });
      return;
    }
    const availability = getShareTaskAvailability(activeTaskId);
    const hasChoices = isShareTaskSpecificScopeSelected()
      ? availability.availableFriendRows.length > 0
      : availability.friendRows.length > 0 && !availability.isSharedWithAllFriends;
    setShareTaskModalModeUi({ mode, taskName, hasChoices });
    if (!availability.friendRows.length) {
      setShareTaskStatus("No friends available to share with.", "error");
      return;
    }
    if (availability.isSharedWithAllFriends) {
      setShareTaskStatus("This task is already shared with all friends.", "info");
      return;
    }
    setShareTaskStatus("");
  }

  function setShareTaskModalModeUi(opts: { mode: "share" | "unshare"; taskName: string; hasChoices?: boolean }) {
    const mode = opts.mode === "unshare" ? "unshare" : "share";
    const taskName = String(opts.taskName || "").trim() || "Untitled task";
    const hasChoices = opts.hasChoices !== false;
    const scopeField = (els.shareTaskScopeSelect?.parentElement as HTMLElement | null) || null;
    const friendsField = els.shareTaskFriendsField as HTMLElement | null;
    const friendsLabel = friendsField?.querySelector("label") as HTMLElement | null;
    if (els.shareTaskTitle) {
      els.shareTaskTitle.textContent = mode === "unshare" ? `Unshare "${taskName}"` : `Share "${taskName}"`;
    }
    const subtextEl = (els.shareTaskTitle?.nextElementSibling as HTMLElement | null) || null;
    if (subtextEl && subtextEl.classList.contains("shareTaskModalSubtext")) {
      subtextEl.textContent =
        mode === "unshare"
          ? "Choose which friends should no longer receive this task and its live progress."
          : "Select who to share this task with:";
    }
    if (scopeField) scopeField.style.display = mode === "share" ? "grid" : "none";
    if (friendsField) {
      friendsField.style.display = mode === "share" ? (isShareTaskSpecificScopeSelected() ? "grid" : "none") : "grid";
    }
    if (friendsLabel) {
      friendsLabel.textContent = mode === "unshare" ? "Select friend(s) to unshare" : "Select friend(s)";
      friendsLabel.style.display = mode === "unshare" ? "" : "none";
    }
    syncShareTaskScopeDropdownUi();
    if (els.shareTaskConfirmBtn) {
      els.shareTaskConfirmBtn.textContent = mode === "unshare" ? "Unshare" : "Share";
      els.shareTaskConfirmBtn.disabled = !hasChoices;
    }
  }

  function renderShareTaskFriendOptions() {
    const listEl = els.shareTaskFriendsList as HTMLElement | null;
    if (!listEl) return;
    const uid = ctx.getCurrentUid();
    const mode = ctx.getShareTaskMode() === "unshare" ? "unshare" : "share";
    let rows: Array<{ friendUid: string; alias: string }> = [];
    if (uid) rows = getShareTaskFriendRows();
    if (mode === "unshare") {
      const activeTaskId = String(ctx.getShareTaskTaskId() || "").trim();
      const targetUids = new Set(getSharedFriendUidsForTask(activeTaskId));
      rows = rows.filter((row) => targetUids.has(row.friendUid));
      if (!rows.length && activeTaskId) {
        rows = ctx
          .getOwnSharedSummaries()
          .filter((row) => row.ownerUid === uid && row.taskId === activeTaskId)
          .map((row) => ({ friendUid: row.friendUid, alias: String(row.friendUid || "").trim() || "Unknown friend" }));
      }
    }
    const activeTaskId = String(ctx.getShareTaskTaskId() || "").trim();
    const shareAvailability = mode === "share" ? getShareTaskAvailability(activeTaskId) : null;
    if (!uid || !rows.length) {
      listEl.innerHTML = `<div class="settingsDetailNote isEmptyStatus">${
        mode === "unshare" ? "This task is not currently shared with any friends." : "No friends available."
      }</div>`;
      return;
    }
    listEl.innerHTML = rows
      .map((row) => {
        const inputId = `shareFriend_${ctx.escapeHtmlUI(row.friendUid)}`;
        const isCurrentlyShared = !!shareAvailability?.sharedFriendUidSet.has(row.friendUid);
        return `<label class="shareTaskFriendOption" for="${inputId}">
          <input id="${inputId}" type="checkbox" data-share-friend-uid="${ctx.escapeHtmlUI(row.friendUid)}" ${mode === "share" && isCurrentlyShared ? "disabled" : ""} />
          <span class="shareTaskFriendOptionLabel">${ctx.escapeHtmlUI(row.alias)}</span>
          ${mode === "share" && isCurrentlyShared ? '<span class="shareTaskFriendOptionState">Currently shared</span>' : ""}
        </label>`;
      })
      .join("");
  }

  function syncShareTaskScopeUi() {
    if (ctx.getShareTaskMode() === "unshare") {
      if (els.shareTaskFriendsField) (els.shareTaskFriendsField as HTMLElement).style.display = "grid";
      return;
    }
    if (els.shareTaskFriendsField) {
      (els.shareTaskFriendsField as HTMLElement).style.display = isShareTaskSpecificScopeSelected() ? "grid" : "none";
    }
    syncShareTaskModalAvailabilityUi();
  }

  function closeShareTaskModal() {
    if (!els.shareTaskModal) return;
    (els.shareTaskModal as HTMLElement).style.display = "none";
    ctx.setShareTaskIndex(null);
    ctx.setShareTaskTaskId(null);
    ctx.setShareTaskMode("share");
    if (els.shareTaskScopeSelect) els.shareTaskScopeSelect.value = "all";
    syncShareTaskScopeDropdownUi();
    setShareTaskScopeDropdownOpen(false);
    if (els.shareTaskConfirmBtn) els.shareTaskConfirmBtn.disabled = false;
    setShareTaskStatus("");
  }

  function openShareTaskModal(taskIndex: number) {
    if (!canUseSocialFeatures()) {
      ctx.showUpgradePrompt("Task sharing", "pro");
      return;
    }
    const task = ctx.getTasks()[taskIndex];
    if (!task) return;
    const taskName = String(task.name || "").trim() || "Untitled task";
    ctx.setShareTaskIndex(taskIndex);
    ctx.setShareTaskTaskId(String(task.id || "").trim());
    ctx.setShareTaskMode("share");
    setShareTaskModalModeUi({ mode: "share", taskName, hasChoices: true });
    if (els.shareTaskScopeSelect) els.shareTaskScopeSelect.value = "all";
    syncShareTaskScopeDropdownUi();
    setShareTaskScopeDropdownOpen(false);
    syncShareTaskScopeUi();
    renderShareTaskFriendOptions();
    const uid = ctx.getCurrentUid();
    if (uid && !ctx.getGroupsFriendships().length) {
      void loadFriendships(uid)
        .then((rows) => {
          ctx.setGroupsFriendships(rows || []);
          renderShareTaskFriendOptions();
          syncShareTaskModalAvailabilityUi({ taskName });
        })
        .catch(() => {});
    }
    syncShareTaskModalAvailabilityUi({ taskName });
    if (els.shareTaskModal) (els.shareTaskModal as HTMLElement).style.display = "flex";
  }

  function openUnshareTaskModal(taskId: string) {
    if (!canUseSocialFeatures()) {
      ctx.showUpgradePrompt("Task sharing", "pro");
      return;
    }
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return;
    const taskName =
      String(ctx.getTasks().find((row) => String(row.id || "").trim() === normalizedTaskId)?.name || "").trim() ||
      String(ctx.getOwnSharedSummaries().find((row) => String(row.taskId || "").trim() === normalizedTaskId)?.taskName || "").trim() ||
      "Untitled task";
    ctx.setShareTaskIndex(null);
    ctx.setShareTaskTaskId(normalizedTaskId);
    ctx.setShareTaskMode("unshare");
    const openModal = () => {
      const targetCount = getSharedFriendUidsForTask(normalizedTaskId).length;
      setShareTaskModalModeUi({ mode: "unshare", taskName, hasChoices: targetCount > 0 });
      renderShareTaskFriendOptions();
      setShareTaskStatus(targetCount > 0 ? "" : "This task is not currently shared with any friends.");
      if (els.shareTaskModal) (els.shareTaskModal as HTMLElement).style.display = "flex";
    };
    if (ctx.getCurrentUid() && !ctx.getGroupsFriendships().length) {
      void loadFriendships(String(ctx.getCurrentUid() || ""))
        .then((rows) => {
          ctx.setGroupsFriendships(rows || []);
          openModal();
        })
        .catch(() => openModal());
      return;
    }
    openModal();
  }

  async function refreshOwnSharedSummaries() {
    const uid = ctx.getCurrentUid();
    if (!uid) {
      ctx.setOwnSharedSummaries([]);
      return;
    }
    try {
      ctx.setOwnSharedSummaries((await loadSharedTaskSummariesForOwner(uid)) || []);
    } catch {
      ctx.setOwnSharedSummaries([]);
    }
  }

  function getOwnedSharedSummaryMismatchedTaskIds(): string[] {
    const uid = String(ctx.getCurrentUid() || "");
    const ownSharedSummaries = ctx.getOwnSharedSummaries();
    if (!uid || !Array.isArray(ownSharedSummaries) || !ownSharedSummaries.length) return [];
    const taskStateById = new Map<string, { running: boolean; color: string | null }>();
    ctx.getTasks().forEach((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId) return;
      taskStateById.set(taskId, { running: !!task.running, color: normalizeTaskColor(task.color) || null });
    });
    const mismatched = new Set<string>();
    ownSharedSummaries.forEach((row) => {
      const ownerUid = String(row?.ownerUid || "").trim();
      if (!ownerUid || ownerUid !== uid) return;
      const taskId = String(row?.taskId || "").trim();
      const taskState = taskStateById.get(taskId);
      if (!taskId || !taskState) return;
      if (Math.floor(Number(row?.schemaVersion || 1) || 1) < 4 || !row.importConfig) {
        mismatched.add(taskId);
        return;
      }
      const summaryRunning = String(row?.timerState || "").trim().toLowerCase() === "running";
      const taskRunning = taskState.running;
      if (summaryRunning !== taskRunning) mismatched.add(taskId);
      const summaryColor = normalizeTaskColor(row?.taskColor) || null;
      if (summaryColor !== taskState.color) mismatched.add(taskId);
    });
    return Array.from(mismatched);
  }

  async function reconcileOwnedSharedSummaryStates() {
    const mismatchedTaskIds = getOwnedSharedSummaryMismatchedTaskIds();
    if (!mismatchedTaskIds.length) return;
    await syncSharedTaskSummariesForTasks(mismatchedTaskIds);
  }

  async function syncSharedTaskSummariesForTask(taskId: string) {
    const uid = ctx.getCurrentUid();
    if (!uid || !taskId) return;
    const task = ctx.getTasks().find((row) => String(row.id || "") === String(taskId));
    if (!task) return;
    const friendUids = getSharedFriendUidsForTask(taskId);
    if (!friendUids.length) return;
    const metrics = computeTaskSharingMetrics(taskId);
    await Promise.all(
      friendUids.map((friendUid) =>
        upsertSharedTaskSummary({
          ownerUid: uid,
          friendUid,
          taskId,
          taskName: String(task.name || ""),
          taskColor: task.color,
          timerState: task.running ? "running" : "stopped",
          focusTrend7dMs: metrics.focusTrend7dMs,
          checkpointScaleMs: metrics.checkpointScaleMs,
          taskCreatedAtMs: metrics.createdAtMs,
          dailyGoalMs: metrics.dailyGoalMs,
          todayLoggedMs: metrics.todayLoggedMs,
          weekLoggedMs: metrics.weekLoggedMs,
          weekGoalMs: metrics.weekGoalMs,
          avgTimeLoggedThisWeekMs: metrics.avgWeekMs,
          totalTimeLoggedMs: metrics.totalMs,
          importConfig: buildSharedTaskImportConfig(task),
        })
      )
    );
    await refreshOwnSharedSummaries();
  }

  async function syncSharedTaskSummariesForTasks(taskIds: string[]) {
    const ids = Array.from(new Set((taskIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
    if (!ids.length) return;
    await Promise.all(ids.map((id) => syncSharedTaskSummariesForTask(id).catch(() => {})));
  }

  async function submitShareTaskModal() {
    const uid = ctx.getCurrentUid();
    const activeMode = ctx.getShareTaskMode() === "unshare" ? "unshare" : "share";
    if (!uid) return;
    if (activeMode === "share" && ctx.getShareTaskIndex() == null) return;
    const tasks = ctx.getTasks();
    const activeTaskId =
      activeMode === "share"
        ? String(tasks[ctx.getShareTaskIndex()!]?.id || "").trim()
        : String(ctx.getShareTaskTaskId() || "").trim();
    const shareTask = activeMode === "share" && ctx.getShareTaskIndex() != null ? tasks[ctx.getShareTaskIndex()!] : null;
    if (!activeTaskId || (activeMode === "share" && !shareTask)) return;
    const selectedTargets = Array.from(
      (els.shareTaskFriendsList as HTMLElement | null)?.querySelectorAll<HTMLInputElement>("[data-share-friend-uid]:checked") || []
    )
      .map((el) => String(el.getAttribute("data-share-friend-uid") || "").trim())
      .filter(Boolean);
    if (activeMode === "unshare") {
      if (!selectedTargets.length) {
        setShareTaskStatus("Select at least one friend.", "error");
        return;
      }
      const results = await Promise.allSettled(
        selectedTargets.map((friendUid) => deleteSharedTaskSummary(uid, friendUid, activeTaskId))
      );
      const failures = results.filter((row) => row.status === "rejected");
      await refreshOwnSharedSummaries();
      ctx.render();
      if (!failures.length) {
        setShareTaskStatus("Task unshared successfully.", "success");
        window.setTimeout(() => closeShareTaskModal(), 500);
        return;
      }
      setShareTaskStatus(`Unshared with ${selectedTargets.length - failures.length} friend(s). ${failures.length} failed.`, "error");
      return;
    }
    if (!ctx.getGroupsFriendships().length) {
      try {
        ctx.setGroupsFriendships((await loadFriendships(uid)) || []);
      } catch {
        ctx.setGroupsFriendships([]);
      }
    }
    let targets: string[] = [];
    const availability = getShareTaskAvailability(activeTaskId);
    if (isShareTaskSpecificScopeSelected()) {
      targets = selectedTargets;
      if (!targets.length) {
        setShareTaskStatus("Select at least one friend.", "error");
        return;
      }
    } else {
      targets = availability.availableFriendRows.map((row) => row.friendUid);
      if (!targets.length) {
        setShareTaskStatus(
          availability.friendRows.length ? "This task is already shared with all friends." : "No friends available to share with.",
          "error"
        );
        return;
      }
    }
    if (!shareTask) return;
    const metrics = computeTaskSharingMetrics(activeTaskId);
    const writes = await Promise.all(
      targets.map((friendUid) =>
        upsertSharedTaskSummary({
          ownerUid: uid,
          friendUid,
          taskId: activeTaskId,
          taskName: String(shareTask.name || ""),
          taskColor: shareTask.color,
          timerState: shareTask.running ? "running" : "stopped",
          focusTrend7dMs: metrics.focusTrend7dMs,
          checkpointScaleMs: metrics.checkpointScaleMs,
          taskCreatedAtMs: metrics.createdAtMs,
          dailyGoalMs: metrics.dailyGoalMs,
          todayLoggedMs: metrics.todayLoggedMs,
          weekLoggedMs: metrics.weekLoggedMs,
          weekGoalMs: metrics.weekGoalMs,
          avgTimeLoggedThisWeekMs: metrics.avgWeekMs,
          totalTimeLoggedMs: metrics.totalMs,
          importConfig: buildSharedTaskImportConfig(shareTask),
        })
      )
    );
    const failures = writes.filter((row) => !row.ok).length;
    if (failures) {
      const firstFailure = writes.find((row) => !row.ok);
      const reason = String(firstFailure?.message || "").trim();
      setShareTaskStatus(
        `Shared with ${writes.length - failures} friend(s). ${failures} failed.${reason ? ` ${reason}` : ""}`,
        "error"
      );
    } else {
      setShareTaskStatus("");
      ctx.showActionConfirmation("Task shared.");
    }
    await refreshOwnSharedSummaries();
    ctx.render();
    if (!failures) window.setTimeout(() => closeShareTaskModal(), 500);
  }

  function beginGroupsLoading() {
    ctx.setGroupsLoadingDepth(ctx.getGroupsLoadingDepth() + 1);
    ctx.setGroupsLoading(true);
  }

  function endGroupsLoading() {
    const nextDepth = Math.max(0, ctx.getGroupsLoadingDepth() - 1);
    ctx.setGroupsLoadingDepth(nextDepth);
    ctx.setGroupsLoading(nextDepth > 0);
  }

  function prefersReducedFriendMotion() {
    if (typeof window === "undefined") return true;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function isUsableFriendAnimationRect(rect: DOMRect | null | undefined) {
    return !!rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 4 && rect.height > 4;
  }

  function findRequestRowForActionButton(button: HTMLElement | null) {
    return button?.closest?.(".groupsIncomingRequestRow") as HTMLElement | null;
  }

  function getIncomingRequestById(requestId: string) {
    return ctx
      .getGroupsIncomingRequests()
      .find((row) => String(row?.requestId || "").trim() === requestId) || null;
  }

  function getFriendProfileZoomSourceFromTarget(target: unknown) {
    const node = target as { closest?: (selector: string) => HTMLElement | null } | null;
    return node?.closest?.(".friendSharedTasksDetails[data-friend-uid]") || node?.closest?.("[data-friend-profile-open]") || null;
  }

  function captureFriendAcceptAnimationSource(button: HTMLElement | null, requestId: string): FriendAcceptAnimationSource | null {
    const request = getIncomingRequestById(requestId);
    const friendUid = String(request?.senderUid || "").trim();
    if (!friendUid) return null;
    const row = findRequestRowForActionButton(button);
    const identityRow = (row?.querySelector?.(".friendRequestIdentityRow") as HTMLElement | null) || row;
    const avatarEl = row?.querySelector?.(".friendRequestAvatar") as HTMLImageElement | null;
    const aliasEl = row?.querySelector?.(".friendRequestAlias") as HTMLElement | null;
    const peerEmail = String(request?.senderEmail || "").trim();
    const alias = String(aliasEl?.textContent || request?.senderEmail || friendUid).trim() || peerEmail || friendUid;
    const avatarSrc = String(avatarEl?.currentSrc || avatarEl?.src || ctx.getFriendAvatarSrcById(String(request?.senderAvatarId || "").trim()) || "").trim();
    const sourceRect = identityRow?.getBoundingClientRect?.() || null;
    return {
      friendUid,
      alias,
      avatarSrc,
      sourceRect: isUsableFriendAnimationRect(sourceRect) ? sourceRect : null,
    };
  }

  function findFriendAcceptAnimationTarget(friendUid: string) {
    const list = els.groupsFriendsList as HTMLElement | null;
    if (!list || !friendUid) return null;
    const rows = Array.from(list.querySelectorAll(".friendSharedTasksDetails[data-friend-uid]"));
    return (rows.find((node) => String(node.getAttribute("data-friend-uid") || "").trim() === friendUid) as HTMLElement | undefined) || null;
  }

  function triggerFriendAcceptLandingAccent(target: HTMLElement | null) {
    if (!target) return;
    target.classList.remove("isFriendAcceptLanding");
    void target.offsetWidth;
    target.classList.add("isFriendAcceptLanding");
    window.setTimeout(() => {
      target.classList.remove("isFriendAcceptLanding");
    }, prefersReducedFriendMotion() ? 260 : 1100);
  }

  function createFriendAcceptFloatClone(source: FriendAcceptAnimationSource, sourceRect: DOMRect) {
    const clone = document.createElement("div");
    clone.className = "friendAcceptFloatClone";
    clone.setAttribute("aria-hidden", "true");
    const avatar = document.createElement("img");
    avatar.className = "friendAcceptFloatAvatar";
    avatar.alt = "";
    if (source.avatarSrc) avatar.src = source.avatarSrc;
    const label = document.createElement("strong");
    label.className = "friendAcceptFloatName";
    label.textContent = source.alias;
    clone.append(avatar, label);
    clone.style.left = `${sourceRect.left}px`;
    clone.style.top = `${sourceRect.top}px`;
    clone.style.width = `${Math.min(Math.max(sourceRect.width, 180), 320)}px`;
    document.body.appendChild(clone);
    return clone;
  }

  function animateFriendAcceptToList(source: FriendAcceptAnimationSource | null): Promise<HTMLElement | null> {
    if (!source || typeof document === "undefined" || document.hidden) return Promise.resolve(null);
    const target = findFriendAcceptAnimationTarget(source.friendUid);
    if (!target) return Promise.resolve(null);
    triggerFriendAcceptLandingAccent(target);
    if (prefersReducedFriendMotion()) return Promise.resolve(target);
    const sourceRect = source.sourceRect;
    const targetIdentity = (target.querySelector(".friendIdentityRow") as HTMLElement | null) || target;
    const targetRect = targetIdentity.getBoundingClientRect?.() || null;
    if (!sourceRect || !isUsableFriendAnimationRect(sourceRect) || !isUsableFriendAnimationRect(targetRect) || !document.body) return Promise.resolve(target);
    if (typeof window.requestAnimationFrame !== "function") return Promise.resolve(target);
    const clone = createFriendAcceptFloatClone(source, sourceRect);
    const deltaX = targetRect.left - sourceRect.left;
    const deltaY = targetRect.top + Math.max(0, (targetRect.height - sourceRect.height) / 2) - sourceRect.top;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clone.removeEventListener("transitionend", finish);
        clone.remove();
        resolve(target);
      };
      clone.addEventListener("transitionend", finish, { once: true });
      window.setTimeout(finish, 760);
      window.requestAnimationFrame(() => {
        clone.classList.add("isFriendAcceptFloatActive");
        clone.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1.04)`;
        clone.style.opacity = "0";
      });
    });
  }

  async function runGroupsBusy<T>(message: string, timeoutMessage: string, work: () => Promise<T>): Promise<GroupsBusyResult<T>> {
    beginGroupsLoading();
    renderGroupsPage();
    let workingIndicatorKey: number | null = null;
    let indicatorDelayTimer = window.setTimeout(() => {
      workingIndicatorKey = ctx.showWorkingIndicator(message);
    }, 300);
    let timeoutHandle = 0 as number;
    try {
      const result = await Promise.race<
        | { kind: "value"; value: T }
        | { kind: "error"; error: unknown }
        | { kind: "timeout" }
      >([
        work()
          .then((value) => ({ kind: "value" as const, value }))
          .catch((error) => ({ kind: "error" as const, error })),
        new Promise<{ kind: "timeout" }>((resolve) => {
          timeoutHandle = window.setTimeout(() => resolve({ kind: "timeout" }), 60000);
        }),
      ]);
      if (result.kind === "timeout") return { ok: false, message: timeoutMessage, timedOut: true };
      if (result.kind === "error") return { ok: false, message: "", timedOut: false, error: result.error };
      return { ok: true, value: result.value, timedOut: false };
    } finally {
      if (indicatorDelayTimer) {
        window.clearTimeout(indicatorDelayTimer);
        indicatorDelayTimer = 0 as number;
      }
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      if (workingIndicatorKey != null) ctx.hideWorkingIndicator(workingIndicatorKey);
      endGroupsLoading();
      renderGroupsPage();
    }
  }

  async function loadGroupsSnapshot(uid: string) {
    return loadGroupsSnapshotForUid(uid);
  }

  function applyGroupsSnapshot(snapshot: Awaited<ReturnType<typeof loadGroupsSnapshot>>) {
    ctx.setGroupsIncomingRequests(snapshot.incoming);
    ctx.setGroupsOutgoingRequests(snapshot.outgoing);
    ctx.setGroupsFriendships(snapshot.friendships);
    ctx.setFriendProfileCacheByUid(snapshot.friendProfileCache);
    ctx.setFriendEmailByUid(snapshot.friendEmailByUid);
    ctx.setGroupsSharedSummaries(snapshot.sharedSummaries);
    ctx.setOwnSharedSummaries(snapshot.ownSharedSummaries);
  }

  function syncOpenFriendSharedTaskUidsFromDom() {
    const list = els.groupsFriendsList as HTMLElement | null;
    if (!list) return;
    const openIds = ctx.getOpenFriendSharedTaskUids();
    list.querySelectorAll(".friendSharedTasksDetails[data-friend-uid]").forEach((node) => {
      const details = node as HTMLDetailsElement;
      const friendUid = String(details.getAttribute("data-friend-uid") || "").trim();
      if (!friendUid) return;
      if (details.open) openIds.add(friendUid);
      else openIds.delete(friendUid);
    });
  }

  function wireFriendSharedTaskDetailsState() {
    const list = els.groupsFriendsList as HTMLElement | null;
    if (!list) return;
    const openIds = ctx.getOpenFriendSharedTaskUids();
    list.querySelectorAll(".friendSharedTasksDetails[data-friend-uid]").forEach((node) => {
      const details = node as HTMLDetailsElement;
      const friendUid = String(details.getAttribute("data-friend-uid") || "").trim();
      if (!friendUid) return;
      details.addEventListener("toggle", () => {
        if (details.open) openIds.add(friendUid);
        else openIds.delete(friendUid);
      });
    });
  }

  function renderFriendSharedTaskTitle(taskName: unknown, taskColor: unknown) {
    const color = normalizeTaskColor(taskColor);
    const colorPill = color
      ? `<span class="taskColorPill" aria-label="Task color" style="--task-color:${ctx.escapeHtmlUI(color)}"></span>`
      : "";
    return `<div class="friendSharedTaskTitle">${colorPill}<span class="friendSharedTaskTitleText">${ctx.escapeHtmlUI(taskName)}</span></div>`;
  }

  function renderFriendSharedTaskImportAction(entry: SharedTaskSummary) {
    if (!entry.importConfig) return "";
    const alreadyImported = hasImportedSharedTask(ctx.getTasks(), entry.ownerUid, entry.taskId);
    const disabledAttr = ctx.getGroupsLoading() || alreadyImported ? ' disabled aria-disabled="true"' : "";
    const label = alreadyImported ? "Added" : "Import";
    return `<div class="friendSharedTaskActions">
      <button class="btn btn-accent small" type="button" data-friend-action="import-shared-task" data-share-doc-id="${ctx.escapeHtmlUI(
        entry.shareDocId
      )}"${disabledAttr}>${ctx.escapeHtmlUI(label)}</button>
    </div>`;
  }

  function renderSharedTaskImportPrompt(entry: SharedTaskSummary) {
    const action = renderFriendSharedTaskImportAction(entry);
    if (!action) return "";
    return `<section class="sharedTaskImportPrompt" aria-label="Import shared task">
      <p class="sharedTaskImportPromptText">Import this task to your list, and TaskLaunch will automatically schedule it into an available time slot based on your optimal productivity preferences.</p>
      <div class="sharedTaskImportPromptAction">${action}</div>
    </section>`;
  }

  function getFriendSharedTaskTimerState(entry: SharedTaskSummary) {
    const timerState = String(entry.timerState || "stopped").toLowerCase() === "running" ? "Running" : "Stopped";
    const timerStateKey = timerState.toLowerCase() === "running" ? "running" : "stopped";
    const timerStateClass = timerStateKey === "running" ? "friendSharedTaskState isRunning" : "friendSharedTaskState isStopped";
    return { timerState, timerStateKey, timerStateClass };
  }

  function getSharedTaskOwnerLabel(ownerUidRaw: string) {
    const ownerUid = String(ownerUidRaw || "").trim();
    if (!ownerUid) return "Unknown";
    const cachedProfile = ctx.getFriendProfileCacheByUid()[ownerUid] || null;
    const friendshipProfile =
      ctx
        .getGroupsFriendships()
        .map((row) => row.profileByUid?.[ownerUid] || null)
        .find((profile) => !!profile) || null;
    const profile = ctx.getMergedFriendProfile(ownerUid, cachedProfile || friendshipProfile);
    return String(profile?.alias || "").trim() || ownerUid;
  }

  function renderSharedTaskOwnerMeta(entry: SharedTaskSummary, opts?: { modal?: boolean }) {
    if (!opts?.modal) return "";
    return `<div class="friendSharedTaskMeta"><span class="friendSharedTaskMetaLabel">Owner:</span> ${ctx.escapeHtmlUI(
      getSharedTaskOwnerLabel(entry.ownerUid)
    )}</div>`;
  }

  function renderSharedTaskSettingRow(label: string, value: string) {
    return `<div class="sharedTaskSettingsRow">
      <dt>${ctx.escapeHtmlUI(label)}</dt>
      <dd>${ctx.escapeHtmlUI(value)}</dd>
    </div>`;
  }

  function renderSharedTaskSettingsMilestonesTimeline(config: SharedTaskImportConfig) {
    if (!config.milestonesEnabled || !config.milestones.length) {
      return `<div class="sharedTaskCheckpointTimelineEmpty">None</div>`;
    }
    const milestoneMinutes = config.milestones.map((milestone) => getSharedTaskSettingMilestoneMinutes(milestone, config.milestoneTimeUnit));
    const goalMinutes = config.timeGoalEnabled ? Math.max(0, Number(config.timeGoalMinutes) || 0) : 0;
    const maxMinutes = Math.max(goalMinutes, ...milestoneMinutes, 1);
    const alternateLabels = config.milestones.length >= 3;
    const markerLeftPcts = milestoneMinutes.map((minutes) => clampSharedTaskTimelinePct((minutes / maxMinutes) * 100));
    const milestoneTimes = config.milestones.map((milestone) => formatSharedTaskSettingMilestoneTime(milestone, config.milestoneTimeUnit));
    const labelWidthsPx = milestoneTimes.map((time) => estimateSharedTaskCheckpointLabelWidthPx(time));
    const timelineLayout = getSharedTaskCheckpointTimelineLayouts(markerLeftPcts, labelWidthsPx, SHARED_TASK_CHECKPOINT_TIMELINE_MIN_WIDTH_PX);
    const { layouts } = timelineLayout;
    const markers = config.milestones
        .map((milestone, index) => {
          const description = String(milestone?.description || "").trim() || `Checkpoint ${index + 1}`;
          const time = milestoneTimes[index];
          const alerts = milestone?.alertsEnabled === false ? "Alerts off" : "Alerts on";
          const layout = layouts[index];
          const markerClass = alternateLabels && layout
            ? `sharedTaskCheckpointTimelineMarker ${layout.labelSide === "top" ? "isLabelTop" : "isLabelBottom"}`
            : "sharedTaskCheckpointTimelineMarker";
          const markerStyle =
            `--checkpoint-left:${formatSharedTaskTimelinePct(layout?.markerLeftPct ?? markerLeftPcts[index] ?? 0)}%;` +
            `--checkpoint-label-shift:${formatSharedTaskTimelinePx(layout?.labelShiftPx ?? 0)}px;` +
            `--checkpoint-label-width:${formatSharedTaskTimelinePx(layout?.labelWidthPx ?? labelWidthsPx[index] ?? SHARED_TASK_CHECKPOINT_LABEL_MIN_WIDTH_PX)}px`;
          return `<li class="${markerClass}" style="${markerStyle}" title="${ctx.escapeHtmlUI(
            `${time} ${description} | ${alerts}`
          )}" aria-label="${ctx.escapeHtmlUI(`${time} ${description} | ${alerts}`)}">
            <span class="sharedTaskCheckpointTimelineDot" aria-hidden="true"></span>
            <span class="sharedTaskCheckpointTimelineLabel">${ctx.escapeHtmlUI(time)}</span>
          </li>`;
        })
        .join("");
    return `<ol class="sharedTaskCheckpointTimeline${
      alternateLabels ? " isAlternatingLabels" : ""
    }" role="list">${markers}</ol>`;
  }

  function renderSharedTaskSettingsSummary(config: SharedTaskImportConfig | null) {
    if (!config) return "";
    const rows = [
      renderSharedTaskSettingRow("Task type", formatSharedTaskSettingTaskType(config.taskType)),
      renderSharedTaskSettingRow("Time goal", formatSharedTaskSettingGoalValue(config)),
      renderSharedTaskSettingRow("Planned start", formatSharedTaskSettingTime(config.plannedStartTime)),
      renderSharedTaskSettingRow("Checkpoint alerts", formatSharedTaskSettingToggle(config.milestonesEnabled)),
    ].join("");
    const milestoneGroup = config.milestonesEnabled
      ? `<div class="sharedTaskSettingsMilestoneGroup">
        <h4>Checkpoints</h4>
        ${renderSharedTaskSettingsMilestonesTimeline(config)}
      </div>`
      : "";
    return `<section class="sharedTaskSettingsSummary" aria-label="Task Settings">
      <h3>Task Settings</h3>
      <dl class="sharedTaskSettingsGrid">${rows}</dl>
      ${milestoneGroup}
    </section>`;
  }

  function renderFriendSharedTaskSummaryContent(entry: SharedTaskSummary, opts?: { modal?: boolean }) {
    const { timerState, timerStateClass } = getFriendSharedTaskTimerState(entry);
    const modalClass = opts?.modal ? " isModalSummary" : "";
    const importAction = opts?.modal ? "" : renderFriendSharedTaskImportAction(entry);
    const importPrompt = opts?.modal ? renderSharedTaskImportPrompt(entry) : "";
    const settingsSummary = opts?.modal ? renderSharedTaskSettingsSummary(entry.importConfig) : "";
    return `<div class="friendSharedTaskCardLayout${modalClass}">
      <div class="friendSharedTaskInfo">
        ${renderFriendSharedTaskTitle(entry.taskName, entry.taskColor)}
        ${renderSharedTaskOwnerMeta(entry, opts)}
        <div class="friendSharedTaskMeta"><span class="friendSharedTaskMetaLabel">Status:</span> <span class="${timerStateClass}">${ctx.escapeHtmlUI(timerState)}</span></div>
        ${renderSharedTaskMetricRows(entry, ctx.escapeHtmlUI)}
        ${importAction}
      </div>
      ${renderSharedTaskWeeklyChart(entry, ctx.getWeekStarting(), ctx.escapeHtmlUI)}
    </div>${settingsSummary}${importPrompt}`;
  }

  function getSharedSummaryByShareDocId(shareDocIdRaw: string) {
    const shareDocId = String(shareDocIdRaw || "").trim();
    if (!shareDocId) return null;
    return ctx.getGroupsSharedSummaries().find((entry) => String(entry.shareDocId || "").trim() === shareDocId) || null;
  }

  function closeSharedTaskSummaryModal() {
    hideOverlay(els.sharedTaskSummaryModal as HTMLElement | null);
  }

  function syncSharedTaskSummaryTimelineLabels() {
    syncSharedTaskCheckpointTimelineLabels(els.sharedTaskSummaryBody as HTMLElement | null);
  }

  function scheduleSharedTaskSummaryTimelineLabelSync() {
    syncSharedTaskSummaryTimelineLabels();
    if (typeof window !== "undefined") window.requestAnimationFrame?.(() => syncSharedTaskSummaryTimelineLabels());
  }

  function openSharedTaskSummaryModal(shareDocIdRaw: string) {
    const entry = getSharedSummaryByShareDocId(shareDocIdRaw);
    if (!entry || !els.sharedTaskSummaryModal) return;
    if (els.sharedTaskSummaryTitle) els.sharedTaskSummaryTitle.textContent = "Shared Task Summary";
    if (els.sharedTaskSummaryBody) {
      els.sharedTaskSummaryBody.innerHTML = `<div class="dashboardCard friendSharedTaskCard sharedTaskSummaryCard friendSharedTaskCardState-${ctx.escapeHtmlUI(
        getFriendSharedTaskTimerState(entry).timerStateKey
      )}">${renderFriendSharedTaskSummaryContent(entry, { modal: true })}</div>`;
    }
    showOverlay(els.sharedTaskSummaryModal as HTMLElement | null);
    scheduleSharedTaskSummaryTimelineLabelSync();
  }

  function renderGroupsRequestsList(container: HTMLElement | null, rows: any[], opts: { incoming: boolean }) {
    const titleEl = (opts.incoming ? els.groupsIncomingRequestsTitle : els.groupsOutgoingRequestsTitle) as HTMLElement | null;
    const detailsEl = (opts.incoming ? els.groupsIncomingRequestsDetails : els.groupsOutgoingRequestsDetails) as HTMLDetailsElement | null;
    const titlePrefix = opts.incoming ? "Incoming requests" : "Outgoing requests";
    if (titleEl) {
      titleEl.textContent = `${titlePrefix} | ${rows.length}`;
      titleEl.classList.toggle("isEmptyCount", rows.length === 0);
    }
    if (detailsEl) detailsEl.open = rows.length > 0;
    if (!container) return;
    if (!rows.length) {
      container.classList.add("isEmptyStatus");
      container.textContent = opts.incoming ? "No incoming requests." : "No outgoing requests.";
      return;
    }
    const groupsLoading = ctx.getGroupsLoading();
    container.classList.remove("isEmptyStatus");
    container.innerHTML = rows
      .map((row) => {
        const peerUid = String((opts.incoming ? row.senderUid : row.receiverUid) || "").trim();
        const peerProfile = peerUid ? ctx.getFriendProfileCacheByUid()[peerUid] || null : null;
        const peerAliasRaw = peerProfile?.alias;
        const peerEmail = opts.incoming ? row.senderEmail : row.receiverEmail;
        const peerAlias = String(peerAliasRaw || "").trim() || String(peerEmail || "").trim() || "Unknown user";
        const status = String(row.status || "pending");
        const statusLabel = status[0].toUpperCase() + status.slice(1);
        const disabledAttr = groupsLoading ? ' disabled aria-disabled="true"' : "";
        const actionBtns =
          status !== "pending"
            ? ""
            : opts.incoming
              ? `<div class="groupsIncomingRequestActions"><button class="btn btn-ghost small friendRequestDeclineBtn" type="button" data-friend-action="decline" data-request-id="${ctx.escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Decline</button><span class="friendRequestActionSeparator" aria-hidden="true">|</span><button class="btn btn-ghost small friendRequestAcceptBtn" type="button" data-friend-action="approve" data-request-id="${ctx.escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Accept</button></div>`
              : `<button class="friendRequestCancelLink" type="button" data-friend-action="cancel" data-request-id="${ctx.escapeHtmlUI(
                  row.requestId
                )}"${disabledAttr}>Cancel request</button>`;
        const identityAvatarSrc = opts.incoming
          ? ctx.getFriendAvatarSrcById(String(row.senderAvatarId || "").trim())
          : ctx.buildFriendInitialAvatarDataUrl(peerAlias);
        const peerEmailText = String(peerEmail || "").trim();
        const requestEmailHtml =
          peerEmailText && peerEmailText.toLowerCase() !== peerAlias.toLowerCase()
            ? `<div class="friendRequestEmail">${ctx.escapeHtmlUI(peerEmailText)}</div>`
            : "";
        const incomingActionHtml = opts.incoming ? actionBtns : "";
        const outgoingActionHtml = !opts.incoming ? actionBtns : "";
        const identityHtml = `<div class="friendRequestIdentityRow">
          <img src="${ctx.escapeHtmlUI(identityAvatarSrc)}" alt="" aria-hidden="true" class="friendRequestAvatar" />
          <div class="friendRequestIdentityText">
            <div class="friendRequestAlias">${ctx.escapeHtmlUI(peerAlias)}</div>
            ${requestEmailHtml}
            ${incomingActionHtml}
            ${outgoingActionHtml}
          </div>
        </div>`;
        if (opts.incoming) {
          return `<div class="settingsDetailNote groupsIncomingRequestRow">${identityHtml}</div>`;
        }
        return `<div class="settingsDetailNote"><div><b class="friendRequestStatusTitle">${ctx.escapeHtmlUI(statusLabel)}</b></div>${identityHtml}</div>`;
      })
      .join("");
  }

  function renderGroupsFriendsList() {
    if (!els.groupsFriendsList) return;
    syncOpenFriendSharedTaskUidsFromDom();
    els.groupsFriendsList.className = "settingsDetailNote";
    const uid = ctx.getCurrentUid();
    const friendCount = uid ? ctx.getGroupsFriendships().length : 0;
    if (els.groupsFriendsTitle) {
      els.groupsFriendsTitle.textContent = `Friends | ${friendCount}`;
    }
    const openIds = ctx.getOpenFriendSharedTaskUids();
    if (!uid) {
      openIds.clear();
      els.groupsFriendsList.textContent = "Sign in to view friends.";
      return;
    }
    if (!friendCount) {
      openIds.clear();
      els.groupsFriendsList.textContent = "";
      return;
    }
    const sharedSummaries = ctx.getGroupsSharedSummaries();
    const friendRows = ctx
      .getGroupsFriendships()
      .map((row) => {
        const friendUid = row.users[0] === uid ? row.users[1] : row.users[0];
        const profile = ctx.getMergedFriendProfile(friendUid, row.profileByUid?.[friendUid]);
        const alias = String(profile?.alias || "").trim() || friendUid;
        const avatarSrc = ctx.getFriendAvatarSrc(profile);
        const summaries = sharedSummaries.filter((entry) => entry.ownerUid === friendUid);
        const isOpen = openIds.has(friendUid);
        return { friendUid, alias, avatarSrc, summaries, isOpen };
      })
      .sort((a, b) => {
        const byAlias = a.alias.localeCompare(b.alias, undefined, { sensitivity: "base" });
        if (byAlias !== 0) return byAlias;
        return a.friendUid.localeCompare(b.friendUid, undefined, { sensitivity: "base" });
      });

    const visibleFriendUids = new Set(friendRows.map((row) => row.friendUid).filter(Boolean));
    openIds.forEach((friendUid) => {
      if (!visibleFriendUids.has(friendUid)) openIds.delete(friendUid);
    });

    els.groupsFriendsList.innerHTML = friendRows
      .map((row) => {
        const summaryHtml = row.summaries
          .map((entry) => {
            const { timerStateKey } = getFriendSharedTaskTimerState(entry);
            const taskName = String(entry.taskName || "").trim() || "Shared Task";
            return `<div class="dashboardCard friendSharedTaskCard isSummaryCard friendSharedTaskCardState-${ctx.escapeHtmlUI(
              timerStateKey
            )}" role="button" tabindex="0" data-shared-task-summary-id="${ctx.escapeHtmlUI(entry.shareDocId)}" title="Open shared task summary" aria-label="Open shared task summary for ${ctx.escapeHtmlUI(
              taskName
            )}">
              ${renderFriendSharedTaskSummaryContent(entry)}
            </div>`;
          })
          .join("");
        const taskCount = row.summaries.length;
        const sharedCountLabel = `Sharing ${taskCount} tasks`;
        const sharedCountMetaHtml = `<span class="friendIdentityMeta">${ctx.escapeHtmlUI(sharedCountLabel)}</span>`;
        return `<div class="friendEntryWrap">
          <details class="friendSharedTasksDetails" data-friend-uid="${ctx.escapeHtmlUI(row.friendUid)}"${row.isOpen ? " open" : ""}>
            <summary class="settingsDetailNote friendIdentityRow">
              <button class="friendIdentityBtn friendAvatarButton" type="button" data-friend-profile-open="${ctx.escapeHtmlUI(row.friendUid)}" aria-label="Open ${ctx.escapeHtmlUI(row.alias)} profile">
                <span class="friendAvatar friendIdentityAvatarWrap" aria-hidden="true">
                  <img class="friendAvatarImg friendIdentityAvatar" src="${ctx.escapeHtmlUI(row.avatarSrc)}" alt="" />
                </span>
              </button>
              <div class="friendIdentityText">
                <div class="friendIdentityPrimaryLine">
                  <button class="friendIdentityBtn friendIdentityNameBtn" type="button" data-friend-profile-open="${ctx.escapeHtmlUI(row.friendUid)}">
                    <strong class="friendName friendIdentityAlias">${ctx.escapeHtmlUI(row.alias)}</strong>
                  </button>
                  <span class="friendIdentityDivider" aria-hidden="true">|</span>
                  ${sharedCountMetaHtml}
                </div>
              </div>
            </summary>
            <div class="friendSharedTasksList">${summaryHtml || `<div class="settingsDetailNote isEmptyStatus">No tasks shared with you.</div>`}</div>
          </details>
        </div>`;
      })
      .join("");
    wireFriendSharedTaskDetailsState();
  }

  function renderGroupsSharedByYouList() {
    const container = els.groupsSharedByYouList as HTMLElement | null;
    const titleEl = els.groupsSharedByYouTitle as HTMLElement | null;
    if (!container) return;
    const ownSharedSummaries = ctx.getOwnSharedSummaries();
    const uniqueSharedTaskCount = new Set(ownSharedSummaries.map((entry) => String(entry.taskId || "").trim()).filter(Boolean)).size;
    if (titleEl) {
      titleEl.textContent = `Shared by you | ${uniqueSharedTaskCount}`;
      titleEl.classList.toggle("isEmptyCount", uniqueSharedTaskCount === 0);
    }
    if (!ownSharedSummaries.length) {
      container.classList.add("sharedTasksEmpty");
      container.textContent = "No shared tasks.";
      return;
    }

    const uid = ctx.getCurrentUid();
    const friendNameByUid = new Map<string, string>();
    ctx.getGroupsFriendships().forEach((friendship) => {
      const users = friendship.users;
      if (!uid || users.indexOf(uid) === -1) return;
      const friendUid = users[0] === uid ? users[1] : users[0];
      if (!friendUid) return;
      const alias = String(friendship.profileByUid?.[friendUid]?.alias || "").trim();
      friendNameByUid.set(friendUid, alias || friendUid);
    });

    const taskColorById = new Map<string, string | null>();
    ctx.getTasks().forEach((task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId) return;
      taskColorById.set(taskId, normalizeTaskColor(task.color) || null);
    });
    const sharedByTaskId = new Map<string, { taskId: string; taskName: string; taskColor: string | null; friendLabels: string[] }>();
    ownSharedSummaries.forEach((entry) => {
      const taskId = String(entry.taskId || "").trim();
      if (!taskId) return;
      const friendLabel = friendNameByUid.get(entry.friendUid) || String(entry.friendUid || "").trim() || "Unknown friend";
      const existing = sharedByTaskId.get(taskId);
      if (existing) {
        existing.taskColor = existing.taskColor || normalizeTaskColor(entry.taskColor) || taskColorById.get(taskId) || null;
        if (existing.friendLabels.indexOf(friendLabel) === -1) existing.friendLabels.push(friendLabel);
        return;
      }
      sharedByTaskId.set(taskId, {
        taskId,
        taskName: String(entry.taskName || "").trim() || "Untitled task",
        taskColor: normalizeTaskColor(entry.taskColor) || taskColorById.get(taskId) || null,
        friendLabels: [friendLabel],
      });
    });

    const listHtml = Array.from(sharedByTaskId.values())
      .sort((a, b) => a.taskName.localeCompare(b.taskName, undefined, { sensitivity: "base" }))
      .map((entry) => {
        const friendLabel = entry.friendLabels.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).join(", ");
        return `<div class="dashboardCard friendSharedTaskCard isJumpCard" role="button" tabindex="0" data-shared-owned-task-id="${ctx.escapeHtmlUI(entry.taskId)}" title="Open task">
          <div class="friendSharedTaskInfo">
            ${renderFriendSharedTaskTitle(entry.taskName, entry.taskColor)}
            <div class="friendSharedTaskMeta"><span class="friendSharedTaskMetaLabel">Shared with:</span> ${ctx.escapeHtmlUI(friendLabel)}</div>
            <div class="friendSharedTaskActions">
              <button class="btn btn-ghost small" type="button" data-friend-action="open-unshare-task" data-task-id="${ctx.escapeHtmlUI(entry.taskId)}">Change</button>
            </div>
          </div>
        </div>`;
      })
      .join("");

    container.classList.remove("sharedTasksEmpty");
    container.innerHTML = `<div class="friendSharedTasksGrid">${listHtml}</div>`;
  }

  function renderFriendsFooterAlertBadge() {
    const badgeEls = [els.footerTest2AlertBadge, els.commandCenterGroupsAlertBadge].filter(
      (badgeEl): badgeEl is HTMLElement => !!badgeEl
    );
    if (!badgeEls.length) return;
    if (!canUseSocialFeatures()) {
      badgeEls.forEach((badgeEl) => {
        badgeEl.style.display = "none";
        badgeEl.textContent = "";
      });
      return;
    }
    const uid = ctx.getCurrentUid();
    const count = uid ? Math.max(0, Number(ctx.getGroupsIncomingRequests().length) || 0) : 0;
    if (count <= 0) {
      badgeEls.forEach((badgeEl) => {
        badgeEl.style.display = "none";
        badgeEl.textContent = "";
        badgeEl.setAttribute("aria-label", "No incoming friend requests");
      });
      return;
    }
    const countLabel = count > 99 ? "99+" : String(count);
    badgeEls.forEach((badgeEl) => {
      badgeEl.style.display = "inline-flex";
      badgeEl.textContent = countLabel;
      badgeEl.setAttribute("aria-label", `${count} incoming friend request${count === 1 ? "" : "s"}`);
    });
  }

  function renderGroupsPage() {
    if (!canUseSocialFeatures()) {
      renderFriendsFooterAlertBadge();
      renderGroupsLockedState();
      return;
    }
    renderFriendsFooterAlertBadge();
    renderGroupsRequestsList(els.groupsIncomingRequestsList as HTMLElement | null, ctx.getGroupsIncomingRequests(), { incoming: true });
    renderGroupsRequestsList(els.groupsOutgoingRequestsList as HTMLElement | null, ctx.getGroupsOutgoingRequests(), { incoming: false });
    renderGroupsFriendsList();
    renderGroupsSharedByYouList();
    if (els.openFriendRequestModalBtn) els.openFriendRequestModalBtn.disabled = ctx.getGroupsLoading() || !ctx.getCurrentUid();
    if (els.friendRequestSendBtn) els.friendRequestSendBtn.disabled = ctx.getGroupsLoading();
    if (els.friendProfileDeleteBtn) els.friendProfileDeleteBtn.disabled = ctx.getGroupsLoading();
  }

  async function refreshGroupsData(opts?: { preserveStatus?: boolean }) {
    if (!canUseSocialFeatures()) {
      renderGroupsPage();
      return;
    }
    const uid = ctx.getCurrentUid();
    if (!uid) {
      ctx.setGroupsIncomingRequests([]);
      ctx.setGroupsOutgoingRequests([]);
      ctx.setGroupsFriendships([]);
      ctx.setGroupsSharedSummaries([]);
      ctx.setOwnSharedSummaries([]);
      ctx.setFriendProfileCacheByUid({});
      ctx.setFriendEmailByUid({});
      renderGroupsPage();
      return;
    }
    const refreshSeq = ctx.getGroupsRefreshSeq() + 1;
    ctx.setGroupsRefreshSeq(refreshSeq);
    try {
      const snapshot = await loadGroupsSnapshot(uid);
      if (refreshSeq !== ctx.getGroupsRefreshSeq()) return;
      applyGroupsSnapshot(snapshot);
    } catch {
      if (refreshSeq !== ctx.getGroupsRefreshSeq()) return;
      if (!opts?.preserveStatus) ctx.showActionConfirmation("Could not load friend data.");
    } finally {
      renderGroupsPage();
    }
  }

  function getSharedSummaryForImport(shareDocIdRaw: string) {
    const shareDocId = String(shareDocIdRaw || "").trim();
    if (!shareDocId) return null;
    return ctx.getGroupsSharedSummaries().find((entry) => String(entry.shareDocId || "").trim() === shareDocId) || null;
  }

  function importSharedTask(shareDocIdRaw: string) {
    const summary = getSharedSummaryForImport(shareDocIdRaw);
    if (!summary?.importConfig) {
      ctx.showActionConfirmation("This shared task is not available to add yet.");
      return;
    }
    const tasks = ctx.getTasks();
    if (hasImportedSharedTask(tasks, summary.ownerUid, summary.taskId)) {
      ctx.showActionConfirmation("Task already added.");
      renderGroupsPage();
      return;
    }

    const result = buildImportedSharedTask({
      summary,
      importConfig: summary.importConfig,
      existingTasks: tasks,
      makeTask: (name, order) => ctx.sharedTasks.makeTask(name, order),
      createId: ctx.sharedTasks.createId,
      optimalProductivityDays: ctx.getOptimalProductivityDays(),
      optimalProductivityStartTime: ctx.getOptimalProductivityStartTime(),
      optimalProductivityEndTime: ctx.getOptimalProductivityEndTime(),
    });
    ctx.sharedTasks.ensureMilestoneIdentity(result.task);
    ctx.setTasks([...tasks, result.task]);
    renderGroupsPage();
    ctx.render();
    ctx.save();
    const message =
      result.status === "unscheduled"
        ? "Task added. No available schedule slot was found."
        : result.status === "rescheduled"
          ? "Task added at the next available schedule slot."
          : "Task added.";
    ctx.showActionConfirmation(message);
    ctx.jumpToTaskAndHighlight(String(result.task.id || ""));
  }

  async function handleSendFriendRequest() {
    const uid = ctx.getCurrentUid();
    const auth = getFirebaseAuthClient();
    const email = auth?.currentUser?.email || null;
    const receiverEmail = String(els.friendRequestEmailInput?.value || "").trim();
    setFriendRequestModalStatus("");
    if (!uid || !email) {
      setFriendRequestModalStatus("Sign in to send friend requests.", "error");
      renderGroupsPage();
      return;
    }
    const result = await runGroupsBusy("Sending friend request...", "Friend request timed out. Please try again.", () =>
      sendFriendRequest(uid, email, receiverEmail)
    );
    if (!result.ok) {
      const message = result.timedOut ? result.message : "Could not send friend request.";
      setFriendRequestModalStatus(`Friend request failed: ${message}`, "error");
      renderGroupsPage();
      return;
    }
    if (!result.value.ok) {
      const failureMessage = result.value.message || "Could not find a matching email.";
      setFriendRequestModalStatus(`Friend request failed: ${failureMessage}`, "error");
      renderGroupsPage();
      return;
    }
    setFriendRequestModalStatus("");
    ctx.showActionConfirmation("Friend request sent.");
    renderGroupsPage();
    void refreshGroupsData({ preserveStatus: true });
    window.setTimeout(() => {
      closeFriendRequestModal();
    }, 700);
  }

  async function handleFriendRequestAction(
    requestId: string,
    action: "approve" | "decline" | "cancel",
    acceptAnimationSource?: FriendAcceptAnimationSource | null
  ) {
    const uid = ctx.getCurrentUid();
    if (!uid || !requestId) return;
    const pendingStatus =
      action === "approve" ? "Approving request..." : action === "decline" ? "Declining request..." : "Cancelling request...";
    const timeoutStatus =
      action === "approve"
        ? "Approving request timed out. Please try again."
        : action === "decline"
          ? "Declining request timed out. Please try again."
          : "Cancelling request timed out. Please try again.";
    const result = await runGroupsBusy(pendingStatus, timeoutStatus, async () =>
      action === "approve"
        ? await approveFriendRequest(requestId, uid)
        : action === "decline"
          ? await declineFriendRequest(requestId, uid)
          : await cancelOutgoingFriendRequest(requestId, uid)
    );
    if (!result.ok) {
      ctx.showActionConfirmation(result.timedOut ? result.message : "Could not update friend request.");
      renderGroupsPage();
      return;
    }
    if (!result.value.ok) {
      ctx.showActionConfirmation(result.value.message || "Action failed.");
      renderGroupsPage();
      return;
    }
    const completeStatus = getFriendRequestActionCompleteStatus(action);
    ctx.showActionConfirmation(completeStatus);
    renderGroupsPage();
    if (action === "approve" && acceptAnimationSource) {
      await refreshGroupsData({ preserveStatus: true });
      const acceptedFriendRow = await animateFriendAcceptToList(acceptAnimationSource);
      if (acceptedFriendRow) openFriendProfileModal(acceptAnimationSource.friendUid, { zoomSource: acceptedFriendRow });
      return;
    }
    void refreshGroupsData({ preserveStatus: true });
  }

  function registerGroupsEvents() {
    ctx.on(els.openFriendRequestModalBtn, "click", (e: any) => {
      e?.preventDefault?.();
      if (ctx.getGroupsLoading()) return;
      openFriendRequestModal();
    });
    ctx.on(els.friendRequestCancelBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeFriendRequestModal();
    });
    ctx.on(els.friendRequestModal, "click", (e: any) => {
      if (e?.target === els.friendRequestModal) closeFriendRequestModal();
    });
    ctx.on(els.friendProfileCloseBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeFriendProfileModal();
    });
    ctx.on(els.friendProfileModal, "click", (e: any) => {
      if (e?.target === els.friendProfileModal) closeFriendProfileModal();
    });
    ctx.on(els.friendProfileDeleteBtn, "click", (e: any) => {
      e?.preventDefault?.();
      if (ctx.getGroupsLoading()) return;
      const fallbackName = String(els.friendProfileName?.textContent || "").trim();
      const friendName = String(ctx.getActiveFriendProfileName() || fallbackName || "this user").trim();
      ctx.confirm("Remove Friend", `Remove ${friendName} as a friend?`, {
        okLabel: "Remove",
        cancelLabel: "Cancel",
        onOk: () => {
          if (ctx.getGroupsLoading()) return;
          const ownUid = String(ctx.getCurrentUid() || "").trim();
          const friendUid = String(ctx.getActiveFriendProfileUid() || "").trim();
          if (!ownUid) {
            ctx.closeConfirm();
            ctx.showActionConfirmation("Sign in to manage friends.");
            return;
          }
          if (!friendUid) {
            ctx.closeConfirm();
            ctx.showActionConfirmation("Friend account could not be resolved.");
            return;
          }
          ctx.closeConfirm();
          closeFriendProfileModal();
          renderGroupsPage();
          void (async () => {
            const result = await runGroupsBusy(`Deleting ${friendName}...`, "Deleting friend timed out. Please try again.", () =>
              deleteFriendship(ownUid, friendUid)
            );
            if (!result.ok) {
              ctx.showActionConfirmation(result.timedOut ? result.message : "Could not delete friend.");
              renderGroupsPage();
              return;
            }
            if (!result.value.ok) {
              ctx.showActionConfirmation(result.value.message || "Could not delete friend.");
              renderGroupsPage();
              return;
            }
            ctx.setActiveFriendProfileUid(null);
            ctx.setActiveFriendProfileName("");
            ctx.setGroupsFriendships(ctx.getGroupsFriendships().filter((row) => !row.users.includes(friendUid)));
            ctx.setGroupsSharedSummaries(
              ctx
                .getGroupsSharedSummaries()
                .filter((row) => String(row.ownerUid || "").trim() !== friendUid && String(row.friendUid || "").trim() !== friendUid)
            );
            ctx.setOwnSharedSummaries(ctx.getOwnSharedSummaries().filter((row) => String(row.friendUid || "").trim() !== friendUid));
            const nextCache = { ...ctx.getFriendProfileCacheByUid() };
            delete nextCache[friendUid];
            ctx.setFriendProfileCacheByUid(nextCache);
            ctx.showActionConfirmation(result.value.message || `${friendName} was removed from your friends.`);
            renderGroupsPage();
            void refreshGroupsData({ preserveStatus: true });
          })();
        },
      });
      if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).classList.add("isDeleteFriendConfirm");
    });
    ctx.on(els.friendRequestSendBtn, "click", (e: any) => {
      e?.preventDefault?.();
      if (ctx.getGroupsLoading()) return;
      void handleSendFriendRequest();
    });
    ctx.on(els.friendRequestEmailInput, "pointerdown", () => {
      if (els.friendRequestEmailInput) els.friendRequestEmailInput.value = "";
    });
    ctx.on(els.friendRequestEmailInput, "keydown", (e: any) => {
      if (e?.key !== "Enter") return;
      e?.preventDefault?.();
      if (ctx.getGroupsLoading()) return;
      void handleSendFriendRequest();
    });
    ctx.on(els.shareTaskCancelBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeShareTaskModal();
    });
    ctx.on(els.shareTaskModal, "click", (e: any) => {
      if (e?.target === els.shareTaskModal) {
        closeShareTaskModal();
        return;
      }
      const scopeOption = e?.target?.closest?.("[data-share-task-scope-option]") as HTMLElement | null;
      if (scopeOption) {
        e?.preventDefault?.();
        setShareTaskScopeValue(String(scopeOption.getAttribute("data-share-task-scope-option") || "all"));
        setShareTaskScopeDropdownOpen(false);
        return;
      }
      const scopeButton = e?.target?.closest?.("#shareTaskScopeDropdownButton") as HTMLElement | null;
      if (scopeButton) {
        e?.preventDefault?.();
        const expanded = scopeButton.getAttribute("aria-expanded") === "true";
        setShareTaskScopeDropdownOpen(!expanded);
        return;
      }
      if (!e?.target?.closest?.("#shareTaskScopeDropdown")) setShareTaskScopeDropdownOpen(false);
    });
    ctx.on(els.shareTaskModal, "keydown", handleShareTaskScopeDropdownKeyDown);
    ctx.on(els.shareTaskScopeSelect, "change", () => {
      syncShareTaskScopeDropdownUi();
      renderShareTaskFriendOptions();
      syncShareTaskScopeUi();
    });
    ctx.on(els.shareTaskConfirmBtn, "click", (e: any) => {
      e?.preventDefault?.();
      void submitShareTaskModal();
    });
    ctx.on(els.sharedTaskSummaryCloseBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeSharedTaskSummaryModal();
    });
    ctx.on(els.sharedTaskSummaryModal, "click", (e: any) => {
      if (e?.target === els.sharedTaskSummaryModal) {
        closeSharedTaskSummaryModal();
        return;
      }
      const importBtn = e.target?.closest?.('[data-friend-action="import-shared-task"]') as HTMLElement | null;
      if (!importBtn) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (ctx.getGroupsLoading() || (importBtn as HTMLButtonElement).disabled) return;
      importSharedTask(String(importBtn.getAttribute("data-share-doc-id") || ""));
      const shareDocId = String(importBtn.getAttribute("data-share-doc-id") || "");
      openSharedTaskSummaryModal(shareDocId);
    });
    if (typeof window !== "undefined") {
      ctx.on(window, "resize", () => {
        if ((els.sharedTaskSummaryModal as HTMLElement | null)?.style.display === "none") return;
        scheduleSharedTaskSummaryTimelineLabelSync();
      });
    }
    ctx.on(els.groupsIncomingRequestsList, "click", (e: any) => {
      const btn = e.target?.closest?.("[data-friend-action][data-request-id]") as HTMLElement | null;
      if (!btn) return;
      const requestId = String(btn.getAttribute("data-request-id") || "").trim();
      const action = btn.getAttribute("data-friend-action");
      if (!requestId) return;
      if (action !== "approve" && action !== "decline" && action !== "cancel") return;
      if (ctx.getGroupsLoading()) return;
      const acceptAnimationSource = action === "approve" ? captureFriendAcceptAnimationSource(btn, requestId) : null;
      void handleFriendRequestAction(requestId, action, acceptAnimationSource);
    });
    ctx.on(els.groupsOutgoingRequestsList, "click", (e: any) => {
      const btn = e.target?.closest?.("[data-friend-action][data-request-id]") as HTMLElement | null;
      if (!btn) return;
      const requestId = String(btn.getAttribute("data-request-id") || "").trim();
      const action = btn.getAttribute("data-friend-action");
      if (!requestId) return;
      if (action !== "approve" && action !== "decline" && action !== "cancel") return;
      if (ctx.getGroupsLoading()) return;
      void handleFriendRequestAction(requestId, action);
    });
    ctx.on(els.groupsFriendsList, "click", (e: any) => {
      const importBtn = e.target?.closest?.('[data-friend-action="import-shared-task"]') as HTMLElement | null;
      if (importBtn) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        if (ctx.getGroupsLoading() || (importBtn as HTMLButtonElement).disabled) return;
        importSharedTask(String(importBtn.getAttribute("data-share-doc-id") || ""));
        return;
      }
      const sharedTaskCard = e.target?.closest?.("[data-shared-task-summary-id]") as HTMLElement | null;
      if (sharedTaskCard) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        openSharedTaskSummaryModal(String(sharedTaskCard.getAttribute("data-shared-task-summary-id") || ""));
        return;
      }
      const friendUid = getFriendProfileOpenUidFromTarget(e.target);
      if (!friendUid) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      openFriendProfileModal(friendUid, { zoomSource: getFriendProfileZoomSourceFromTarget(e.target) });
    });
    ctx.on(els.groupsFriendsList, "keydown", (e: any) => {
      if (e?.key !== "Enter" && e?.key !== " ") return;
      const sharedTaskCard = e.target?.closest?.("[data-shared-task-summary-id]") as HTMLElement | null;
      if (sharedTaskCard) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        openSharedTaskSummaryModal(String(sharedTaskCard.getAttribute("data-shared-task-summary-id") || ""));
        return;
      }
      const friendUid = getFriendProfileOpenUidFromTarget(e.target);
      if (!friendUid) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      openFriendProfileModal(friendUid, { zoomSource: getFriendProfileZoomSourceFromTarget(e.target) });
    });
    ctx.on(els.groupsSharedByYouList, "click", (e: any) => {
      const unshareBtn = e.target?.closest?.('[data-friend-action="open-unshare-task"]') as HTMLElement | null;
      if (unshareBtn) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        const taskId = String(unshareBtn.getAttribute("data-task-id") || "").trim();
        if (!taskId) return;
        openUnshareTaskModal(taskId);
        return;
      }
      const card = e.target?.closest?.("[data-shared-owned-task-id]") as HTMLElement | null;
      if (!card) return;
      const taskId = String(card.getAttribute("data-shared-owned-task-id") || "").trim();
      if (!taskId) return;
      ctx.jumpToTaskById(taskId);
    });
    ctx.on(els.groupsSharedByYouList, "keydown", (e: any) => {
      if (e?.key !== "Enter" && e?.key !== " ") return;
      const actionBtn = e.target?.closest?.('[data-friend-action="open-unshare-task"]') as HTMLElement | null;
      if (actionBtn) return;
      const card = e.target?.closest?.("[data-shared-owned-task-id]") as HTMLElement | null;
      if (!card) return;
      e?.preventDefault?.();
      const taskId = String(card.getAttribute("data-shared-owned-task-id") || "").trim();
      if (!taskId) return;
      ctx.jumpToTaskById(taskId);
    });
  }

  return {
    renderGroupsPage,
    renderFriendsFooterAlertBadge,
    refreshGroupsData,
    openFriendProfileModal,
    closeFriendProfileModal,
    openFriendRequestModal,
    closeFriendRequestModal,
    openShareTaskModal,
    openUnshareTaskModal,
    closeShareTaskModal,
    refreshOwnSharedSummaries,
    reconcileOwnedSharedSummaryStates,
    syncSharedTaskSummariesForTask,
    syncSharedTaskSummariesForTasks,
    registerGroupsEvents,
  };
}
