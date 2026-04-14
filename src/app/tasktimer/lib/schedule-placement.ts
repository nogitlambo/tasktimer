import type { Task } from "./types";

const SCHEDULE_DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type ScheduleDay = (typeof SCHEDULE_DAY_ORDER)[number];

export function isRecurringDailyScheduleTask(task: Task): boolean {
  const plannedDay = String(task?.plannedStartDay || "").trim().toLowerCase();
  return !plannedDay;
}

export function getSchedulePlacementDays(task: Task, dropDay: ScheduleDay): ScheduleDay[] {
  const plannedDay = String(task?.plannedStartDay || "").trim().toLowerCase();
  if (plannedDay === "mon" || plannedDay === "tue" || plannedDay === "wed" || plannedDay === "thu" || plannedDay === "fri" || plannedDay === "sat" || plannedDay === "sun") {
    return [dropDay];
  }
  return [...SCHEDULE_DAY_ORDER];
}

export function getMovedScheduleDayValue(task: Task, dropDay: ScheduleDay): Task["plannedStartDay"] {
  return getSchedulePlacementDays(task, dropDay).length === 1 ? dropDay : null;
}
