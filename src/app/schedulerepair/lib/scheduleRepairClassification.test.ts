import { describe, expect, it } from "vitest";

import { classifyScheduleRepairTask, classifyScheduleRepairTasks, validateScheduleRepairTargetDay } from "./scheduleRepairClassification";
import type { ScheduleRepairTask } from "./scheduleRepairContract";

function task(overrides: Partial<ScheduleRepairTask> = {}): ScheduleRepairTask {
  return {
    id: "task-1",
    estimatedMinutes: 30,
    completedMinutes: 0,
    active: true,
    completed: false,
    editable: true,
    ownerUid: "user-1",
    ...overrides,
  };
}

describe("Schedule Repair task classification", () => {
  it("protects fixed tasks and marks them immovable by default", () => {
    expect(classifyScheduleRepairTask(task({ hardDeadline: true, dueDate: "2026-08-08" }), "2026-08-08")).toMatchObject({ classification: "FIXED", movableByDefault: false });
    expect(classifyScheduleRepairTask(task({ pinned: true, plannedDate: "2026-08-08" }), "2026-08-08")).toMatchObject({ classification: "FIXED", movableByDefault: false });
    expect(classifyScheduleRepairTask(task({ inProgress: true, plannedDate: "2026-08-08" }), "2026-08-08")).toMatchObject({ classification: "FIXED", movableByDefault: false });
  });

  it("distinguishes limited, flexible, and unknown work", () => {
    expect(classifyScheduleRepairTask(task({ priority: "high" }), "2026-08-08").classification).toBe("LIMITED");
    expect(classifyScheduleRepairTask(task({ flexible: true, priority: "low" }), "2026-08-08").classification).toBe("FLEXIBLE");
    expect(classifyScheduleRepairTask(task({ estimatedMinutes: null, flexible: true }), "2026-08-08").classification).toBe("UNKNOWN");
    expect(classifyScheduleRepairTask(task({ editable: false, flexible: true }), "2026-08-08").classification).toBe("UNKNOWN");
    expect(classifyScheduleRepairTasks([task({ id: "a" }), task({ id: "b", flexible: true })], "2026-08-08")).toHaveLength(2);
  });

  it("enforces ownership, deadline, pinned, recurrence, unavailable-day, and horizon constraints", () => {
    const base = task({ hardDeadline: true, dueDate: "2026-08-10", pinned: true, plannedDate: "2026-08-08", recurrenceLocked: true, allowedTargetDates: ["2026-08-08", "2026-08-10"] });
    expect(validateScheduleRepairTargetDay({ task: base, requestingUid: "other-user", localDate: "2026-08-08", targetDate: "2026-08-20", unavailableDates: ["2026-08-20"] })).toEqual({
      allowed: false,
      violations: ["TASK_NOT_OWNED", "HARD_DEADLINE", "TASK_PINNED", "RECURRENCE_RULE", "SCHEDULE_EXCLUSION", "UNAVAILABLE_DAY", "SCHEDULE_HORIZON"],
    });
    expect(validateScheduleRepairTargetDay({ task: task({ flexible: true, plannedDate: "2026-08-08" }), requestingUid: "user-1", localDate: "2026-08-08", targetDate: "2026-08-10" })).toEqual({ allowed: true, violations: [] });
  });
});
