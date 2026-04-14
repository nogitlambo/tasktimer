import { describe, expect, it } from "vitest";
import { getMovedScheduleDayValue, getSchedulePlacementDays, isRecurringDailyScheduleTask } from "./schedule-placement";
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

  it("keeps single-day tasks on the dropped day", () => {
    const task = createTask({ plannedStartDay: "mon", plannedStartTime: "09:00" });
    expect(isRecurringDailyScheduleTask(task)).toBe(false);
    expect(getSchedulePlacementDays(task, "thu")).toEqual(["thu"]);
    expect(getMovedScheduleDayValue(task, "thu")).toBe("thu");
  });
});
