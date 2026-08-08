import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  batchSet: vi.fn(),
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

    const [row, options] = mocks.set.mock.calls[0] as [Record<string, unknown>, { merge: boolean }];
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
  });
});
