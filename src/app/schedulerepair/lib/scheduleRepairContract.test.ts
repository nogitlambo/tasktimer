import { describe, expect, it } from "vitest";

import {
  ScheduleRepairActionSchema,
  ScheduleRepairEvaluationResultSchema,
  ScheduleRepairProposalSchema,
} from "./scheduleRepairContract";

describe("Schedule Repair contract", () => {
  it("parses the public action and evaluation shapes", () => {
    expect(ScheduleRepairActionSchema.parse({
      id: "action-1",
      type: "MOVE_TO_LATER_DAY",
      taskId: "task-1",
      taskVersion: "v1",
      fromDate: "2026-08-08",
      toDate: "2026-08-10",
      fromMinutes: 30,
      toMinutes: null,
      reasonCodes: ["TASK_FLEXIBLE", "TARGET_DAY_HAS_ROOM"],
      selected: true,
      status: "PROPOSED",
    })).toMatchObject({ type: "MOVE_TO_LATER_DAY", selected: true });

    expect(() => ScheduleRepairEvaluationResultSchema.parse({
      schemaVersion: 1,
      planVersion: "schedule-repair-v1",
      localDate: "2026-08-08",
      outcome: "REPAIR_REQUIRED",
      planHealthBefore: "SLIGHTLY_OVERLOADED",
      remainingPlannedMinutesBefore: 90,
      remainingCapacity: {
        remainingRange: { min: 45, max: 60 },
        state: "STANDARD",
        confidence: "MEDIUM",
        primarySource: "DEFAULT",
        manualOverride: null,
        source: "PRODUCT_DEFAULT",
      },
      triggerCodes: ["PLAN_OVERLOADED"],
      reasonCodes: ["TODAY_OVERLOADED"],
    })).not.toThrow();
  });

  it("keeps action minute fields structured and rejects invalid proposal ranges", () => {
    expect(() => ScheduleRepairActionSchema.parse({
      id: "action-1", type: "KEEP_TODAY", taskId: "task-1", taskVersion: "v1", reasonCodes: [], selected: true, status: "PROPOSED",
      fromMinutes: 60, toMinutes: 30,
    })).not.toThrow();
    expect(() => ScheduleRepairProposalSchema.parse({
      schemaVersion: 1, id: "repair-1", userId: "user-1", localDate: "2026-08-08", planHealthBefore: "SLIGHTLY_OVERLOADED",
      remainingPlannedMinutesBefore: 90, remainingCapacity: { min: 60, max: 30 }, estimatedPlannedMinutesAfter: 60,
      actions: [], sourceTaskVersionHash: "a".repeat(64), status: "ACTIVE", createdAt: "2026-08-08T00:00:00.000Z", expiresAt: "2026-08-08T00:15:00.000Z",
    })).toThrow();
  });
});
