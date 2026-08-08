import { describe, expect, it } from "vitest";

import { generateScheduleRepairSpecialActions } from "./scheduleRepairSpecialActions";
import type { ScheduleRepairCapacity, ScheduleRepairTask } from "./scheduleRepairContract";

const capacity: ScheduleRepairCapacity = {
  remainingRange: { min: 20, max: 30 }, state: "STANDARD", confidence: "HIGH", primarySource: "DEFAULT", manualOverride: null, source: "ADAPTIVE_CAPACITY",
};

function task(id: string, overrides: Partial<ScheduleRepairTask> = {}): ScheduleRepairTask {
  return { id, taskVersion: `${id}-v1`, estimatedMinutes: 60, completedMinutes: 0, plannedDate: "2026-08-08", active: true, completed: false, editable: true, ownerUid: "user-1", ...overrides };
}

describe("Schedule Repair supplemental actions", () => {
  it("proposes a smaller today-only target without changing task scope", () => {
    const input = { localDate: "2026-08-08", tasks: [task("partial", { partialProgressUseful: true, flexible: true })], remainingCapacity: capacity, futureDays: [] };
    const before = JSON.parse(JSON.stringify(input.tasks));
    const actions = generateScheduleRepairSpecialActions(input);
    expect(actions).toMatchObject([{ type: "REDUCE_TODAY_TARGET", taskId: "partial", fromMinutes: 60, toMinutes: 30 }]);
    expect(input.tasks).toEqual(before);
  });

  it("proposes deadline review when a protected task has no safe target", () => {
    const actions = generateScheduleRepairSpecialActions({ localDate: "2026-08-08", tasks: [task("deadline", { hardDeadline: true, dueDate: "2026-08-08", flexible: false })], remainingCapacity: capacity, futureDays: [] });
    expect(actions).toMatchObject([{ type: "REVIEW_DEADLINE", taskId: "deadline" }]);
    expect(actions[0]?.reasonCodes).toEqual(["HARD_DEADLINE_PROTECTED", "NO_SAFE_MOVE_AVAILABLE"]);
  });

  it("proposes clarification through a structured action for oversized required work", () => {
    const actions = generateScheduleRepairSpecialActions({ localDate: "2026-08-08", tasks: [task("clarify", { requiresClarification: true })], remainingCapacity: capacity, futureDays: [] });
    expect(actions).toMatchObject([{ type: "CLARIFY_TASK", taskId: "clarify", fromMinutes: 60, toMinutes: null }]);
  });
});
