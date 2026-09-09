import { describe, expect, it } from "vitest";

import type { Task } from "./types";
import { isTaskPlannedActivationEligible } from "./schedule-placement";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Task",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    ...overrides,
  } as Task;
}

describe("planned task activation", () => {
  it("excludes tasks with a future planned start date", () => {
    expect(
      isTaskPlannedActivationEligible(task({ plannedStartDate: "2026-08-08" }), {
        localDate: "2026-08-07",
        localTime: "23:59",
      })
    ).toBe(false);
  });

  it("excludes tasks before their planned start time on the same date", () => {
    expect(
      isTaskPlannedActivationEligible(task({ plannedStartDate: "2026-08-07", plannedStartTime: "10:30" }), {
        localDate: "2026-08-07",
        localTime: "10:29",
      })
    ).toBe(false);
  });

  it("allows tasks when their planned start time has been reached or passed", () => {
    const scheduledTask = task({ plannedStartDate: "2026-08-07", plannedStartTime: "10:30" });

    expect(
      isTaskPlannedActivationEligible(scheduledTask, {
        localDate: "2026-08-07",
        localTime: "10:30",
      })
    ).toBe(true);
    expect(
      isTaskPlannedActivationEligible(scheduledTask, {
        localDate: "2026-08-07",
        localTime: "10:31",
      })
    ).toBe(true);
  });

  it("allows date-only planned starts at local midnight on the planned date", () => {
    const dateOnlyTask = task({ plannedStartDate: "2026-08-07" });

    expect(
      isTaskPlannedActivationEligible(dateOnlyTask, {
        localDate: "2026-08-06",
        localTime: "23:59",
      })
    ).toBe(false);
    expect(
      isTaskPlannedActivationEligible(dateOnlyTask, {
        localDate: "2026-08-07",
        localTime: "00:00",
      })
    ).toBe(true);
  });

  it("keeps tasks without a valid planned date eligible for legacy compatibility", () => {
    expect(
      isTaskPlannedActivationEligible(task(), {
        localDate: "2026-08-07",
        localTime: "09:00",
      })
    ).toBe(true);
    expect(
      isTaskPlannedActivationEligible(task({ plannedStartDate: "not-a-date", plannedStartTime: "10:30" }), {
        localDate: "2026-08-07",
        localTime: "09:00",
      })
    ).toBe(true);
  });
});
