import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  batchSet: vi.fn(),
  batchDelete: vi.fn(),
  batchCommit: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  getFirebaseAdminDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            set: mocks.set,
            collection: () => ({ limit: () => ({ get: vi.fn() }) }),
          }),
          get: vi.fn(async () => ({ docs: [] })),
        }),
      }),
    }),
    batch: () => ({
      set: mocks.batchSet,
      delete: mocks.batchDelete,
      commit: mocks.batchCommit,
    }),
  }),
}));

import type { Task } from "@/app/tasktimer/lib/types";
import { createFirestoreBrainDumpWorkspaceRepository } from "./brainDumpWorkspaceStore";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "brain-dump-task-1",
    name: "Call dentist",
    taskType: "recurring",
    onceOffDay: null,
    onceOffTargetDate: null,
    createdAtMs: 1_800_000_000_000,
    order: 1,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestoneTimeUnit: "hour",
    milestones: [],
    hasStarted: false,
    plannedStartPushRemindersEnabled: false,
    ...overrides,
  };
}

describe("createFirestoreBrainDumpWorkspaceRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batchCommit.mockResolvedValue(undefined);
    mocks.set.mockResolvedValue(undefined);
  });

  it("saves Brain Dump-created tasks as canonical Firestore task rows", async () => {
    const repository = createFirestoreBrainDumpWorkspaceRepository();

    expect(repository.saveTask).toBeDefined();
    await repository.saveTask?.("uid-1", task({ timeGoalEnabled: true, timeGoalValue: 45, timeGoalUnit: "minute", timeGoalPeriod: "day" }));

    const [taskRef, row, options] = mocks.batchSet.mock.calls[0] as [{ path?: string }, Record<string, unknown>, { merge: boolean }];
    void taskRef;
    expect(options).toEqual({ merge: true });
    expect(row).toMatchObject({
      id: "brain-dump-task-1",
      name: "Call dentist",
      checkpointsEnabled: false,
      checkpointTimeUnit: "hour",
      checkpoints: [],
      timeGoalEnabled: true,
      timeGoalValue: 45,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      plannedStartPushRemindersEnabled: false,
      bgTimeGoalPushEligible: false,
      bgTimeGoalPushDueAtMs: null,
      schemaVersion: 1,
    });
    expect(row).not.toHaveProperty("milestonesEnabled");
    expect(row).not.toHaveProperty("milestoneTimeUnit");
    expect(row).not.toHaveProperty("milestones");
    expect(JSON.stringify(row)).not.toContain("undefined");
    expect(mocks.batchDelete).toHaveBeenCalledTimes(1);
  });

  it("creates scheduled reminder rows for Brain Dump tasks before they launch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T09:00:00+10:00"));
    try {
      const repository = createFirestoreBrainDumpWorkspaceRepository();

      await repository.saveTask?.(
        "uid-1",
        task({
          plannedStartPushRemindersEnabled: true,
          timeGoalEnabled: true,
          timeGoalValue: 45,
          timeGoalUnit: "minute",
          timeGoalPeriod: "day",
          timeGoalMinutes: 45,
        })
      );

      const taskRow = mocks.batchSet.mock.calls[0]?.[1] as Record<string, unknown>;
      const scheduledRow = mocks.batchSet.mock.calls[1]?.[1] as Record<string, unknown>;
      expect(taskRow).toMatchObject({
        bgTimeGoalPushEligible: false,
        bgTimeGoalPushDueAtMs: null,
        plannedStartPushRemindersEnabled: true,
      });
      expect(scheduledRow).toMatchObject({
        ownerUid: "uid-1",
        taskId: "brain-dump-task-1",
        taskName: "Call dentist",
        notificationKind: "unscheduledGap",
        eventType: "unscheduledGapReminder",
        dueAtMs: Date.parse("2026-08-20T23:00:00.000Z"),
        timeGoalMinutes: 45,
        route: "/tasklaunch",
        schemaVersion: 1,
      });
      expect(mocks.batchDelete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
