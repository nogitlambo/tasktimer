import { describe, expect, it } from "vitest";
import {
  canNormalizeTaskSchedule,
  findNextAvailableScheduleSlot,
  findNextScheduledTaskAfterLocalTime,
  findScheduleOverlap,
  formatScheduleSlotSuggestion,
  getMovedScheduleDayValue,
  getSchedulePlacementDays,
  getScheduleTaskDurationMinutes,
  getTaskScheduledDayEntries,
  isRecurringDailyScheduleTask,
  isFlexibleUnscheduledTask,
  syncLegacyPlannedStartFields,
} from "./schedule-placement";
import type { Task } from "./types";

function createTask(overrides?: Partial<Task>): Task {
  return {
    id: "task-1",
    name: "Task",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestoneTimeUnit: "hour",
    milestones: [],
    hasStarted: false,
    taskType: "recurring",
    timeGoalEnabled: true,
    timeGoalPeriod: "day",
    timeGoalMinutes: 60,
    ...overrides,
  };
}

describe("schedule placement helpers", () => {
  it("preserves daily recurring placement across all days", () => {
    const task = createTask({ plannedStartDay: null, plannedStartTime: "09:00" });
    expect(isRecurringDailyScheduleTask(task)).toBe(true);
    expect(getSchedulePlacementDays(task, "thu")).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    expect(getMovedScheduleDayValue(task, "thu")).toBeNull();
  });

  it("treats dragged scheduled moves as single-day placements", () => {
    const task = createTask({ plannedStartDay: null, plannedStartTime: "09:00" });
    expect(getSchedulePlacementDays(task, "thu", "mon")).toEqual(["thu"]);
  });

  it("keeps single-day tasks on the dropped day", () => {
    const task = createTask({ plannedStartDay: "mon", plannedStartTime: "09:00" });
    expect(isRecurringDailyScheduleTask(task)).toBe(false);
    expect(getSchedulePlacementDays(task, "thu")).toEqual(["thu"]);
    expect(getMovedScheduleDayValue(task, "thu")).toBe("thu");
  });

  it("preserves legacy schedule fields when no per-day map exists yet", () => {
    const task = createTask({ plannedStartDay: "mon", plannedStartTime: "09:00" });

    syncLegacyPlannedStartFields(task);

    expect(task.plannedStartByDay).toEqual({ mon: "09:00" });
    expect(task.plannedStartDay).toBe("mon");
    expect(task.plannedStartTime).toBe("09:00");
  });

  it("normalizes mixed day maps back to safe legacy fields", () => {
    const task = createTask({
      plannedStartByDay: {
        mon: "09:00",
        wed: "11:00",
      },
    });

    expect(canNormalizeTaskSchedule(task)).toBe(true);
    syncLegacyPlannedStartFields(task);

    expect(task.plannedStartDay).toBeNull();
    expect(task.plannedStartTime).toBeNull();
  });

  it("treats flexible scheduled tasks as scheduled and draggable per day", () => {
    const task = createTask({
      plannedStartOpenEnded: true,
      plannedStartByDay: {
        mon: "09:00",
        tue: "11:00",
      },
    });

    expect(isFlexibleUnscheduledTask(task)).toBe(false);
    expect(getTaskScheduledDayEntries(task)).toEqual([
      { day: "mon", time: "09:00" },
      { day: "tue", time: "11:00" },
    ]);
    expect(getSchedulePlacementDays(task, "thu")).toEqual(["thu"]);
  });

  it("keeps brand-new flexible tasks unscheduled", () => {
    const task = createTask({
      plannedStartOpenEnded: true,
      plannedStartTime: null,
      plannedStartDay: null,
      plannedStartByDay: null,
    });

    expect(isFlexibleUnscheduledTask(task)).toBe(true);
    expect(getTaskScheduledDayEntries(task)).toEqual([]);
  });

  it("finds same-day partial overlaps", () => {
    const existing = createTask({
      id: "existing",
      name: "Existing",
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
    });
    const candidate = createTask({
      id: "candidate",
      plannedStartDay: "mon",
      plannedStartTime: "09:30",
    });

    expect(findScheduleOverlap([existing], candidate)).toEqual({ day: "mon", task: existing });
  });

  it("allows adjacent scheduled tasks", () => {
    const existing = createTask({
      id: "existing",
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      timeGoalMinutes: 60,
    });
    const candidate = createTask({
      id: "candidate",
      plannedStartDay: "mon",
      plannedStartTime: "10:00",
      timeGoalMinutes: 30,
    });

    expect(findScheduleOverlap([existing], candidate)).toBeNull();
  });

  it("blocks candidate schedules that would end after midnight", () => {
    const candidate = createTask({
      plannedStartDay: "mon",
      plannedStartTime: "23:30",
      timeGoalMinutes: 60,
    });

    expect(findScheduleOverlap([], candidate)).toEqual({ day: "mon", task: null });
  });

  it("excludes the edited task by id", () => {
    const source = createTask({
      id: "task-1",
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
    });
    const candidate = createTask({
      id: "task-1",
      plannedStartDay: "mon",
      plannedStartTime: "09:30",
    });

    expect(findScheduleOverlap([source], candidate, { excludeTaskId: "task-1" })).toBeNull();
  });

  it("checks legacy recurring-daily schedules against every day", () => {
    const existing = createTask({
      id: "existing",
      plannedStartDay: "wed",
      plannedStartTime: "09:30",
    });
    const candidate = createTask({
      id: "candidate",
      plannedStartDay: null,
      plannedStartTime: "09:00",
    });

    expect(findScheduleOverlap([existing], candidate)).toEqual({ day: "wed", task: existing });
  });

  it("ignores weekly recurring goals and unscheduled flexible tasks", () => {
    const weekly = createTask({
      id: "weekly",
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      timeGoalPeriod: "week",
      timeGoalMinutes: 120,
    });
    const flexible = createTask({
      id: "flexible",
      plannedStartOpenEnded: true,
      plannedStartDay: null,
      plannedStartTime: null,
      plannedStartByDay: null,
      timeGoalMinutes: 120,
    });
    const candidate = createTask({
      id: "candidate",
      plannedStartDay: "mon",
      plannedStartTime: "09:30",
    });

    expect(getScheduleTaskDurationMinutes(weekly)).toBe(0);
    expect(findScheduleOverlap([weekly, flexible], candidate)).toBeNull();
  });

  it("treats once-off tasks with positive time goal minutes as schedulable", () => {
    const onceOff = createTask({
      id: "once-off",
      taskType: "once-off",
      timeGoalPeriod: "week",
      timeGoalMinutes: 45,
      plannedStartDay: "fri",
      plannedStartTime: "13:00",
    });

    expect(getScheduleTaskDurationMinutes(onceOff)).toBe(45);
  });

  it("suggests the adjacent slot after an overlapping task", () => {
    const existing = createTask({
      id: "existing",
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      timeGoalMinutes: 60,
    });
    const candidate = createTask({
      id: "candidate",
      plannedStartDay: "mon",
      plannedStartTime: "09:30",
      timeGoalMinutes: 30,
    });

    const result = findNextAvailableScheduleSlot([existing], candidate);

    expect(result).toEqual({ day: "mon", days: ["mon"], startMinutes: 10 * 60 });
    expect(result ? formatScheduleSlotSuggestion(result) : "").toBe("Next available slot: 10:00 AM on Mon.");
  });

  it("skips multiple busy intervals until a large enough gap is found", () => {
    const candidate = createTask({
      id: "candidate",
      plannedStartDay: "mon",
      plannedStartTime: "09:30",
      timeGoalMinutes: 45,
    });

    const result = findNextAvailableScheduleSlot(
      [
        createTask({ id: "early", plannedStartDay: "mon", plannedStartTime: "09:00", timeGoalMinutes: 60 }),
        createTask({ id: "middle", plannedStartDay: "mon", plannedStartTime: "10:15", timeGoalMinutes: 30 }),
      ],
      candidate
    );

    expect(result).toEqual({ day: "mon", days: ["mon"], startMinutes: 10 * 60 + 45 });
  });

  it("returns no suggestion when the task cannot fit before midnight", () => {
    const candidate = createTask({
      id: "candidate",
      plannedStartDay: "mon",
      plannedStartTime: "23:30",
      timeGoalMinutes: 60,
    });

    expect(findNextAvailableScheduleSlot([], candidate)).toBeNull();
  });

  it("excludes the edited task when suggesting a slot", () => {
    const source = createTask({
      id: "task-1",
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
      timeGoalMinutes: 60,
    });
    const blocker = createTask({
      id: "blocker",
      plannedStartDay: "mon",
      plannedStartTime: "10:00",
      timeGoalMinutes: 60,
    });
    const candidate = createTask({
      id: "task-1",
      plannedStartDay: "mon",
      plannedStartTime: "10:30",
      timeGoalMinutes: 30,
    });

    expect(findNextAvailableScheduleSlot([source, blocker], candidate, { excludeTaskId: "task-1" })).toEqual({
      day: "mon",
      days: ["mon"],
      startMinutes: 11 * 60,
    });
  });

  it("suggests a time that fits all same-time recurring scheduled days", () => {
    const candidate = createTask({
      id: "candidate",
      plannedStartByDay: {
        mon: "09:30",
        tue: "09:30",
      },
      timeGoalMinutes: 30,
    });

    const result = findNextAvailableScheduleSlot(
      [
        createTask({ id: "mon-blocker", plannedStartDay: "mon", plannedStartTime: "09:00", timeGoalMinutes: 60 }),
        createTask({ id: "tue-blocker", plannedStartDay: "tue", plannedStartTime: "10:00", timeGoalMinutes: 30 }),
      ],
      candidate
    );

    expect(result).toEqual({ day: "mon", days: ["mon", "tue"], startMinutes: 10 * 60 + 30 });
    expect(result ? formatScheduleSlotSuggestion(result) : "").toBe("Next available slot: 10:30 AM on Mon, Tue.");
  });

  it("suggests for the first conflicting day on mixed per-day schedules", () => {
    const candidate = createTask({
      id: "candidate",
      plannedStartByDay: {
        mon: "09:30",
        tue: "13:00",
      },
      timeGoalMinutes: 30,
    });

    const result = findNextAvailableScheduleSlot(
      [createTask({ id: "blocker", plannedStartDay: "mon", plannedStartTime: "09:00", timeGoalMinutes: 60 })],
      candidate
    );

    expect(result).toEqual({ day: "mon", days: ["mon"], startMinutes: 10 * 60 });
  });

  it("finds the next scheduled task later today", () => {
    const current = createTask({
      id: "current",
      order: 0,
      plannedStartDay: "mon",
      plannedStartTime: "09:00",
    });
    const later = createTask({
      id: "later",
      name: "Later",
      order: 2,
      plannedStartDay: "mon",
      plannedStartTime: "10:15",
    });
    const latest = createTask({
      id: "latest",
      name: "Latest",
      order: 1,
      plannedStartDay: "mon",
      plannedStartTime: "11:00",
    });

    const result = findNextScheduledTaskAfterLocalTime([current, latest, later], {
      excludeTaskId: "current",
      nowDate: new Date(2026, 4, 4, 10, 0),
    });

    expect(result?.task.id).toBe("later");
    expect(result?.startMinutes).toBe(10 * 60 + 15);
  });

  it("hides past, running, excluded, and non-today scheduled tasks from next-task lookup", () => {
    const result = findNextScheduledTaskAfterLocalTime(
      [
        createTask({ id: "excluded", plannedStartDay: "mon", plannedStartTime: "10:30" }),
        createTask({ id: "past", plannedStartDay: "mon", plannedStartTime: "09:45" }),
        createTask({ id: "running", running: true, plannedStartDay: "mon", plannedStartTime: "10:45" }),
        createTask({ id: "tomorrow", plannedStartDay: "tue", plannedStartTime: "10:15" }),
      ],
      {
        excludeTaskId: "excluded",
        nowDate: new Date(2026, 4, 4, 10, 0),
      }
    );

    expect(result).toBeNull();
  });

  it("breaks next-task lookup ties by task order", () => {
    const lowerOrder = createTask({
      id: "lower-order",
      order: 1,
      plannedStartDay: "mon",
      plannedStartTime: "10:30",
    });
    const higherOrder = createTask({
      id: "higher-order",
      order: 2,
      plannedStartDay: "mon",
      plannedStartTime: "10:30",
    });

    const result = findNextScheduledTaskAfterLocalTime([higherOrder, lowerOrder], {
      nowDate: new Date(2026, 4, 4, 10, 0),
    });

    expect(result?.task.id).toBe("lower-order");
  });
});
