import { describe, expect, it } from "vitest";

import { buildScheduleRepairFutureDays, mapScheduleRepairFirestoreTask } from "./scheduleRepairRepository";

describe("Schedule Repair repository source mapping", () => {
  it("maps only structured scheduling metadata and derives a stable task version", () => {
    const task = mapScheduleRepairFirestoreTask("task-1", {
      id: "task-1",
      name: "Private task title must not escape",
      notes: "Private notes",
      timeGoalMinutes: 45,
      onceOffTargetDate: "2026-08-09",
      priority: "low",
      plannedStartOpenEnded: true,
      completed: false,
    }, "uid-1", "2026-08-08");

    expect(task).toMatchObject({ id: "task-1", estimatedMinutes: 45, plannedDate: "2026-08-09", ownerUid: "uid-1", editable: true });
    expect(task).not.toHaveProperty("name");
    expect(task).not.toHaveProperty("notes");
    expect(task.taskVersion).toMatch(/^[a-f0-9]{64}$/);
  });

  it("calculates recurring future load only from scheduled dates", () => {
    const task = mapScheduleRepairFirestoreTask("task-1", {
      id: "task-1", timeGoalMinutes: 30, taskType: "recurring", plannedStartByDay: { mon: "09:00", wed: "09:00" }, plannedStartOpenEnded: false,
    }, "uid-1", "2026-08-08");
    const days = buildScheduleRepairFutureDays([task], "2026-08-08", 60);
    expect(days.find((day) => day.date === "2026-08-10")?.plannedMinutes).toBe(30);
    expect(days.find((day) => day.date === "2026-08-09")?.plannedMinutes).toBe(0);
  });
});
