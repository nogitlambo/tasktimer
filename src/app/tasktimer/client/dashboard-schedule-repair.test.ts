import { describe, expect, it } from "vitest";

import {
  formatScheduleRepairActionLabel,
  formatScheduleRepairActionSubtext,
  getScheduleRepairToolHelperText,
  parseScheduleRepairResponse,
} from "./dashboard-schedule-repair";

describe("Schedule Repair dashboard parser", () => {
  it("uses the task name, not its internal ID, in suggested repair labels", () => {
    expect(formatScheduleRepairActionLabel({ type: "MOVE_TO_LATER_DAY", taskId: "adba73d3377594cf", toDate: "2026-08-08" }, "Prepare quarterly report")).toBe(
      "Move Prepare quarterly report to 2026-08-08"
    );
  });

  it("separates the repair action and reason into suggestion subtext", () => {
    expect(formatScheduleRepairActionSubtext({ type: "MOVE_TO_LATER_DAY", taskId: "task-1", toDate: "2026-08-08", reasonCodes: ["TASK_FLEXIBLE", "TARGET_DAY_HAS_ROOM"] })).toBe(
      "Move it to 2026-08-08. The task is flexible. The target day has enough room."
    );
  });

  it("turns removal reasons into a clear explanation", () => {
    expect(formatScheduleRepairActionSubtext({ type: "REMOVE_FROM_TODAY", taskId: "task-1", reasonCodes: ["TASK_FLEXIBLE", "TASK_NO_NEAR_DEADLINE", "TARGET_DAY_OVERLOADED"] })).toBe(
      "Remove it from today's schedule. The task is flexible and not due soon. No suitable later day has enough room."
    );
  });

  it("explains when repair suggestions are unavailable because of rate limiting", () => {
    expect(getScheduleRepairToolHelperText("error", "Please wait before generating another schedule repair.")).toBe(
      "Repair suggestions are temporarily unavailable. Please wait a minute and try again."
    );
  });

  it("accepts review-safe proposal facts and action edits", () => {
    const parsed = parseScheduleRepairResponse({
      ok: true,
      proposal: {
        id: "repair-1",
        localDate: "2026-08-07",
        planHealthBefore: "SIGNIFICANTLY_OVERLOADED",
        remainingPlannedMinutesBefore: 180,
        estimatedPlannedMinutesAfter: 120,
        remainingCapacity: { min: 45, max: 60 },
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        actions: [{
          id: "action-1",
          type: "MOVE_TO_LATER_DAY",
          taskId: "task-1",
          taskVersion: "version-1",
          fromDate: "2026-08-07",
          toDate: "2026-08-08",
          reasonCodes: ["TASK_FLEXIBLE", "TARGET_DAY_HAS_ROOM"],
          selected: true,
          status: "PROPOSED",
        }],
      },
    });

    expect(parsed.kind).toBe("proposal");
    if (parsed.kind === "proposal") {
      expect(parsed.proposal.actions[0]).toMatchObject({ taskId: "task-1", toDate: "2026-08-08", selected: true });
    }
  });

  it("rejects expired or incomplete proposals", () => {
    expect(parseScheduleRepairResponse({ ok: true, proposal: { id: "repair-1", expiresAt: "2020-01-01T00:00:00.000Z" } })).toEqual({ kind: "none" });
  });
});
