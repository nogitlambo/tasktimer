import type { TaskTimerElements } from "./elements";
import type { TaskTimerMutableStore } from "./mutable-store";
import {
  createTaskTimerScheduleRuntime,
  formatScheduleDayLabel,
  formatScheduleDurationMinutes,
  formatScheduleMinutes,
  isRecurringDailyScheduleTask,
  normalizeScheduleDay,
  SCHEDULE_DAY_LABELS,
  SCHEDULE_LABEL_MINUTES,
  SCHEDULE_MINUTE_PX,
  SCHEDULE_SNAP_MINUTES,
  type TaskTimerScheduleState,
} from "./schedule-runtime";

type TaskTimerScheduleRenderContext = {
  els: Pick<TaskTimerElements, "scheduleGrid" | "scheduleTrayList" | "scheduleMobileDayTabs">;
  state: TaskTimerMutableStore<TaskTimerScheduleState>;
  scheduleRuntime: ReturnType<typeof createTaskTimerScheduleRuntime>;
  escapeHtmlUI: (value: unknown) => string;
};

export function buildTaskTimerScheduleGridHtml(ctx: TaskTimerScheduleRenderContext) {
  const visibleDays = ctx.scheduleRuntime.getVisibleDays();
  const { scheduled } = ctx.scheduleRuntime.buildViewModel();
  const dragPreview = ctx.scheduleRuntime.getDragPreview(ctx.state.get("dragTaskId"));
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
          const recurringAction = recurringTask
            ? `<button class="iconBtn scheduleTaskCardConvertBtn" data-schedule-convert-single-day="${ctx.escapeHtmlUI(
                String(entry.task.id || "")
              )}" data-schedule-convert-day="${day}" type="button" aria-label="${ctx.escapeHtmlUI(
                `Convert ${String(entry.task.name || "Task")} to a single-day task on ${formatScheduleDayLabel(day)}`
              )}" title="Convert this recurring task to ${formatScheduleDayLabel(day)} only">Single day</button>`
            : "";
          const recurringBadge = recurringTask
            ? `<span class="scheduleTaskCardRecurringBadge" aria-label="Repeats daily">Daily</span>`
            : "";
          return `<div class="scheduleTaskCard${shortClass}" draggable="true" data-schedule-task-id="${ctx.escapeHtmlUI(
            String(entry.task.id || "")
          )}" style="top:${topPx}px;height:${heightPx}px">
            <div class="scheduleTaskCardTopRow">
              ${recurringBadge}
              ${recurringAction}
            </div>
            <span class="scheduleTaskCardName">${ctx.escapeHtmlUI(entry.task.name || "Task")}</span>
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
      const slots = Array.from({ length: 24 * 60 / SCHEDULE_SNAP_MINUTES }, (_, index) => {
        const slotMinutes = index * SCHEDULE_SNAP_MINUTES;
        const middayClass = slotMinutes === 12 * 60 ? " isMidday" : "";
        return `<div class="scheduleSlot${middayClass}" style="height:${SCHEDULE_SNAP_MINUTES * SCHEDULE_MINUTE_PX}px"></div>`;
      }).join("");
      return `<section class="scheduleDayColumn${dragPreview && dragPreview.day === day ? " isDropActive" : ""}" data-schedule-drop-day="${day}">
        <div class="scheduleDayBody">
          <div class="scheduleDaySlots">${slots}</div>
          ${previewCard}
          <div class="scheduleDayCards">${cards}</div>
        </div>
      </section>`;
    })
    .join("");

  return `<div class="schedulePlanner${typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? " isMobile" : ""}">
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
  if (!ctx.els.scheduleGrid || !ctx.els.scheduleTrayList) return;
  ctx.els.scheduleGrid.innerHTML = buildTaskTimerScheduleGridHtml(ctx);
  const { unscheduled } = ctx.scheduleRuntime.buildViewModel();
  ctx.els.scheduleTrayList.innerHTML = unscheduled.length
    ? unscheduled
        .map(({ task, canDrop }) => {
          const unsupportedReason =
            canDrop || (task.timeGoalPeriod === "day" && Number(task.timeGoalMinutes || 0) > 0)
              ? ""
              : '<span class="scheduleTrayMeta">Needs a daily time goal before it can be placed.</span>';
          return `<div class="scheduleTrayTask${canDrop ? "" : " isDisabled"}" ${
            canDrop ? 'draggable="true"' : ""
          } data-schedule-task-id="${ctx.escapeHtmlUI(String(task.id || ""))}">
            <span class="scheduleTrayTaskName">${ctx.escapeHtmlUI(task.name || "Task")}</span>
            ${unsupportedReason}
          </div>`;
        })
        .join("")
    : '<div class="scheduleTrayEmpty">All schedulable tasks are already on the planner.</div>';

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
