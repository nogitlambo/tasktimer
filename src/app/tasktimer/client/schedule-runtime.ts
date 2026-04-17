import type { Task } from "../lib/types";
import {
  getSchedulePlacementDays,
  hasTaskScheduledSlots,
  getTaskPlannedStartByDay,
  getTaskScheduledDayEntries,
  getTaskScheduledTime,
  hasTaskMixedScheduleTimes,
  isRecurringDailyScheduleTask,
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

export function parseScheduleTimeMinutes(raw: unknown): number | null {
  const match = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatScheduleMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, Math.floor(Number(totalMinutes) || 0)));
  const hours24 = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

export function formatScheduleStoredTime(totalMinutes: number) {
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

export function getScheduleTaskDurationMinutes(task: Task) {
  const hasGoal = !!task.timeGoalEnabled && task.timeGoalPeriod === "day" && Number(task.timeGoalMinutes || 0) > 0;
  if (!hasGoal) return 0;
  const goalMinutes = Math.max(SCHEDULE_SNAP_MINUTES, Math.round(Number(task.timeGoalMinutes || 0)));
  return Math.min(24 * 60, goalMinutes);
}

export function isScheduleRenderableTask(task: Task) {
  return getScheduleTaskDurationMinutes(task) > 0;
}

export function createTaskTimerScheduleRuntime(options: CreateTaskTimerScheduleRuntimeOptions) {
  function getVisibleDays(): ScheduleDay[] {
    if (isScheduleMobileLayout()) {
      const selectedDay = normalizeScheduleDay(options.state.get("selectedDay")) || "mon";
      options.state.set("selectedDay", selectedDay);
      return [selectedDay];
    }
    return [...SCHEDULE_DAY_ORDER];
  }

  function getScheduleDaysForTask(task: Task): ScheduleDay[] {
    return getTaskScheduledDayEntries(task).map((entry) => entry.day);
  }

  function buildViewModel(): TaskTimerScheduleViewModel {
    const scheduled: TaskTimerScheduleViewModel["scheduled"] = [];
    const unscheduled: TaskTimerScheduleViewModel["unscheduled"] = [];

    for (const task of options.getTasks()) {
      const durationMinutes = getScheduleTaskDurationMinutes(task);
      const scheduledEntries = getTaskScheduledDayEntries(task);
      const hasRenderableSchedule =
        durationMinutes > 0 &&
        scheduledEntries.some((entry) => {
          const startMinutes = parseScheduleTimeMinutes(entry.time);
          return startMinutes != null && startMinutes + durationMinutes <= 24 * 60;
        });
      if (hasRenderableSchedule) {
        scheduledEntries.forEach((entry) => {
          const startMinutes = parseScheduleTimeMinutes(entry.time);
          if (startMinutes == null || startMinutes + durationMinutes > 24 * 60) return;
          scheduled.push({ task, day: entry.day, startMinutes, durationMinutes });
        });
      } else {
        unscheduled.push({ task, canDrop: durationMinutes > 0 });
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
    const endMinutes = startMinutes + durationMinutes;
    if (endMinutes > 24 * 60) return true;
    const { scheduled } = buildViewModel();
    return scheduled.some((entry) => {
      if (String(entry.task.id || "") === taskId) return false;
      if (entry.day !== day) return false;
      const entryEnd = entry.startMinutes + entry.durationMinutes;
      return startMinutes < entryEnd && endMinutes > entry.startMinutes;
    });
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
    const durationMinutes = getScheduleTaskDurationMinutes(task);
    if (!(durationMinutes > 0)) return;
    const startMinutes = snapScheduleMinutes(rawMinutes);
    const placementDays = getSchedulePlacementDays(task, day, sourceDay);
    if (placementHasOverlapOnAnyDay(taskId, placementDays, startMinutes, durationMinutes)) return;
    const nextByDay = { ...(getTaskPlannedStartByDay(task) || {}) };
    const scheduledDays = getScheduleDaysForTask(task);
    const nextTime = formatScheduleStoredTime(startMinutes);
    if (sourceDay && nextByDay[sourceDay]) {
      if (task.plannedStartOpenEnded) {
        delete nextByDay[sourceDay];
        nextByDay[day] = nextTime;
      } else {
        placementDays.forEach((placementDay) => {
          nextByDay[placementDay] = nextTime;
        });
      }
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
    const durationMinutes = getScheduleTaskDurationMinutes(task);
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
    task.plannedStartOpenEnded = !task.plannedStartOpenEnded;
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
    const durationMinutes = getScheduleTaskDurationMinutes(task);
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
