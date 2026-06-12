import { describe, expect, it, vi } from "vitest";

import {
  applyHistoryReplaceModeToSyncPlan,
  buildScheduledTimeGoalPushPlan,
  buildCanonicalHistoryEntryDocId,
  buildIdentitySyncResponseError,
  isLargeImplicitHistoryDelete,
  normalizeUserPreferencesDocument,
  planHistorySyncOperations,
} from "./cloudStore";
import type { Task } from "./types";

describe("buildIdentitySyncResponseError", () => {
  it("preserves reportable identity sync response fields", async () => {
    const error = await buildIdentitySyncResponseError(
      new Response(
        JSON.stringify({
          error: "Could not sync account identity.",
          code: "internal",
          logId: "acct-sync-ABC123",
        }),
        { status: 500 }
      )
    );

    expect(error.message).toBe("Could not sync account identity. (status 500)");
    expect(error.code).toBe("internal");
    expect(error.status).toBe(500);
    expect(error.logId).toBe("acct-sync-ABC123");
  });

  it("does not use HTML error documents as the identity sync error message", async () => {
    const error = await buildIdentitySyncResponseError(
      new Response("<!DOCTYPE html><html><body><h1>Page Not Found</h1></body></html>", {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );

    expect(error.message).toBe("Could not reach account identity sync endpoint. (status 404)");
    expect(error.status).toBe(404);
  });
});

describe("normalizeUserPreferencesDocument", () => {
  it("preserves the stored week start preference from cloud documents", () => {
    expect(
      normalizeUserPreferencesDocument({
        weekStarting: "sun",
        updatedAtMs: 123,
      }).weekStarting
    ).toBe("sun");
  });

  it("falls back to Monday for invalid cloud week start values", () => {
    expect(
      normalizeUserPreferencesDocument({
        weekStarting: "funday",
      }).weekStarting
    ).toBe("mon");
  });
});

describe("isLargeImplicitHistoryDelete", () => {
  it("flags large accidental history shrinks", () => {
    expect(isLargeImplicitHistoryDelete(100, 70)).toBe(true);
    expect(isLargeImplicitHistoryDelete(8, 2)).toBe(true);
  });

  it("allows small edits and additions", () => {
    expect(isLargeImplicitHistoryDelete(100, 96)).toBe(false);
    expect(isLargeImplicitHistoryDelete(5, 0)).toBe(false);
    expect(isLargeImplicitHistoryDelete(10, 12)).toBe(false);
  });
});

describe("planHistorySyncOperations", () => {
  it("skips unchanged history rows", () => {
    expect(
      planHistorySyncOperations(
        {
          row1: { taskId: "task-1", ts: 100, ms: 200, name: "Focus", createdAt: {} },
        },
        {
          row1: { taskId: "task-1", ts: 100, ms: 200, name: "Focus" },
        }
      )
    ).toEqual({ upsertIds: [], deleteIds: [] });
  });

  it("upserts changed or new rows and deletes missing rows", () => {
    expect(
      planHistorySyncOperations(
        {
          row1: { taskId: "task-1", ts: 100, ms: 200, name: "Focus" },
          row2: { taskId: "task-1", ts: 300, ms: 400, name: "Old" },
        },
        {
          row1: { taskId: "task-1", ts: 100, ms: 250, name: "Focus" },
          row3: { taskId: "task-1", ts: 500, ms: 600, name: "New" },
        }
      )
    ).toEqual({ upsertIds: ["row1", "row3"], deleteIds: ["row2"] });
  });

  it("suppresses deletes unless the caller explicitly allows destructive replacement", () => {
    const plan = { upsertIds: ["row3"], deleteIds: ["row2"] };

    expect(applyHistoryReplaceModeToSyncPlan(plan)).toEqual({ upsertIds: ["row3"], deleteIds: [] });
    expect(applyHistoryReplaceModeToSyncPlan(plan, { allowDestructiveReplace: true })).toEqual(plan);
  });
});

describe("buildCanonicalHistoryEntryDocId", () => {
  it("keeps note edits on the same canonical row", () => {
    const base = buildCanonicalHistoryEntryDocId("task-1", { ts: 100, ms: 200, name: "Focus" });
    const edited = buildCanonicalHistoryEntryDocId("task-1", { ts: 100, ms: 200, name: "Focus", note: "done" });

    expect(edited).toBe(base);
  });

  it("keys completed live sessions by session id", () => {
    const first = buildCanonicalHistoryEntryDocId("task-1", { ts: 100, ms: 200, name: "Focus", sessionId: "session-1" });
    const retried = buildCanonicalHistoryEntryDocId("task-1", { ts: 300, ms: 400, name: "Renamed", sessionId: "session-1" });

    expect(retried).toBe(first);
  });
});

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Task 1",
    order: 1,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    plannedStartPushRemindersEnabled: true,
    ...overrides,
  };
}

describe("buildScheduledTimeGoalPushPlan", () => {
  it("uses planned start as the source of truth when a scheduled task is also running toward a time goal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 8, 0, 0));

    try {
      const plannedStartAtMs = new Date(2026, 5, 1, 9, 0, 0).getTime();
      const lateTimeGoalAtMs = new Date(2026, 5, 1, 22, 0, 0).getTime();

      const plan = buildScheduledTimeGoalPushPlan(
        task({
          running: true,
          startMs: new Date(2026, 5, 1, 8, 0, 0).getTime(),
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 14 * 60,
          plannedStartDay: "mon",
          plannedStartTime: "09:00",
          plannedStartByDay: { mon: "09:00" },
        })
      );

      expect(plan.plannedStartDueAtMs).toBe(plannedStartAtMs);
      expect(plan.timeGoalCompleteDueAtMs).toBe(lateTimeGoalAtMs);
      expect(plan.dueAtMs).toBe(plannedStartAtMs);
      expect(plan.notificationKind).toBe("plannedStart");
      expect(plan.eventType).toBe("plannedStartReminder");
    } finally {
      vi.useRealTimers();
    }
  });

  it("schedules weekly completion from current-week history plus the running session", () => {
    const startMs = new Date(2026, 4, 29, 9, 0, 0).getTime();
    const nowMs = startMs;
    const plan = buildScheduledTimeGoalPushPlan(
      task({
        running: true,
        startMs,
        accumulatedMs: 10 * 60_000,
        timeGoalEnabled: true,
        timeGoalPeriod: "week",
        timeGoalMinutes: 60,
      }),
      nowMs,
      {
        weekStarting: "mon",
        historyByTaskId: {
          "task-1": [{ ts: new Date(2026, 4, 26, 9, 0, 0).getTime(), name: "Task 1", ms: 20 * 60_000 }],
        },
      }
    );

    expect(plan.timeGoalCompleteDueAtMs).toBe(startMs + 30 * 60_000);
    expect(plan.notificationKind).toBe("timeGoalComplete");
    expect(plan.timeGoalPeriod).toBe("week");
    expect(plan.timeGoalGoalMs).toBe(60 * 60_000);
    expect(plan.timeGoalCompletionWeekKey).toBe("2026-05-25");
  });
});
