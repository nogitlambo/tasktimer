import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Task } from "./types";

type FirestoreDocumentStub = {
  exists: () => boolean;
  data: () => Record<string, unknown> | undefined;
  get: (key?: string) => unknown;
};

const firestoreMocks = vi.hoisted(() => ({
  setDoc: vi.fn(async () => undefined),
  getDoc: vi.fn<(ref?: { path?: string }) => Promise<FirestoreDocumentStub>>(async () => ({
    exists: () => false,
    data: () => undefined,
    get: () => undefined,
  })),
  getDocs: vi.fn(async (ref?: { path?: string }) => {
    void ref;
    return {
      docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
    };
  }),
  deleteDoc: vi.fn(async () => undefined),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, ...parts: string[]) => ({ path: parts.join("/") })),
  deleteDoc: firestoreMocks.deleteDoc,
  doc: vi.fn((_db, ...parts: string[]) => ({ path: parts.join("/") })),
  getDoc: firestoreMocks.getDoc,
  getDocs: firestoreMocks.getDocs,
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn((value) => value),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  setDoc: firestoreMocks.setDoc,
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(async () => undefined),
  })),
}));

vi.mock("@/lib/firebaseFirestoreClient", () => ({
  getFirebaseFirestoreClient: vi.fn(() => ({ type: "db" })),
}));

vi.mock("@/lib/firebaseClient", () => ({
  getFirebaseAuthClient: vi.fn(() => ({ currentUser: null })),
}));

vi.mock("./leaderboard", () => ({
  patchLeaderboardProfileFromUserRoot: vi.fn(async () => undefined),
}));

const { buildDefaultUserPreferences, loadPreferences, loadUserWorkspace, savePreferences, saveTask, saveUserRootPatch } = await import("./cloudStore");

function findSetDocWrite(path: string): Record<string, unknown> | undefined {
  const calls = firestoreMocks.setDoc.mock.calls as unknown as Array<[{ path: string }, Record<string, unknown>, unknown?]>;
  return calls.find(([ref]) => ref.path === path)?.[1];
}

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

describe("saveTask Firestore planned start payloads", () => {
  beforeEach(() => {
    firestoreMocks.setDoc.mockClear();
    firestoreMocks.getDoc.mockReset();
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
      get: () => undefined,
    });
    firestoreMocks.getDocs.mockReset();
    firestoreMocks.getDocs.mockResolvedValue({ docs: [] });
    firestoreMocks.deleteDoc.mockClear();
  });

  it("persists a shared plannedStartTime for by-day schedules that use one time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 8, 0, 0));

    try {
      await saveTask(
        "user-1",
        task({
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
          plannedStartTime: null,
          plannedStartByDay: { mon: "09:00", wed: "09:00", fri: "09:00" },
        })
      );
    } finally {
      vi.useRealTimers();
    }

    expect(findSetDocWrite("users/user-1/tasks/task-1")).toEqual(expect.objectContaining({
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00", wed: "09:00", fri: "09:00" },
    }));

    expect(findSetDocWrite("scheduled_time_goal_pushes/user-1__task-1")).toEqual(expect.objectContaining({
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00", wed: "09:00", fri: "09:00" },
    }));
  });

  it("does not re-add background push fields to the legacy task fallback payload", async () => {
    firestoreMocks.setDoc.mockImplementation(async (ref?: { path?: string }, row?: Record<string, unknown>) => {
      if (ref?.path !== "users/user-1/tasks/task-1") return undefined;
      const hasBackgroundPushField = Object.keys(row || {}).some((key) => key.startsWith("bgTimeGoalPush"));
      if (!hasBackgroundPushField) return undefined;
      const error = new Error("Missing or insufficient permissions.") as Error & { code?: string };
      error.code = "permission-denied";
      throw error;
    });

    await saveTask(
      "user-1",
      task({
        plannedStartTime: "09:00",
        plannedStartPushRemindersEnabled: true,
      })
    );

    const taskWrites = (firestoreMocks.setDoc.mock.calls as unknown as Array<[{ path: string }, Record<string, unknown>]>)
      .filter(([ref]) => ref.path === "users/user-1/tasks/task-1")
      .map(([, row]) => row);

    expect(taskWrites).toHaveLength(2);
    expect(taskWrites[0]).toEqual(expect.objectContaining({
      bgTimeGoalPushEligible: true,
    }));
    expect(taskWrites[1]).not.toHaveProperty("bgTimeGoalPushEligible");
    expect(taskWrites[1]).not.toHaveProperty("bgTimeGoalPushDueAtMs");
    expect(taskWrites[1]).not.toHaveProperty("bgTimeGoalPushSentAtMs");
    expect(taskWrites[1]).not.toHaveProperty("bgTimeGoalPushSentDueAtMs");
  });

  it("maps legacy elapsed cloud task time into accumulated time", async () => {
    firestoreMocks.getDocs.mockImplementation(async (ref?: { path?: string }) => {
      if (ref?.path === "users/user-1/tasks") {
        return {
          docs: [
            {
              id: "task-1",
              data: () => ({
                name: "Legacy Timer",
                order: 1,
                accumulatedMs: 0,
                elapsed: 45_000,
                running: false,
                startMs: null,
                collapsed: false,
                milestonesEnabled: false,
                milestones: [],
                hasStarted: false,
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const snapshot = await loadUserWorkspace("user-1");

    expect(snapshot.tasks[0]).toMatchObject({
      id: "task-1",
      accumulatedMs: 45_000,
      hasStarted: true,
    });
  });

  it("normalizes full-workspace and standalone preference documents identically", async () => {
    const rawPreferences = {
      weekStarting: "sun",
      startupModule: "friends",
      taskOrderBy: "dateAddedDesc",
      dynamicColorsEnabled: false,
      fullColorTaskCardsEnabled: true,
      rewards: {
        totalXp: 10,
        completedSessions: 1,
        awardLedger: [
          {
            ts: 1,
            xp: 10,
            baseXp: 10,
            multiplier: 1,
            eligibleMs: 0,
            reason: "launch",
            dayKey: "1970-01-01",
            sourceKey: "legacy-launch",
          },
        ],
        pendingTimeGoalXp: {
          byTaskId: {
            "task-1": {
              taskId: "task-1",
              completedSessionsDelta: 1,
              entries: [
                {
                  ts: 1,
                  xp: 10,
                  baseXp: 10,
                  multiplier: 1,
                  eligibleMs: 0,
                  reason: "launch",
                  dayKey: "1970-01-01",
                  sourceKey: "legacy-pending-launch",
                },
              ],
            },
          },
        },
      },
    };
    firestoreMocks.getDoc.mockImplementation(async (ref?: { path?: string }) => {
      const isPreferences = ref?.path === "users/user-1/preferences/v1";
      return {
        exists: () => isPreferences,
        data: () => (isPreferences ? rawPreferences : undefined),
        get: (key?: string) =>
          isPreferences && key ? rawPreferences[key as keyof typeof rawPreferences] : undefined,
      };
    });

    const workspacePreferences = (await loadUserWorkspace("user-1")).preferences;
    const standalonePreferences = await loadPreferences("user-1");

    expect(workspacePreferences).toEqual(standalonePreferences);
    expect(workspacePreferences).toEqual(
      expect.objectContaining({
        weekStarting: "sun",
        autoFocusOnTaskLaunchEnabled: false,
        fullColorTaskCardsEnabled: true,
        updatedAtMs: 0,
      })
    );
    expect(workspacePreferences?.rewards.awardLedger).toHaveLength(1);
    expect(workspacePreferences?.rewards.pendingTimeGoalXp.byTaskId["task-1"]?.updatedAt).toBe(0);
  });

  it("persists the Adapter-owned preference mutation timestamp", async () => {
    await savePreferences("user-1", {
      ...buildDefaultUserPreferences(123),
      startupModule: "dashboard",
    });

    expect(findSetDocWrite("users/user-1/preferences/v1")).toEqual(
      expect.objectContaining({
        startupModule: "dashboard",
        fullColorTaskCardsEnabled: false,
        updatedAtMs: 123,
      })
    );
  });
});

describe("saveUserRootPatch plan-safe writes", () => {
  beforeEach(() => {
    firestoreMocks.setDoc.mockClear();
    firestoreMocks.getDoc.mockReset();
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
      get: () => undefined,
    });
  });

  it("does not rewrite server-managed plan fields during client account saves", async () => {
    firestoreMocks.getDoc.mockImplementation(async (ref?: { path?: string }) => ({
      exists: () => ref?.path === "users/user-1",
      data: () => {
        if (ref?.path !== "users/user-1") return undefined;
        const data: Record<string, unknown> = {
          plan: "plus",
          planUpdatedAt: { toMillis: () => 123 },
          schemaVersion: 1,
        };
        return data;
      },
      get: (key?: string) => {
        if (ref?.path !== "users/user-1" || !key) return undefined;
        const data: Record<string, unknown> = {
          plan: "plus",
          planUpdatedAt: { toMillis: () => 123 },
          schemaVersion: 1,
        };
        return data[key];
      },
    }));

    await saveUserRootPatch("user-1", { avatarId: "avatar-1" });

    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      { path: "users/user-1" },
      expect.objectContaining({
        avatarId: "avatar-1",
        schemaVersion: 1,
      }),
      { merge: true }
    );
    const rootWrite = findSetDocWrite("users/user-1");
    expect(rootWrite).not.toHaveProperty("plan");
    expect(rootWrite).not.toHaveProperty("planUpdatedAt");
  });
});
