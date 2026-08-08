import { describe, expect, it } from "vitest";

import { generateScheduleRepairCandidates } from "./scheduleRepairCandidates";
import type { ScheduleRepairCapacity, ScheduleRepairTask } from "./scheduleRepairContract";

const capacity: ScheduleRepairCapacity = {
  remainingRange: { min: 45, max: 60 },
  state: "STANDARD",
  confidence: "HIGH",
  primarySource: "WEEKDAY_HISTORY",
  manualOverride: null,
  source: "ADAPTIVE_CAPACITY",
};

function task(id: string, overrides: Partial<ScheduleRepairTask> = {}): ScheduleRepairTask {
  return {
    id,
    taskVersion: `${id}-v1`,
    estimatedMinutes: 30,
    completedMinutes: 0,
    plannedDate: "2026-08-08",
    active: true,
    completed: false,
    editable: true,
    ownerUid: "user-1",
    flexible: true,
    ...overrides,
  };
}

const futureDays = [
  { date: "2026-08-09", plannedMinutes: 50, capacityMax: 60 },
  { date: "2026-08-10", plannedMinutes: 10, capacityMax: 60 },
];

describe("Schedule Repair candidate generation", () => {
  it("does nothing for a realistic plan", () => {
    const result = generateScheduleRepairCandidates({ localDate: "2026-08-08", tasks: [task("small", { estimatedMinutes: 20 })], remainingCapacity: capacity, futureDays });
    expect(result.evaluation.outcome).toBe("NO_REPAIR_NEEDED");
    expect(result.actions).toEqual([]);
  });

  it("moves the minimum flexible work and skips an overloaded tomorrow", () => {
    const result = generateScheduleRepairCandidates({
      localDate: "2026-08-08",
      tasks: [task("flexible", { estimatedMinutes: 40, priority: "low" }), task("protected", { estimatedMinutes: 60, hardDeadline: true, dueDate: "2026-08-08", flexible: false })],
      remainingCapacity: capacity,
      futureDays,
    });
    expect(result.evaluation.planHealthBefore).toBe("SIGNIFICANTLY_OVERLOADED");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({ type: "MOVE_TO_LATER_DAY", taskId: "flexible", toDate: "2026-08-10" });
    expect(result.estimatedPlannedMinutesAfter).toBe(60);
    expect(result.actions[0]?.reasonCodes).toEqual(expect.arrayContaining(["TASK_FLEXIBLE", "TARGET_DAY_HAS_ROOM"]));
  });

  it("does not move unknown or protected work and returns no safe solution", () => {
    const result = generateScheduleRepairCandidates({
      localDate: "2026-08-08",
      tasks: [task("unknown", { estimatedMinutes: null }), task("pinned", { estimatedMinutes: 80, pinned: true, flexible: false })],
      remainingCapacity: capacity,
      futureDays,
    });
    expect(result.evaluation.outcome).toBe("NO_SAFE_SOLUTION");
    expect(result.actions).toEqual([]);
    expect(result.evaluation.reasonCodes).toContain("NO_SAFE_MOVE_AVAILABLE");
  });

  it("uses REMOVE_FROM_TODAY only for flexible work without a safe target day", () => {
    const result = generateScheduleRepairCandidates({
      localDate: "2026-08-08",
      tasks: [task("flexible", { estimatedMinutes: 80, priority: "low" })],
      remainingCapacity: capacity,
      futureDays: [{ date: "2026-08-09", plannedMinutes: 60, capacityMax: 60 }],
    });
    expect(result.actions).toMatchObject([{ type: "REMOVE_FROM_TODAY", taskId: "flexible", toDate: null }]);
  });

  it("is deterministic for identical inputs", () => {
    const input = { localDate: "2026-08-08", tasks: [task("a", { estimatedMinutes: 50 }), task("b", { estimatedMinutes: 40, priority: "low" })], remainingCapacity: capacity, futureDays };
    expect(generateScheduleRepairCandidates(input)).toEqual(generateScheduleRepairCandidates(input));
  });
});
