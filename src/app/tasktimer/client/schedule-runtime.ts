import type { Task } from "../lib/types";
import {
  findScheduleOverlap,
  getScheduleTaskDurationMinutesForDay,
  getSchedulePlacementDays,
  getScheduleTaskDurationMinutes,
  hasTaskScheduledSlots,
  getTaskPlannedStartByDay,
  getTaskScheduledDayEntries,
  getTaskScheduledTime,
  hasTaskMixedScheduleTimes,
  isRecurringDailyScheduleTask,
  normalizeTaskPlannedStartByDay,
  parseScheduleTimeMinutes,
  SCHEDULE_DAY_ORDER,
  syncLegacyPlannedStartFields,
  type ScheduleDay,
} from "../lib/schedule-placement";
import type { TaskPlannedStartByDay } from "../lib/types";
import type { TaskTimerMutableStore } from "./mutable-store";

export type TaskTimerScheduleState = {
  selectedDay: Task["plannedStartDay"];
  dragTaskId: string | null;
  dragSourceDay: ScheduleDay | null;
  dragPreviewDay: ScheduleDay | null;
  dragPreviewStartMinutes: number | null;
  dragPointerOffsetMinutes: number;
};

export type TaskTimerScheduleViewModel = {
  scheduled: Array<{
    task: Task;
    day: ScheduleDay;
    startMinutes: number;
    durationMinutes: number;
  }>;
  unscheduled: Array<{ task: Task; canDrop: boolean }>;
};

export const SCHEDULE_DAY_LABELS: Record<ScheduleDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export const SCHEDULE_SNAP_MINUTES = 15;
export const SCHEDULE_LABEL_MINUTES = 30;
export const SCHEDULE_MINUTE_PX = 44 / 30;
export const SCHEDULE_MIN_DAY_COLUMN_WIDTH_PX = 180;
export const SCHEDULE_DESKTOP_TIME_RAIL_WIDTH_PX = 88;
export const SCHEDULE_COMPACT_TIME_RAIL_WIDTH_PX = 72;

type CreateTaskTimerScheduleRuntimeOptions = {
  state: TaskTimerMutableStore<TaskTimerScheduleState>;
  getTasks: () => Task[];
  save: () => void;
  render: () => void;
};

export function normalizeScheduleDay(raw: unknown): Task["plannedStartDay"] {
  const value = String(raw || "").trim().toLowerCase();
  return SCHEDULE_DAY_ORDER.includes(value as ScheduleDay) ? (value as ScheduleDay) : null;
}

type NormalizeConflict = {
  day: ScheduleDay;
  taskName: string;
};

export function isScheduleMobileLayout() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
}

export { parseScheduleTimeMinutes };

export function resolveScheduleVisibleDayCount(availableWidthRaw: unknown) {
  const availableWidth = Math.max(0, Math.floor(Number(availableWidthRaw) || 0));
  const compactRail = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const timeRailWidth = compactRail ? SCHEDULE_COMPACT_TIME_RAIL_WIDTH_PX : SCHEDULE_DESKTOP_TIME_RAIL_WIDTH_PX;
  const dayAreaWidth = Math.max(0, availableWidth - timeRailWidth);
  const visibleDayCount = Math.floor(dayAreaWidth / SCHEDULE_MIN_DAY_COLUMN_WIDTH_PX);
  return Math.max(1, Math.min(SCHEDULE_DAY_ORDER.length, visibleDayCount || 1));
}

export function formatScheduleMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, Math.floor(Number(totalMinutes) || 0)));
  const hours24 = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function formatScheduleStoredTime(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - SCHEDULE_SNAP_MINUTES, Math.floor(Number(totalMinutes) || 0)));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatScheduleDurationMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  if (safeMinutes <= 0) return "0m";
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function formatScheduleDayLabel(day: ScheduleDay | null | undefined) {
  return day ? SCHEDULE_DAY_LABELS[day] || day : "";
}

export function snapScheduleMinutes(totalMinutes: number) {
  return Math.max(
    0,
    Math.min(24 * 60 - SCHEDULE_SNAP_MINUTES, Math.round(Math.max(0, totalMinutes) / SCHEDULE_SNAP_MINUTES) * SCHEDULE_SNAP_MINUTES)
  );
}

export function isScheduleRenderableTask(task: Task) {
  return getTaskScheduledDayEntries(task).some((entry) => getScheduleTaskDurationMinutesForDay(task, entry.day) > 0) || getScheduleTaskDurationMinutes(task) > 0;
}

export function createTaskTimerScheduleRuntime(options: CreateTaskTimerScheduleRuntimeOptions) {
  function getVisibleDays(visibleDayCountRaw: number = SCHEDULE_DAY_ORDER.length): ScheduleDay[] {
    const selectedDay = normalizeScheduleDay(options.state.get("selectedDay")) || "mon";
    const selectedDayIndex = Math.max(0, SCHEDULE_DAY_ORDER.indexOf(selectedDay));
    const visibleDayCount = Math.max(1, Math.min(SCHEDULE_DAY_ORDER.length, Math.floor(Number(visibleDayCountRaw) || 1)));
    options.state.set("selectedDay", selectedDay);
    return Array.from({ length: visibleDayCount }, (_, index) => {
      return SCHEDULE_DAY_ORDER[(selectedDayIndex + index) % SCHEDULE_DAY_ORDER.length]!;
    });
  }

  function getScheduleDaysForTask(task: Task): ScheduleDay[] {
    return getTaskScheduledDayEntries(task).map((entry) => entry.day);
  }

  function buildViewModel(): TaskTimerScheduleViewModel {
    const scheduled: TaskTimerScheduleViewModel["scheduled"] = [];
    const unscheduled: TaskTimerScheduleViewModel["unscheduled"] = [];

    for (const task of options.getTasks()) {
      const scheduledEntries = getTaskScheduledDayEntries(task);
      const hasRenderableSchedule =
        scheduledEntries.some((entry) => {
          const durationMinutes = getScheduleTaskDurationMinutesForDay(task, entry.day);
          const startMinutes = parseScheduleTimeMinutes(entry.time);
          return durationMinutes > 0 && startMinutes != null && startMinutes + durationMinutes <= 24 * 60;
        });
      if (hasRenderableSchedule) {
        scheduledEntries.forEach((entry) => {
          const durationMinutes = getScheduleTaskDurationMinutesForDay(task, entry.day);
          const startMinutes = parseScheduleTimeMinutes(entry.time);
          if (!(durationMinutes > 0) || startMinutes == null || startMinutes + durationMinutes > 24 * 60) return;
          scheduled.push({ task, day: entry.day, startMinutes, durationMinutes });
        });
      } else {
        unscheduled.push({ task, canDrop: getScheduleTaskDurationMinutes(task) > 0 });
      }
    }

    scheduled.sort((a, b) => {
      if (a.day !== b.day) return SCHEDULE_DAY_ORDER.indexOf(a.day) - SCHEDULE_DAY_ORDER.indexOf(b.day);
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      return a.task.order - b.task.order;
    });
    unscheduled.sort((a, b) => a.task.order - b.task.order);
    return { scheduled, unscheduled };
  }

  function placementHasOverlap(taskId: string, day: ScheduleDay, startMinutes: number, durationMinutes: number) {
    const candidate = {
      id: taskId,
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: durationMinutes,
      plannedStartByDay: { [day]: formatScheduleStoredTime(startMinutes) },
    } as Task;
    return !!findScheduleOverlap(options.getTasks(), candidate, { excludeTaskId: taskId });
  }

  function placementHasOverlapOnAnyDay(
    taskId: string,
    days: ScheduleDay[],
    startMinutes: number,
    durationMinutes: number
  ) {
    return days.some((day) => placementHasOverlap(taskId, day, startMinutes, durationMinutes));
  }

  function setTaskScheduleByDay(task: Task, byDay: TaskPlannedStartByDay, opts?: { flexible?: boolean }) {
    task.plannedStartByDay = byDay;
    task.plannedStartOpenEnded = !!opts?.flexible;
    syncLegacyPlannedStartFields(task);
  }

  function moveTaskOnSchedule(taskIdRaw: string, dayRaw: unknown, rawMinutes: number, sourceDayRaw?: unknown) {
    const taskId = String(taskIdRaw || "").trim();
    const day = normalizeScheduleDay(dayRaw);
    const sourceDay = normalizeScheduleDay(sourceDayRaw);
    if (!taskId || !day) return;
    const taskIndex = options.getTasks().findIndex((entry) => String(entry.id || "") === taskId);
    if (taskIndex < 0) return;
    const task = options.getTasks()[taskIndex]!;
    const durationMinutes = getScheduleTaskDurationMinutesForDay(task, day) || getScheduleTaskDurationMinutes(task);
    if (!(durationMinutes > 0)) return;
    const startMinutes = snapScheduleMinutes(rawMinutes);
    const placementDays = getSchedulePlacementDays(task, day, sourceDay);
    if (placementHasOverlapOnAnyDay(taskId, placementDays, startMinutes, durationMinutes)) return;
    const nextByDay = { ...(getTaskPlannedStartByDay(task) || {}) };
    const scheduledDays = getScheduleDaysForTask(task);
    const nextTime = formatScheduleStoredTime(startMinutes);
    if (sourceDay) {
      if (nextByDay[sourceDay]) delete nextByDay[sourceDay];
      nextByDay[day] = nextTime;
      setTaskScheduleByDay(task, nextByDay, { flexible: true });
    } else if (scheduledDays.length === 1) {
      nextByDay[day] = nextTime;
      const onlyScheduledDay = scheduledDays[0];
      if (onlyScheduledDay && onlyScheduledDay !== day) delete nextByDay[onlyScheduledDay];
    } else {
      placementDays.forEach((placementDay) => {
        nextByDay[placementDay] = nextTime;
      });
    }
    setTaskScheduleByDay(task, nextByDay, { flexible: task.plannedStartOpenEnded === true });
    options.state.set("selectedDay", day);
    options.save();
    options.render();
  }

  function getNormalizeConflicts(taskIdRaw: string, sourceDayRaw: unknown): NormalizeConflict[] {
    const taskId = String(taskIdRaw || "").trim();
    const sourceDay = normalizeScheduleDay(sourceDayRaw);
    if (!taskId || !sourceDay) return [];
    const task = options.getTasks().find((entry) => String(entry.id || "") === taskId);
    if (!task) return [];
    const sourceTime = getTaskScheduledTime(task, sourceDay);
    if (!sourceTime) return [];
    const startMinutes = parseScheduleTimeMinutes(sourceTime);
    const durationMinutes = getScheduleTaskDurationMinutesForDay(task, sourceDay) || getScheduleTaskDurationMinutes(task);
    if (startMinutes == null || !(durationMinutes > 0)) return [];
    return getScheduleDaysForTask(task)
      .filter((day) => day !== sourceDay)
      .flatMap((day) => {
        const { scheduled } = buildViewModel();
        const conflicts = scheduled.filter((entry) => {
          if (String(entry.task.id || "") === taskId) return false;
          if (entry.day !== day) return false;
          const endMinutes = startMinutes + durationMinutes;
          const entryEnd = entry.startMinutes + entry.durationMinutes;
          return startMinutes < entryEnd && endMinutes > entry.startMinutes;
        });
        return conflicts.map((entry) => ({ day, taskName: String(entry.task.name || "Task") || "Task" }));
      });
  }

  function normalizeTaskSchedule(taskIdRaw: string, sourceDayRaw: unknown) {
    const taskId = String(taskIdRaw || "").trim();
    const sourceDay = normalizeScheduleDay(sourceDayRaw);
    if (!taskId || !sourceDay) return { status: "missing" as const, conflicts: [] as NormalizeConflict[] };
    const task = options.getTasks().find((entry) => String(entry.id || "") === taskId);
    if (!task) return { status: "missing" as const, conflicts: [] as NormalizeConflict[] };
    const sourceTime = getTaskScheduledTime(task, sourceDay);
    const scheduledDays = getScheduleDaysForTask(task);
    if (!sourceTime || scheduledDays.length <= 1 || !hasTaskMixedScheduleTimes(task)) {
      return { status: "noop" as const, conflicts: [] as NormalizeConflict[] };
    }
    const conflicts = getNormalizeConflicts(taskId, sourceDay);
    if (conflicts.length > 0) return { status: "conflict" as const, conflicts };
    const nextByDay = Object.fromEntries(scheduledDays.map((day) => [day, sourceTime])) as TaskPlannedStartByDay;
    setTaskScheduleByDay(task, nextByDay, { flexible: false });
    options.state.set("selectedDay", sourceDay);
    options.save();
    options.render();
    return { status: "updated" as const, conflicts: [] as NormalizeConflict[] };
  }

  function toggleTaskScheduleFlexible(taskIdRaw: string) {
    const taskId = String(taskIdRaw || "").trim();
    if (!taskId) return { status: "missing" as const };
    const task = options.getTasks().find((entry) => String(entry.id || "") === taskId);
    if (!task) return { status: "missing" as const };
    const hasSchedule = hasTaskScheduledSlots(task);
    if (!hasSchedule) return { status: "noop" as const };
    const nextFlexible = !task.plannedStartOpenEnded;
    if (nextFlexible && !normalizeTaskPlannedStartByDay(task.plannedStartByDay)) {
      const scheduledEntries = getTaskScheduledDayEntries(task);
      if (scheduledEntries.length > 0) {
        const nextByDay = Object.fromEntries(scheduledEntries.map((entry) => [entry.day, entry.time])) as TaskPlannedStartByDay;
        setTaskScheduleByDay(task, nextByDay, { flexible: true });
      } else {
        task.plannedStartOpenEnded = true;
      }
    } else {
      task.plannedStartOpenEnded = nextFlexible;
    }
    options.save();
    options.render();
    return { status: "updated" as const, flexible: !!task.plannedStartOpenEnded };
  }

  function clearDragPreview() {
    options.state.set("dragSourceDay", null);
    options.state.set("dragPreviewDay", null);
    options.state.set("dragPreviewStartMinutes", null);
    options.state.set("dragPointerOffsetMinutes", 0);
  }

  function getDragPreview(taskIdRaw: string | null) {
    const taskId = String(taskIdRaw || "").trim();
    const dragSourceDay = options.state.get("dragSourceDay");
    const dragPreviewDay = options.state.get("dragPreviewDay");
    const dragPreviewStartMinutes = options.state.get("dragPreviewStartMinutes");
    if (!taskId || !dragPreviewDay || dragPreviewStartMinutes == null) return null;
    const task = options.getTasks().find((entry) => String(entry.id || "") === taskId);
    if (!task) return null;
    const durationMinutes =
      getScheduleTaskDurationMinutesForDay(task, dragPreviewDay) || getScheduleTaskDurationMinutes(task);
    if (!(durationMinutes > 0)) return null;
    const placementDays = getSchedulePlacementDays(task, dragPreviewDay, dragSourceDay);
    return {
      taskId,
      task,
      day: dragPreviewDay,
      startMinutes: dragPreviewStartMinutes,
      durationMinutes,
      hasOverlap: placementHasOverlapOnAnyDay(taskId, placementDays, dragPreviewStartMinutes, durationMinutes),
    };
  }

  function resolveDropStartMinutes(dropZone: HTMLElement, clientYRaw: unknown) {
    const dayBody = dropZone.querySelector(".scheduleDayBody") as HTMLElement | null;
    const bodyRect = (dayBody || dropZone).getBoundingClientRect();
    const clientY = Number(clientYRaw) || 0;
    const yWithinBody = Math.max(0, Math.min(bodyRect.height, clientY - bodyRect.top));
    const adjustedMinutes = yWithinBody / SCHEDULE_MINUTE_PX - options.state.get("dragPointerOffsetMinutes");
    return snapScheduleMinutes(adjustedMinutes);
  }

  return {
    getVisibleDays,
    buildViewModel,
    moveTaskOnSchedule,
    normalizeTaskSchedule,
    toggleTaskScheduleFlexible,
    getNormalizeConflicts,
    clearDragPreview,
    getDragPreview,
    resolveDropStartMinutes,
    placementHasOverlap,
    placementHasOverlapOnAnyDay,
  };
}

export { isRecurringDailyScheduleTask };
