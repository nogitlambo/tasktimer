import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Task } from "@/app/tasktimer/lib/types";
import type { BrainDumpReviewSession } from "@/app/brain-dump/lib/brainDumpProcessing";

const mocks = vi.hoisted(() => ({
  store: {
    saveSession: vi.fn(),
    getSession: vi.fn(),
  },
  workspace: {
    loadTasks: vi.fn(),
    saveTasks: vi.fn(),
    deleteTasks: vi.fn(),
    hasTaskDependents: vi.fn(),
  },
  verifyFirebaseRequestUser: vi.fn(),
}));

vi.mock("../../../../shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../shared/auth")>();
  return {
    ...actual,
    verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser,
  };
});

vi.mock("@/app/brain-dump/lib/brainDumpSessionStore", () => ({
  createFirestoreBrainDumpSessionStore: () => mocks.store,
}));

vi.mock("@/app/brain-dump/lib/brainDumpWorkspaceStore", () => ({
  createFirestoreBrainDumpWorkspaceRepository: () => mocks.workspace,
}));

import { POST } from "./route";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-created",
    name: "Call dentist",
    taskType: "recurring",
    onceOffDay: null,
    onceOffTargetDate: null,
    createdAtMs: 1,
    order: 1,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestoneTimeUnit: "hour",
    milestones: [],
    hasStarted: false,
    ...overrides,
  };
}

function reviewSession(): BrainDumpReviewSession {
  const createdTask = task();
  return {
    id: "session-1",
    ownerUid: "uid-1",
    mode: "typed",
    state: "completed",
    promptId: "brain-dump-v1",
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + 1,
    source: { kind: "typed", rawText: "" },
    review: { selectedCount: 1, items: [] },
    batchResult: {
      sessionId: "session-1",
      idempotencyKey: "confirm-key-route-undo",
      payloadHash: "hash",
      state: "completed",
      createdCount: 1,
      skippedCount: 0,
      failedCount: 0,
      retryableCount: 0,
      completedAtMs: Date.now(),
      items: [{ itemId: "item-1", status: "created", createdTaskId: createdTask.id, createdTaskSnapshot: createdTask }],
    },
  };
}

describe("POST /api/brain-dump/sessions/[sessionId]/undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1", email: "user@example.com", idToken: "token" });
    mocks.store.getSession.mockResolvedValue(reviewSession());
    mocks.store.saveSession.mockResolvedValue(undefined);
    mocks.workspace.loadTasks.mockResolvedValue([task()]);
    mocks.workspace.deleteTasks.mockResolvedValue(undefined);
    mocks.workspace.hasTaskDependents.mockResolvedValue(false);
  });

  it("undoes the owned batch through the workspace boundary", async () => {
    const response = await POST(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1/undo", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://localhost", "x-firebase-auth": "token" },
        body: JSON.stringify({ idempotencyKey: "confirm-key-route-undo" }),
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(mocks.store.getSession).toHaveBeenCalledWith("uid-1", "session-1");
    expect(mocks.workspace.deleteTasks).toHaveBeenCalledWith("uid-1", ["task-created"]);
    expect(payload).toMatchObject({
      ok: true,
      undo: {
        state: "undone",
        removedCount: 1,
        retainedCount: 0,
      },
    });
  });

  it("does not allow another user to undo the batch", async () => {
    mocks.verifyFirebaseRequestUser.mockResolvedValueOnce({ uid: "uid-2", email: "other@example.com", idToken: "token" });
    mocks.store.getSession.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1/undo", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://localhost", "x-firebase-auth": "token" },
        body: JSON.stringify({ idempotencyKey: "confirm-key-route-undo" }),
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({ error: "Brain Dump session was not found.", code: "brain-dump/not-found" });
    expect(mocks.workspace.deleteTasks).not.toHaveBeenCalled();
  });
});
