import { describe, expect, it } from "vitest";

import { parseScheduleRepairResponse } from "./dashboard-schedule-repair";

describe("Schedule Repair dashboard parser", () => {
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
