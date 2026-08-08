import { describe, expect, it } from "vitest";

import { parseRecoveryResponse } from "./dashboard-recovery";

const action = {
  id: "defer:task-1",
  type: "DEFER_TO_LATER_DAY",
  taskId: "task-1",
  taskVersion: "v1",
  toDate: "2026-08-10",
  reasonCodes: ["SAFE_TO_DEFER"],
  selected: false,
  status: "PROPOSED",
  classification: "FLEXIBLE",
};

describe("parseRecoveryResponse", () => {
  it("accepts a server-owned session and preserves safe action selection state", () => {
    const parsed = parseRecoveryResponse({
      ok: true,
      session: {
        id: "recovery-1",
        status: "ACTIVE",
        backlogCount: 8,
        overdueCount: 2,
        urgentCount: 3,
        flexibleCount: 4,
        staleCount: 1,
        remainingCapacity: { min: 15, max: 30 },
        restartTaskId: "task-1",
        actions: [action],
      },
    });

    expect(parsed).toMatchObject({ kind: "session", session: { id: "recovery-1", restartTaskId: "task-1", actions: [{ taskId: "task-1", selected: false }] } });
  });

  it("recognises an explicit no-recovery response", () => {
    expect(parseRecoveryResponse({ ok: true, empty: true, session: null })).toEqual({ kind: "empty" });
  });

  it("rejects malformed or non-active sessions", () => {
    expect(parseRecoveryResponse({ ok: true, session: { id: "recovery-1", status: "COMPLETED", actions: [action] } })).toEqual({ kind: "invalid" });
  });
});
