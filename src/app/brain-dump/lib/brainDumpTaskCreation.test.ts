import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/app/tasktimer/lib/types";
import type {
  BrainDumpReviewDate,
  BrainDumpReviewEnrichment,
  BrainDumpReviewSession,
  BrainDumpSessionStore,
} from "./brainDumpProcessing";
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

function reviewDate(overrides: Partial<BrainDumpReviewDate> = {}): BrainDumpReviewDate {
  return {
    originalDateText: null,
    dateSource: "none",
    timezone: "Australia/Sydney",
    resolvedDate: null,
    dateConfidence: 0,
    ambiguity: "none",
    ambiguityFlags: [],
    userConfirmedDate: false,
    recurrenceText: null,
    dependencyTimingText: null,
    ...overrides,
  };
}

function reviewEnrichment(overrides: Partial<BrainDumpReviewEnrichment> = {}): BrainDumpReviewEnrichment {
  return {
    notes: null,
    estimatedDurationMinutes: null,
    priority: null,
    firstAction: null,
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
          date: reviewDate(),
          enrichment: reviewEnrichment(),
          validationErrors: [],
          duplicateWarnings: [],
          duplicateDecision: "undecided",
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
          date: reviewDate(),
          enrichment: reviewEnrichment(),
          validationErrors: [],
          duplicateWarnings: [],
          duplicateDecision: "undecided",
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
      idempotencyKey: "confirm-key-edit-one",
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
        { itemId: "item-1", status: "created" },
        { itemId: "item-2", status: "skipped", reason: "not-selected" },
      ],
    });
    expect(savedTasks).toHaveLength(2);
    expect(savedTasks[1]).toMatchObject({
      name: "Call orthodontist",
      taskType: "recurring",
      order: 2,
      accumulatedMs: 0,
      running: false,
      hasStarted: false,
    });
    expect(savedTasks[1].id).toMatch(/^brain-dump-task-/);
    expect(JSON.stringify(savedTasks[1])).not.toContain("Call dentist and finish screenshots");
    expect(savedSession).toMatchObject({
      state: "completed",
      batchResult: {
        createdCount: 1,
        skippedCount: 1,
      },
    });
  });

  it("returns the same batch receipt for a repeated idempotency key without duplicating tasks", async () => {
    let savedTasks = [task()];
    let savedSession = reviewSession();
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => savedSession),
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
    const request = {
      uid: "uid-1",
      sessionId: "session-1",
      idempotencyKey: "confirm-key-1",
      itemUpdates: [
        { itemId: "item-1", title: "Call orthodontist", selected: true },
        { itemId: "item-2", selected: false },
      ],
      store,
      workspace,
      createId: () => "random-task-id-that-should-not-drive-idempotency",
      now: () => 1_800_000_000_500,
    };

    const first = await confirmBrainDumpReviewSession(request);
    const second = await confirmBrainDumpReviewSession(request);

    expect(second).toEqual(first);
    expect(savedTasks.filter((entry) => entry.id !== "task-existing")).toHaveLength(1);
    expect(workspace.saveTasks).toHaveBeenCalledTimes(1);
  });

  it("rejects a changed payload that reuses an existing idempotency key", async () => {
    let savedSession = reviewSession();
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => savedSession),
      saveSession: vi.fn(async (session) => {
        savedSession = session;
      }),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(async () => [task()]),
      saveTasks: vi.fn(async () => {}),
    };

    await confirmBrainDumpReviewSession({
      uid: "uid-1",
      sessionId: "session-1",
      idempotencyKey: "confirm-key-mismatch",
      itemUpdates: [{ itemId: "item-1", title: "Call orthodontist", selected: true }],
      store,
      workspace,
      createId: () => "task-id-1",
    });
    await expect(
      confirmBrainDumpReviewSession({
        uid: "uid-1",
        sessionId: "session-1",
        idempotencyKey: "confirm-key-mismatch",
        itemUpdates: [{ itemId: "item-1", title: "Call plumber", selected: true }],
        store,
        workspace,
        createId: () => "task-id-2",
      })
    ).rejects.toMatchObject({
      code: "brain-dump/idempotency-payload-mismatch",
      status: 409,
    });
    expect(workspace.saveTasks).toHaveBeenCalledTimes(1);
  });

  it("uses stable task ids so concurrent same-key requests cannot create duplicate workspace tasks", async () => {
    let savedSession = reviewSession();
    let savedTasks = [task()];
    let releaseSaves!: () => void;
    const savesCanFinish = new Promise<void>((resolve) => {
      releaseSaves = resolve;
    });
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => savedSession),
      saveSession: vi.fn(async (session) => {
        savedSession = session;
      }),
    };
    let idSequence = 0;
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(async () => savedTasks),
      saveTasks: vi.fn(async (_uid, tasks) => {
        await savesCanFinish;
        for (const entry of tasks) {
          if (!savedTasks.some((existing) => existing.id === entry.id)) savedTasks = [...savedTasks, entry];
        }
      }),
    };
    const request = {
      uid: "uid-1",
      sessionId: "session-1",
      idempotencyKey: "confirm-key-concurrent",
      itemUpdates: [
        { itemId: "item-1", title: "Call orthodontist", selected: true },
        { itemId: "item-2", selected: false },
      ],
      store,
      workspace,
      createId: () => `non-deterministic-${(idSequence += 1)}`,
      now: () => 1_800_000_000_500,
    };

    const first = confirmBrainDumpReviewSession(request);
    const second = confirmBrainDumpReviewSession(request);
    releaseSaves();
    const results = await Promise.all([first, second]);

    expect(results[1].items[0].createdTaskId).toBe(results[0].items[0].createdTaskId);
    expect(savedTasks.filter((entry) => entry.id !== "task-existing")).toHaveLength(1);
  });

  it("records partial failures with retryable item receipts without claiming full success", async () => {
    let savedSession = reviewSession();
    const createdTaskIds: string[] = [];
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => savedSession),
      saveSession: vi.fn(async (session) => {
        savedSession = session;
      }),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(async () => [task()]),
      saveTasks: vi.fn(),
      saveTask: vi.fn(async (_uid, entry) => {
        if (entry.name === "Finish screenshots") throw new Error("Firestore write failed");
        createdTaskIds.push(entry.id);
      }),
    };

    const result = await confirmBrainDumpReviewSession({
      uid: "uid-1",
      sessionId: "session-1",
      idempotencyKey: "confirm-key-partial",
      itemUpdates: [
        { itemId: "item-1", title: "Call orthodontist", selected: true },
        { itemId: "item-2", title: "Finish screenshots", selected: true },
      ],
      store,
      workspace,
      createId: () => "unused-random-id",
    });

    expect(result).toMatchObject({
      state: "partially_failed",
      createdCount: 1,
      failedCount: 1,
      retryableCount: 1,
      items: [
        { itemId: "item-1", status: "created" },
        { itemId: "item-2", status: "failed", reason: "workspace-write-failed", retryable: true },
      ],
    });
    expect(createdTaskIds).toHaveLength(1);
    expect(savedSession.state).toBe("review");
    expect(savedSession.batchResult).toMatchObject({ state: "partially_failed" });
  });

  it("replays a partial receipt without recreating already successful items", async () => {
    let savedSession = reviewSession();
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => savedSession),
      saveSession: vi.fn(async (session) => {
        savedSession = session;
      }),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(async () => [task()]),
      saveTasks: vi.fn(),
      saveTask: vi.fn(async (_uid, entry) => {
        if (entry.name === "Finish screenshots") throw new Error("Firestore write failed");
      }),
    };
    const request = {
      uid: "uid-1",
      sessionId: "session-1",
      idempotencyKey: "confirm-key-partial-replay",
      itemUpdates: [
        { itemId: "item-1", title: "Call orthodontist", selected: true },
        { itemId: "item-2", title: "Finish screenshots", selected: true },
      ],
      store,
      workspace,
      createId: () => "unused-random-id",
    };

    const first = await confirmBrainDumpReviewSession(request);
    const second = await confirmBrainDumpReviewSession(request);

    expect(second).toEqual(first);
    expect(workspace.saveTask).toHaveBeenCalledTimes(2);
  });

  it("maps reviewed date edits and removals only to supported Task date fields", async () => {
    let savedTasks = [task()];
    const datedSession = reviewSession({
      review: {
        selectedCount: 2,
        items: [
          {
            id: "item-1",
            itemType: "task",
            title: "Call dentist",
            selected: true,
            sourceEvidence: ["call dentist tomorrow"],
            confidence: 0.9,
            ambiguityFlags: [],
            supported: true,
            date: reviewDate({
              originalDateText: "tomorrow",
              dateSource: "explicit",
              resolvedDate: "2026-08-06",
              dateConfidence: 0.9,
            }),
            enrichment: reviewEnrichment(),
            validationErrors: [],
            duplicateWarnings: [],
            duplicateDecision: "undecided",
          },
          {
            id: "item-2",
            itemType: "task",
            title: "Clean desk",
            selected: true,
            sourceEvidence: ["clean desk Friday"],
            confidence: 0.8,
            ambiguityFlags: [],
            supported: true,
            date: reviewDate({
              originalDateText: "Friday",
              dateSource: "suggested",
              resolvedDate: "2026-08-07",
              dateConfidence: 0.55,
            }),
            enrichment: reviewEnrichment(),
            validationErrors: [],
            duplicateWarnings: [],
            duplicateDecision: "undecided",
          },
        ],
      },
    });
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => datedSession),
      saveSession: vi.fn(async () => {}),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(async () => savedTasks),
      saveTasks: vi.fn(async (_uid, tasks) => {
        savedTasks = tasks;
      }),
    };

    await confirmBrainDumpReviewSession({
      uid: "uid-1",
      sessionId: "session-1",
      idempotencyKey: "confirm-key-date-edits",
      itemUpdates: [
        { itemId: "item-1", selected: true, date: { resolvedDate: "2026-08-08", userConfirmedDate: true } },
        { itemId: "item-2", selected: true, date: { resolvedDate: null, userConfirmedDate: true } },
      ],
      store,
      workspace,
      createId: () => "unused-random-id",
    });

    expect(savedTasks[1]).toMatchObject({
      name: "Call dentist",
      taskType: "once-off",
      onceOffTargetDate: "2026-08-08",
    });
    expect(savedTasks[2]).toMatchObject({
      name: "Clean desk",
      taskType: "recurring",
      onceOffTargetDate: null,
    });
    expect(JSON.stringify(savedTasks)).not.toContain("originalDateText");
  });

  it("maps estimated duration while keeping review-only enrichment out of Task documents", async () => {
    let savedTasks = [task()];
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => reviewSession()),
      saveSession: vi.fn(async () => {}),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(async () => savedTasks),
      saveTasks: vi.fn(async (_uid, tasks) => {
        savedTasks = tasks;
      }),
    };

    await confirmBrainDumpReviewSession({
      uid: "uid-1",
      sessionId: "session-1",
      idempotencyKey: "confirm-key-enrichment",
      itemUpdates: [
        {
          itemId: "item-1",
          selected: true,
          enrichment: {
            notes: "Mention onboarding metrics.",
            estimatedDurationMinutes: 45,
            priority: "high",
            firstAction: "Open the draft deck",
          },
        },
        { itemId: "item-2", selected: false },
      ],
      store,
      workspace,
      createId: () => "unused-random-id",
    });

    expect(savedTasks[1]).toMatchObject({
      name: "Call dentist",
      timeGoalEnabled: true,
      timeGoalValue: 45,
      timeGoalUnit: "minute",
      timeGoalPeriod: "day",
      timeGoalMinutes: 45,
    });
    expect(JSON.stringify(savedTasks[1])).not.toContain("Mention onboarding metrics");
    expect(JSON.stringify(savedTasks[1])).not.toContain("Open the draft deck");
    expect(JSON.stringify(savedTasks[1])).not.toContain("priority");
  });

  it("skips invalid reviewed items without blocking unrelated valid items", async () => {
    let savedTasks = [task()];
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => reviewSession()),
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
      idempotencyKey: "confirm-key-validation",
      itemUpdates: [
        { itemId: "item-1", title: "", selected: true },
        { itemId: "item-2", title: "Finish screenshots", selected: true },
      ],
      store,
      workspace,
      createId: () => "unused-random-id",
    });

    expect(result).toMatchObject({
      createdCount: 1,
      skippedCount: 1,
      items: [
        { itemId: "item-1", status: "skipped", reason: "validation-error" },
        { itemId: "item-2", status: "created" },
      ],
    });
    expect(savedTasks).toHaveLength(2);
    expect(savedTasks[1].name).toBe("Finish screenshots");
  });

  it("rechecks duplicates at confirmation and honors Create anyway", async () => {
    let savedTasks = [task({ id: "task-dentist", name: "Call the dentist" })];
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
      idempotencyKey: "confirm-key-duplicate-anyway",
      itemUpdates: [
        { itemId: "item-1", title: "Call dentist", selected: true, duplicateDecision: "create_anyway" },
        { itemId: "item-2", selected: false },
      ],
      store,
      workspace,
      createId: () => "unused-random-id",
    });

    expect(result).toMatchObject({
      createdCount: 1,
      skippedCount: 1,
      items: [
        { itemId: "item-1", status: "created" },
        { itemId: "item-2", status: "skipped" },
      ],
    });
    expect(savedTasks).toHaveLength(2);
    expect(savedTasks[1].name).toBe("Call dentist");
    expect(savedSession).not.toBeNull();
    const completedSession = savedSession as unknown as BrainDumpReviewSession;
    expect(completedSession.review.items[0].duplicateDecision).toBe("create_anyway");
    expect(completedSession.review.items[0].duplicateWarnings[0]).toMatchObject({
      matchedTaskId: "task-dentist",
      matchedState: "active",
    });
  });

  it("skips duplicate warnings only when the user chooses Skip", async () => {
    let savedTasks = [task({ id: "task-dentist", name: "Call the dentist" })];
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => reviewSession()),
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
      idempotencyKey: "confirm-key-duplicate-skip",
      itemUpdates: [
        { itemId: "item-1", title: "Call dentist", selected: true, duplicateDecision: "skip" },
        { itemId: "item-2", selected: false },
      ],
      store,
      workspace,
      createId: () => "unused-random-id",
    });

    expect(result).toMatchObject({
      createdCount: 0,
      skippedCount: 2,
      items: [
        { itemId: "item-1", status: "skipped", reason: "duplicate-skipped" },
        { itemId: "item-2", status: "skipped", reason: "not-selected" },
      ],
    });
    expect(savedTasks).toHaveLength(1);
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
        idempotencyKey: "confirm-key-wrong-user",
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

  it("expires and redacts stale review sessions before any workspace write", async () => {
    let savedSession: BrainDumpReviewSession | null = null;
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () =>
        reviewSession({
          expiresAtMs: 1_800_000_000_499,
          source: { kind: "typed", rawText: "private stale source" },
        })
      ),
      saveSession: vi.fn(async (session) => {
        savedSession = session;
      }),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(),
      saveTasks: vi.fn(),
    };

    await expect(
      confirmBrainDumpReviewSession({
        uid: "uid-1",
        sessionId: "session-1",
        idempotencyKey: "confirm-key-expired-unit",
        store,
        workspace,
        createId: () => "task-1",
        now: () => 1_800_000_000_500,
      })
    ).rejects.toMatchObject({
      code: "brain-dump/expired",
      status: 410,
    });
    expect(workspace.loadTasks).not.toHaveBeenCalled();
    expect(workspace.saveTasks).not.toHaveBeenCalled();
    expect(savedSession).toMatchObject({
      state: "expired",
      source: { kind: "typed", rawText: "" },
      review: { selectedCount: 0 },
    });
    expect((savedSession as unknown as BrainDumpReviewSession).review.items[0].sourceEvidence).toEqual([]);
    expect(JSON.stringify(savedSession)).not.toContain("private stale source");
  });

  it("does not repeatedly rewrite an already-redacted expired session", async () => {
    const expired = reviewSession({
      state: "expired",
      expiredAtMs: 1_800_000_000_500,
      source: { kind: "typed", rawText: "" },
      review: {
        selectedCount: 0,
        items: reviewSession().review.items.map((item) => ({ ...item, selected: false, sourceEvidence: [] })),
      },
    });
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => expired),
      saveSession: vi.fn(),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(),
      saveTasks: vi.fn(),
    };

    await expect(
      confirmBrainDumpReviewSession({
        uid: "uid-1",
        sessionId: "session-1",
        idempotencyKey: "confirm-key-expired-replay",
        store,
        workspace,
        createId: () => "task-1",
        now: () => 1_800_000_000_600,
      })
    ).rejects.toMatchObject({
      code: "brain-dump/expired",
      status: 410,
    });
    expect(store.saveSession).not.toHaveBeenCalled();
    expect(workspace.loadTasks).not.toHaveBeenCalled();
  });

  it("does not expire completed sessions when a stale confirm arrives after creation finishes", async () => {
    const completed = reviewSession({
      state: "completed",
      expiresAtMs: 1_800_000_000_499,
      source: { kind: "typed", rawText: "" },
    });
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => completed),
      saveSession: vi.fn(),
    };
    const workspace: BrainDumpWorkspaceRepository = {
      loadTasks: vi.fn(),
      saveTasks: vi.fn(),
    };

    await expect(
      confirmBrainDumpReviewSession({
        uid: "uid-1",
        sessionId: "session-1",
        idempotencyKey: "confirm-key-completed-stale",
        store,
        workspace,
        createId: () => "task-1",
        now: () => 1_800_000_000_500,
      })
    ).rejects.toMatchObject({
      code: "brain-dump/not-reviewable",
      status: 409,
    });
    expect(store.saveSession).not.toHaveBeenCalled();
    expect(workspace.loadTasks).not.toHaveBeenCalled();
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
            date: reviewDate(),
            enrichment: reviewEnrichment(),
            validationErrors: [],
            duplicateWarnings: [],
            duplicateDecision: "undecided",
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
      idempotencyKey: "confirm-key-unsupported",
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
