import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Task } from "./types";

const firestoreMocks = vi.hoisted(() => ({
  setDoc: vi.fn(async () => undefined),
  getDoc: vi.fn(async () => ({
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

const { loadUserWorkspace, saveTask } = await import("./cloudStore");

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
    firestoreMocks.getDoc.mockClear();
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
});
