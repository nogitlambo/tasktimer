import type { Task, TaskPlannedStartByDay } from "./types";

export const SCHEDULE_DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type ScheduleDay = (typeof SCHEDULE_DAY_ORDER)[number];

export function normalizeScheduleDayValue(raw: unknown): ScheduleDay | null {
  const value = String(raw || "").trim().toLowerCase();
  return SCHEDULE_DAY_ORDER.includes(value as ScheduleDay) ? (value as ScheduleDay) : null;
}

export function normalizeLocalDateValue(raw: unknown): string | null {
  const value = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveNextScheduleDayDate(day: ScheduleDay, nowDate = new Date()): string {
  const start = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const currentDay = start.getDay();
  const targetDay = SCHEDULE_DAY_ORDER.indexOf(day) + 1;
  const delta = (targetDay - currentDay + 7) % 7;
  start.setDate(start.getDate() + delta);
  return formatLocalDate(start);
}

export function hasLocalDatePassed(localDate: string, nowDate = new Date()): boolean {
  const normalized = normalizeLocalDateValue(localDate);
  if (!normalized) return false;
  return normalized < formatLocalDate(nowDate);
}

export function normalizeScheduleStoredTime(raw: unknown): string | null {
  const match = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeTaskPlannedStartByDay(raw: unknown): TaskPlannedStartByDay | null {
  if (!raw || typeof raw !== "object") return null;
  const result: TaskPlannedStartByDay = {};
  for (const day of SCHEDULE_DAY_ORDER) {
    const normalizedTime = normalizeScheduleStoredTime((raw as Record<string, unknown>)[day]);
    if (normalizedTime) result[day] = normalizedTime;
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function buildLegacyTaskPlannedStartByDay(task: Task): TaskPlannedStartByDay | null {
  if (!!task.plannedStartOpenEnded) return null;
  const plannedStartTime = normalizeScheduleStoredTime(task.plannedStartTime);
  if (!plannedStartTime) return null;
  const plannedStartDay = normalizeScheduleDayValue(task.plannedStartDay);
  if (plannedStartDay) return { [plannedStartDay]: plannedStartTime };
  return Object.fromEntries(SCHEDULE_DAY_ORDER.map((day) => [day, plannedStartTime])) as TaskPlannedStartByDay;
}

export function getTaskPlannedStartByDay(task: Task): TaskPlannedStartByDay | null {
  return normalizeTaskPlannedStartByDay(task.plannedStartByDay) || buildLegacyTaskPlannedStartByDay(task);
}

export function hasTaskScheduledSlots(task: Task): boolean {
  return !!getTaskPlannedStartByDay(task);
}

export function isFlexibleUnscheduledTask(task: Task): boolean {
  return !!task.plannedStartOpenEnded && !hasTaskScheduledSlots(task);
}

export function getTaskScheduledDayEntries(task: Task): Array<{ day: ScheduleDay; time: string }> {
  const byDay = getTaskPlannedStartByDay(task);
  if (!byDay) return [];
  return SCHEDULE_DAY_ORDER.flatMap((day) => {
    const time = normalizeScheduleStoredTime(byDay[day]);
    return time ? [{ day, time }] : [];
  });
}

export function getTaskScheduledDays(task: Task): ScheduleDay[] {
  return getTaskScheduledDayEntries(task).map((entry) => entry.day);
}

export function getTaskScheduledTime(task: Task, day: ScheduleDay): string | null {
  const byDay = getTaskPlannedStartByDay(task);
  return byDay ? normalizeScheduleStoredTime(byDay[day]) : null;
}

export function hasTaskMixedScheduleTimes(task: Task): boolean {
  const entries = getTaskScheduledDayEntries(task);
  if (entries.length <= 1) return false;
  return new Set(entries.map((entry) => entry.time)).size > 1;
}

export function isRecurringDailyScheduleTask(task: Task): boolean {
  return getTaskScheduledDayEntries(task).length === SCHEDULE_DAY_ORDER.length;
}

export function canNormalizeTaskSchedule(task: Task): boolean {
  return hasTaskMixedScheduleTimes(task);
}

export function getSchedulePlacementDays(task: Task, dropDay: ScheduleDay, sourceDay?: ScheduleDay | null): ScheduleDay[] {
  const byDay = normalizeTaskPlannedStartByDay(task.plannedStartByDay);
  if (task.plannedStartOpenEnded) return [dropDay];
  if (byDay) {
    return SCHEDULE_DAY_ORDER.filter((day) => !!normalizeScheduleStoredTime(byDay[day]));
  }
  const plannedDay = normalizeScheduleDayValue(task?.plannedStartDay);
  if (plannedDay) return [dropDay];
  return [...SCHEDULE_DAY_ORDER];
}

export function getMovedScheduleDayValue(task: Task, dropDay: ScheduleDay): Task["plannedStartDay"] {
  return getSchedulePlacementDays(task, dropDay).length === 1 ? dropDay : null;
}

export function syncLegacyPlannedStartFields(task: Task, byDayRaw?: TaskPlannedStartByDay | null) {
  const byDay =
    byDayRaw !== undefined
      ? normalizeTaskPlannedStartByDay(byDayRaw)
      : getTaskPlannedStartByDay(task);
  const entries = byDay
    ? SCHEDULE_DAY_ORDER.flatMap((day) => {
        const time = normalizeScheduleStoredTime(byDay[day]);
        return time ? [{ day, time }] : [];
      })
    : [];

  task.plannedStartByDay = byDay;
  if (entries.length === 0) {
    task.plannedStartDay = null;
    task.plannedStartTime = null;
    return;
  }

  if (entries.length === 1) {
    task.plannedStartDay = entries[0]!.day;
    task.plannedStartTime = entries[0]!.time;
    return;
  }

  const uniqueTimes = Array.from(new Set(entries.map((entry) => entry.time)));
  if (entries.length === SCHEDULE_DAY_ORDER.length && uniqueTimes.length === 1) {
    task.plannedStartDay = null;
    task.plannedStartTime = uniqueTimes[0] || null;
    return;
  }

  task.plannedStartDay = null;
  task.plannedStartTime = null;
}
