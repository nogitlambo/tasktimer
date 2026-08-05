import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/app/tasktimer/lib/types";
import type { BrainDumpReviewSession, BrainDumpSessionStore } from "./brainDumpProcessing";
import {
  confirmBrainDumpReviewSession,
  type BrainDumpWorkspaceRepository,
} from "./brainDumpTaskCreation";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-existing",
    name: "Existing task",
    taskType: "recurring",
    onceOffDay: null,
    onceOffTargetDate: null,
    createdAtMs: 100,
    order: 1,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestoneTimeUnit: "hour",
    milestones: [],
    hasStarted: false,
    plannedStartPushRemindersEnabled: true,
    ...overrides,
  };
}

function reviewSession(overrides: Partial<BrainDumpReviewSession> = {}): BrainDumpReviewSession {
  return {
    id: "session-1",
    ownerUid: "uid-1",
    mode: "typed",
    state: "review",
    promptId: "brain-dump-v1",
    createdAtMs: 1_800_000_000_000,
    expiresAtMs: 1_800_604_800_000,
    source: {
      kind: "typed",
      rawText: "Call dentist and finish screenshots.",
    },
    review: {
      selectedCount: 2,
      items: [
        {
          id: "item-1",
          itemType: "task",
          title: "Call dentist",
          selected: true,
          sourceEvidence: ["Call dentist"],
          confidence: 0.9,
          ambiguityFlags: [],
          supported: true,
        },
        {
          id: "item-2",
          itemType: "task",
          title: "Finish screenshots",
          selected: true,
          sourceEvidence: ["finish screenshots"],
          confidence: 0.88,
          ambiguityFlags: [],
          supported: true,
        },
      ],
    },
    ...overrides,
  };
}

describe("confirmBrainDumpReviewSession", () => {
  it("edits one title, excludes another item, and persists exactly one normal workspace task", async () => {
    let savedTasks = [task()];
    let savedSession: BrainDumpReviewSession | null = null;
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => reviewSession()),
      saveSession: vi.fn(async (session) => {
        savedSession = session;
      }),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(async () => savedTasks),
      saveTasks: vi.fn(async (_uid, tasks) => {
        savedTasks = tasks;
      }),
    };

    const result = await confirmBrainDumpReviewSession({
      uid: "uid-1",
      sessionId: "session-1",
      itemUpdates: [
        { itemId: "item-1", title: "Call orthodontist", selected: true },
        { itemId: "item-2", selected: false },
      ],
      store,
      workspace,
      createId: () => "brain-dump-task-1",
      now: () => 1_800_000_000_500,
    });

    expect(result).toMatchObject({
      sessionId: "session-1",
      createdCount: 1,
      skippedCount: 1,
      items: [
        { itemId: "item-1", createdTaskId: "brain-dump-task-1", status: "created" },
        { itemId: "item-2", status: "skipped", reason: "not-selected" },
      ],
    });
    expect(savedTasks).toHaveLength(2);
    expect(savedTasks[1]).toMatchObject({
      id: "brain-dump-task-1",
      name: "Call orthodontist",
      taskType: "recurring",
      order: 2,
      accumulatedMs: 0,
      running: false,
      hasStarted: false,
    });
    expect(JSON.stringify(savedTasks[1])).not.toContain("Call dentist and finish screenshots");
    expect(savedSession).toMatchObject({
      state: "completed",
      batchResult: {
        createdCount: 1,
        skippedCount: 1,
      },
    });
  });

  it("denies confirmation when the session is not owned by the authenticated user", async () => {
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => null),
      saveSession: vi.fn(async () => {}),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(),
      saveTasks: vi.fn(),
    };

    await expect(
      confirmBrainDumpReviewSession({
        uid: "uid-2",
        sessionId: "session-1",
        store,
        workspace,
        createId: () => "task-1",
      })
    ).rejects.toMatchObject({
      code: "brain-dump/not-found",
      status: 404,
    });
    expect(workspace.loadTasks).not.toHaveBeenCalled();
    expect(workspace.saveTasks).not.toHaveBeenCalled();
    expect(store.saveSession).not.toHaveBeenCalled();
  });

  it("skips unsupported items even when confirmation selects them", async () => {
    let savedTasks: Task[] = [];
    const unsupportedSession = reviewSession({
      review: {
        selectedCount: 1,
        items: [
          {
            id: "item-unsupported",
            itemType: "event",
            title: "Dentist appointment is Thursday",
            selected: false,
            sourceEvidence: ["appointment Thursday"],
            confidence: 0.8,
            ambiguityFlags: ["Unsupported item type for task creation."],
            supported: false,
          },
        ],
      },
    });
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => unsupportedSession),
      saveSession: vi.fn(async () => {}),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(async () => savedTasks),
      saveTasks: vi.fn(async (_uid, tasks) => {
        savedTasks = tasks;
      }),
    };

    const result = await confirmBrainDumpReviewSession({
      uid: "uid-1",
      sessionId: "session-1",
      itemUpdates: [{ itemId: "item-unsupported", selected: true }],
      store,
      workspace,
      createId: () => "task-unsupported",
    });

    expect(result).toMatchObject({
      createdCount: 0,
      skippedCount: 1,
      items: [{ itemId: "item-unsupported", status: "skipped", reason: "unsupported" }],
    });
    expect(workspace.saveTasks).not.toHaveBeenCalled();
    expect(savedTasks).toEqual([]);
  });
});
