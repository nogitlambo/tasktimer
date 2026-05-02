import type { TaskTimerElements } from "./elements";
import type { TaskTimerMutableStore } from "./mutable-store";
import type { DashboardWeekStart } from "../lib/historyChart";
import {
  normalizeOptimalProductivityPeriod,
  timeOfDayToMinutes,
  DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
  DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME,
} from "../lib/productivityPeriod";
import { normalizeTaskColor } from "../lib/taskColors";
import {
  createTaskTimerScheduleRuntime,
  formatScheduleDurationMinutes,
  formatScheduleMinutes,
  isRecurringDailyScheduleTask,
  normalizeScheduleDay,
  resolveScheduleVisibleDayCount,
  SCHEDULE_DAY_LABELS,
  SCHEDULE_LABEL_MINUTES,
  SCHEDULE_MINUTE_PX,
  SCHEDULE_SNAP_MINUTES,
  type TaskTimerScheduleState,
} from "./schedule-runtime";
import { SCHEDULE_DAY_ORDER, type ScheduleDay } from "../lib/schedule-placement";

type TaskTimerScheduleRenderContext = {
  els: Pick<TaskTimerElements, "scheduleGrid" | "scheduleTrayList" | "scheduleMobileDayTabs">;
  state: TaskTimerMutableStore<TaskTimerScheduleState>;
  scheduleRuntime: ReturnType<typeof createTaskTimerScheduleRuntime>;
  escapeHtmlUI: (value: unknown) => string;
  getWeekStarting: () => DashboardWeekStart;
  getOptimalProductivityStartTime: () => string;
  getOptimalProductivityEndTime: () => string;
};

type ProductivityHighlightSegment = {
  topPx: number;
  heightPx: number;
};

function buildScheduleProductivityHighlightSegments(ctx: TaskTimerScheduleRenderContext): ProductivityHighlightSegment[] {
  const period = normalizeOptimalProductivityPeriod({
    optimalProductivityStartTime: ctx.getOptimalProductivityStartTime(),
    optimalProductivityEndTime: ctx.getOptimalProductivityEndTime(),
  });
  const startMinutes = timeOfDayToMinutes(period.startTime, DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME);
  const endMinutes = timeOfDayToMinutes(period.endTime, DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME);

  if (startMinutes <= endMinutes) {
    return [
      {
        topPx: startMinutes * SCHEDULE_MINUTE_PX,
        heightPx: Math.max(SCHEDULE_MINUTE_PX, (endMinutes - startMinutes) * SCHEDULE_MINUTE_PX),
      },
    ];
  }

  return [
    {
      topPx: 0,
      heightPx: Math.max(SCHEDULE_MINUTE_PX, endMinutes * SCHEDULE_MINUTE_PX),
    },
    {
      topPx: startMinutes * SCHEDULE_MINUTE_PX,
      heightPx: Math.max(SCHEDULE_MINUTE_PX, (24 * 60 - startMinutes) * SCHEDULE_MINUTE_PX),
    },
  ];
}

function resolveScheduleAvailableWidth(ctx: TaskTimerScheduleRenderContext) {
  if (typeof window === "undefined") return 0;
  const scheduleGridWidth = ctx.els.scheduleGrid?.getBoundingClientRect?.().width;
  if (scheduleGridWidth && scheduleGridWidth > 0) return scheduleGridWidth;
  return window.innerWidth || 0;
}

function rotateScheduleDaysForWeekStart(days: ScheduleDay[], weekStarting: DashboardWeekStart) {
  const weekStart = normalizeScheduleDay(weekStarting) || "mon";
  const startIndex = SCHEDULE_DAY_ORDER.indexOf(weekStart);
  if (startIndex <= 0) return days;
  const weekDays = SCHEDULE_DAY_ORDER.slice(startIndex).concat(SCHEDULE_DAY_ORDER.slice(0, startIndex));
  return weekDays.slice(0, days.length);
}

export function buildTaskTimerScheduleGridHtml(ctx: TaskTimerScheduleRenderContext) {
  const visibleDayCount = resolveScheduleVisibleDayCount(resolveScheduleAvailableWidth(ctx));
  const isMobileLayout = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const visibleDays = isMobileLayout
    ? ctx.scheduleRuntime.getVisibleDays(visibleDayCount)
    : rotateScheduleDaysForWeekStart(ctx.scheduleRuntime.getVisibleDays(SCHEDULE_DAY_ORDER.length), ctx.getWeekStarting());
  const { scheduled } = ctx.scheduleRuntime.buildViewModel();
  const dragPreview = ctx.scheduleRuntime.getDragPreview(ctx.state.get("dragTaskId"));
  const productivitySegments = buildScheduleProductivityHighlightSegments(ctx);
  const timeLabels = Array.from({ length: 24 * 60 / SCHEDULE_LABEL_MINUTES }, (_, index) => {
    const minutes = index * SCHEDULE_LABEL_MINUTES;
    return `<div class="scheduleTimeLabel" style="height:${SCHEDULE_LABEL_MINUTES * SCHEDULE_MINUTE_PX}px">${ctx.escapeHtmlUI(
      formatScheduleMinutes(minutes)
    )}</div>`;
  }).join("");

  const dayColumns = visibleDays
    .map((day) => {
      const cards = scheduled
        .filter((entry) => entry.day === day)
        .map((entry) => {
          const topPx = entry.startMinutes * SCHEDULE_MINUTE_PX;
          const heightPx = entry.durationMinutes * SCHEDULE_MINUTE_PX;
          const metaText = `${formatScheduleMinutes(entry.startMinutes)} | ${formatScheduleDurationMinutes(entry.durationMinutes)}`;
          const shortClass = entry.durationMinutes < 30 ? " isShort" : "";
          const recurringTask = isRecurringDailyScheduleTask(entry.task);
          const recurringColor = recurringTask && !entry.task.plannedStartOpenEnded ? normalizeTaskColor(entry.task.color) : null;
          const recurringColorStyle = recurringColor ? ` style="--task-color:${ctx.escapeHtmlUI(recurringColor)}"` : "";
          const recurringBadge = recurringTask
            ? `<span class="scheduleTaskCardRecurringBadge${recurringColor ? " hasTaskColor" : ""}"${recurringColorStyle} aria-label="${
                entry.task.plannedStartOpenEnded ? "Flexible daily schedule" : "Repeats daily"
              }">${entry.task.plannedStartOpenEnded ? "Flex" : "Daily"}</span>`
            : "";
          return `<div class="scheduleTaskCard${shortClass}" ${isMobileLayout ? "" : 'draggable="true"'} data-schedule-task-id="${ctx.escapeHtmlUI(
            String(entry.task.id || "")
          )}" data-schedule-task-day="${day}" style="top:${topPx}px;height:${heightPx}px">
            <div class="scheduleTaskCardTopRow">
              <span class="scheduleTaskCardName">${ctx.escapeHtmlUI(entry.task.name || "Task")}</span>
              ${recurringBadge}
            </div>
            <span class="scheduleTaskCardMeta">${ctx.escapeHtmlUI(metaText)}</span>
          </div>`;
        })
        .join("");
      const previewCard =
        dragPreview && dragPreview.day === day
          ? (() => {
              const previewMetaText = `${formatScheduleMinutes(dragPreview.startMinutes)} | ${formatScheduleDurationMinutes(dragPreview.durationMinutes)}`;
              const shortClass = dragPreview.durationMinutes < 30 ? " isShort" : "";
              return `<div class="scheduleDropPreview${dragPreview.hasOverlap ? " isBlocked" : ""}${shortClass}" aria-hidden="true" style="top:${
                dragPreview.startMinutes * SCHEDULE_MINUTE_PX
              }px;height:${dragPreview.durationMinutes * SCHEDULE_MINUTE_PX}px">
                <span class="scheduleDropPreviewName">${ctx.escapeHtmlUI(dragPreview.task.name || "Task")}</span>
                <span class="scheduleDropPreviewMeta">${ctx.escapeHtmlUI(previewMetaText)}</span>
              </div>`;
            })()
          : "";
      const slots = Array.from({ length: 24 * 60 / SCHEDULE_SNAP_MINUTES }, () => {
        return `<div class="scheduleSlot" style="height:${SCHEDULE_SNAP_MINUTES * SCHEDULE_MINUTE_PX}px"></div>`;
      }).join("");
      const productivityHighlight = `<div class="scheduleProductivityHighlight" aria-hidden="true">${productivitySegments
        .map(
          (segment) =>
            `<div class="scheduleProductivityHighlightBand" style="top:${segment.topPx}px;height:${segment.heightPx}px"></div>`
        )
        .join("")}</div>`;
      return `<section class="scheduleDayColumn${dragPreview && dragPreview.day === day ? " isDropActive" : ""}" data-schedule-drop-day="${day}">
        <div class="scheduleDayBody">
          ${productivityHighlight}
          <div class="scheduleDaySlots">${slots}</div>
          ${previewCard}
          <div class="scheduleDayCards">${cards}</div>
        </div>
      </section>`;
    })
    .join("");

  return `<div class="schedulePlanner${isMobileLayout ? " isMobile" : ""}" style="--schedule-visible-days:${visibleDays.length}">
    <div class="schedulePlannerHead">
      <div class="schedulePlannerCorner">Time</div>
      <div class="schedulePlannerDays">${visibleDays
        .map((day) => `<div class="schedulePlannerDayChip">${ctx.escapeHtmlUI(SCHEDULE_DAY_LABELS[day])}</div>`)
        .join("")}</div>
    </div>
    <div class="schedulePlannerBody">
      <div class="scheduleTimeRail">${timeLabels}</div>
      <div class="scheduleDayColumns">${dayColumns}</div>
    </div>
  </div>`;
}

export function renderTaskTimerSchedulePage(ctx: TaskTimerScheduleRenderContext) {
  if (!ctx.els.scheduleGrid) return;
  const isMobileLayout = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  ctx.els.scheduleGrid.innerHTML = buildTaskTimerScheduleGridHtml(ctx);
  if (ctx.els.scheduleTrayList) {
    const { unscheduled } = ctx.scheduleRuntime.buildViewModel();
    ctx.els.scheduleTrayList.innerHTML = unscheduled.length
      ? unscheduled
          .map(({ task, canDrop }) => {
            const unsupportedReason =
              canDrop || (task.timeGoalPeriod === "day" && Number(task.timeGoalMinutes || 0) > 0)
                ? ""
                : '<span class="scheduleTrayMeta">Needs a daily time goal before it can be placed.</span>';
            return `<div class="scheduleTrayTask${canDrop ? "" : " isDisabled"}" ${
              canDrop && !isMobileLayout ? 'draggable="true"' : ""
            } data-schedule-task-id="${ctx.escapeHtmlUI(String(task.id || ""))}">
              <span class="scheduleTrayTaskName">${ctx.escapeHtmlUI(task.name || "Task")}</span>
              ${unsupportedReason}
            </div>`;
          })
          .join("")
      : '<div class="scheduleTrayEmpty">All schedulable tasks are already on the planner.</div>';
  }

  if (ctx.els.scheduleMobileDayTabs) {
    const selectedDay = normalizeScheduleDay(ctx.state.get("selectedDay")) || "mon";
    Array.from(ctx.els.scheduleMobileDayTabs.querySelectorAll<HTMLElement>("[data-schedule-day]")).forEach((button) => {
      const day = normalizeScheduleDay(button.dataset.scheduleDay);
      const isSelected = day === selectedDay;
      button.classList.toggle("isOn", isSelected);
      button.setAttribute("aria-selected", String(isSelected));
      button.setAttribute("tabindex", isSelected ? "0" : "-1");
    });
  }
}
