import type { Task, TaskPlannedStartByDay } from "./types";

export const SCHEDULE_DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type ScheduleDay = (typeof SCHEDULE_DAY_ORDER)[number];

const SCHEDULE_DAY_LABELS: Record<ScheduleDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function normalizeScheduleDayValue(raw: unknown): ScheduleDay | null {
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

export function parseScheduleTimeMinutes(raw: unknown): number | null {
  const normalized = normalizeScheduleStoredTime(raw);
  if (!normalized) return null;
  const [hoursRaw, minutesRaw] = normalized.split(":");
  const hours = Number(hoursRaw || 0);
  const minutes = Number(minutesRaw || 0);
  return hours * 60 + minutes;
}

export function formatScheduleSlotTime(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, Math.floor(Number(totalMinutes) || 0)));
  const hours24 = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

export function formatScheduleDayLabel(day: ScheduleDay) {
  return SCHEDULE_DAY_LABELS[day] || day;
}

export function formatScheduleSlotSuggestion(slot: NextAvailableScheduleSlotResult) {
  const dayLabels = slot.days.map(formatScheduleDayLabel);
  const dayText = dayLabels.length === 1 ? dayLabels[0] : dayLabels.join(", ");
  return `Next available slot: ${formatScheduleSlotTime(slot.startMinutes)} on ${dayText}.`;
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

function buildLegacyTaskPlannedStartByDay(task: Task): TaskPlannedStartByDay | null {
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

export function getScheduleTaskDurationMinutes(task: Task): number {
  const goalMinutes = Number(task.timeGoalMinutes || 0);
  const hasScheduledDuration =
    !!task.timeGoalEnabled &&
    goalMinutes > 0 &&
    (task.taskType === "once-off" || task.timeGoalPeriod === "day");
  if (!hasScheduledDuration) return 0;
  return Math.min(24 * 60, Math.max(15, Math.round(goalMinutes)));
}

export type NextScheduledTaskResult = {
  task: Task;
  index: number;
  day: ScheduleDay;
  startMinutes: number;
};

export function getLocalScheduleDay(nowDate = new Date()): ScheduleDay {
  const day = nowDate.getDay();
  if (day === 0) return "sun";
  return SCHEDULE_DAY_ORDER[day - 1] || "mon";
}

export function getLocalScheduleMinutes(nowDate = new Date()): number {
  return nowDate.getHours() * 60 + nowDate.getMinutes();
}

export function findNextScheduledTaskAfterLocalTime(
  tasks: Task[],
  options?: { excludeTaskId?: string | null; nowDate?: Date }
): NextScheduledTaskResult | null {
  const nowDate = options?.nowDate || new Date();
  const today = getLocalScheduleDay(nowDate);
  const currentMinutes = getLocalScheduleMinutes(nowDate);
  const excludeTaskId = String(options?.excludeTaskId || "").trim();
  const candidates = tasks.flatMap((task, index) => {
    const taskId = String(task?.id || "").trim();
    if (!taskId || taskId === excludeTaskId || task.running) return [];
    return getTaskScheduledDayEntries(task)
      .filter((entry) => entry.day === today)
      .flatMap((entry) => {
        const startMinutes = parseScheduleTimeMinutes(entry.time);
        if (startMinutes == null || startMinutes <= currentMinutes) return [];
        return [{ task, index, day: entry.day, startMinutes }];
      });
  });

  candidates.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return (a.task.order ?? a.index) - (b.task.order ?? b.index);
  });

  return candidates[0] || null;
}

export type ScheduleOverlapResult = {
  day: ScheduleDay;
  task: Task | null;
};

export type NextAvailableScheduleSlotResult = {
  day: ScheduleDay;
  days: ScheduleDay[];
  startMinutes: number;
};

const SCHEDULE_SUGGESTION_STEP_MINUTES = 5;

function snapScheduleSuggestionStartMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  return Math.ceil(safeMinutes / SCHEDULE_SUGGESTION_STEP_MINUTES) * SCHEDULE_SUGGESTION_STEP_MINUTES;
}

function getBusyScheduleIntervalsForDay(tasks: Task[], day: ScheduleDay, excludeTaskId: string) {
  const intervals: Array<{ startMinutes: number; endMinutes: number }> = [];
  for (const task of tasks) {
    const taskId = String(task.id || "").trim();
    if (excludeTaskId && taskId === excludeTaskId) continue;
    const taskDurationMinutes = getScheduleTaskDurationMinutes(task);
    if (!(taskDurationMinutes > 0)) continue;

    for (const taskEntry of getTaskScheduledDayEntries(task)) {
      if (taskEntry.day !== day) continue;
      const startMinutes = parseScheduleTimeMinutes(taskEntry.time);
      if (startMinutes == null) continue;
      const endMinutes = startMinutes + taskDurationMinutes;
      if (endMinutes > 24 * 60) continue;
      intervals.push({ startMinutes, endMinutes });
    }
  }
  return intervals.sort((a, b) => a.startMinutes - b.startMinutes);
}

function scheduleSlotFits(
  busyByDay: Map<ScheduleDay, Array<{ startMinutes: number; endMinutes: number }>>,
  days: ScheduleDay[],
  startMinutes: number,
  durationMinutes: number
) {
  const endMinutes = startMinutes + durationMinutes;
  if (endMinutes > 24 * 60) return false;
  return days.every((day) => {
    const intervals = busyByDay.get(day) || [];
    return intervals.every((interval) => startMinutes >= interval.endMinutes || endMinutes <= interval.startMinutes);
  });
}

function getFirstConflictingScheduleDay(tasks: Task[], candidate: Task, options?: { excludeTaskId?: string | null }) {
  const overlap = findScheduleOverlap(tasks, candidate, options);
  if (overlap) return overlap.day;
  const candidateDurationMinutes = getScheduleTaskDurationMinutes(candidate);
  if (!(candidateDurationMinutes > 0)) return null;
  for (const entry of getTaskScheduledDayEntries(candidate)) {
    const startMinutes = parseScheduleTimeMinutes(entry.time);
    if (startMinutes != null && startMinutes + candidateDurationMinutes > 24 * 60) return entry.day;
  }
  return null;
}

export function findNextAvailableScheduleSlot(
  tasks: Task[],
  candidate: Task,
  options?: { excludeTaskId?: string | null }
): NextAvailableScheduleSlotResult | null {
  const candidateDurationMinutes = getScheduleTaskDurationMinutes(candidate);
  if (!(candidateDurationMinutes > 0)) return null;

  const scheduledEntries = getTaskScheduledDayEntries(candidate)
    .map((entry) => ({ ...entry, startMinutes: parseScheduleTimeMinutes(entry.time) }))
    .filter((entry): entry is { day: ScheduleDay; time: string; startMinutes: number } => entry.startMinutes != null);
  if (scheduledEntries.length === 0) return null;

  const uniqueTimes = Array.from(new Set(scheduledEntries.map((entry) => entry.time)));
  const conflictingDay = getFirstConflictingScheduleDay(tasks, candidate, options);
  const suggestionEntries =
    scheduledEntries.length > 1 && uniqueTimes.length === 1
      ? scheduledEntries
      : scheduledEntries.filter((entry) => entry.day === conflictingDay);
  const effectiveEntries = suggestionEntries.length > 0 ? suggestionEntries : [scheduledEntries[0]!];
  const days = effectiveEntries.map((entry) => entry.day);
  const searchStartMinutes = snapScheduleSuggestionStartMinutes(Math.min(...effectiveEntries.map((entry) => entry.startMinutes)));
  const excludeTaskId = String(options?.excludeTaskId || "").trim();
  const busyByDay = new Map<ScheduleDay, Array<{ startMinutes: number; endMinutes: number }>>();
  days.forEach((day) => busyByDay.set(day, getBusyScheduleIntervalsForDay(tasks, day, excludeTaskId)));

  for (
    let startMinutes = searchStartMinutes;
    startMinutes + candidateDurationMinutes <= 24 * 60;
    startMinutes += SCHEDULE_SUGGESTION_STEP_MINUTES
  ) {
    if (scheduleSlotFits(busyByDay, days, startMinutes, candidateDurationMinutes)) {
      return { day: days[0]!, days, startMinutes };
    }
  }

  return null;
}

export function findScheduleOverlap(
  tasks: Task[],
  candidate: Task,
  options?: { excludeTaskId?: string | null }
): ScheduleOverlapResult | null {
  const candidateDurationMinutes = getScheduleTaskDurationMinutes(candidate);
  if (!(candidateDurationMinutes > 0)) return null;

  const excludeTaskId = String(options?.excludeTaskId || "").trim();
  const scheduledEntries = getTaskScheduledDayEntries(candidate);
  for (const candidateEntry of scheduledEntries) {
    const candidateStartMinutes = parseScheduleTimeMinutes(candidateEntry.time);
    if (candidateStartMinutes == null) continue;
    const candidateEndMinutes = candidateStartMinutes + candidateDurationMinutes;
    if (candidateEndMinutes > 24 * 60) return { day: candidateEntry.day, task: null };

    for (const task of tasks) {
      const taskId = String(task.id || "").trim();
      if (excludeTaskId && taskId === excludeTaskId) continue;
      const taskDurationMinutes = getScheduleTaskDurationMinutes(task);
      if (!(taskDurationMinutes > 0)) continue;

      for (const taskEntry of getTaskScheduledDayEntries(task)) {
        if (taskEntry.day !== candidateEntry.day) continue;
        const taskStartMinutes = parseScheduleTimeMinutes(taskEntry.time);
        if (taskStartMinutes == null) continue;
        const taskEndMinutes = taskStartMinutes + taskDurationMinutes;
        if (taskEndMinutes > 24 * 60) continue;
        if (candidateStartMinutes < taskEndMinutes && candidateEndMinutes > taskStartMinutes) {
          return { day: candidateEntry.day, task };
        }
      }
    }
  }

  return null;
}

export function getSchedulePlacementDays(task: Task, dropDay: ScheduleDay, sourceDay?: ScheduleDay | null): ScheduleDay[] {
  if (sourceDay) return [dropDay];
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
