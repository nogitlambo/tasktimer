import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Task } from "@/app/tasktimer/lib/types";
import type { BrainDumpReviewDate, BrainDumpReviewSession } from "@/app/brain-dump/lib/brainDumpProcessing";

const mocks = vi.hoisted(() => ({
  store: {
    saveSession: vi.fn(),
    getSession: vi.fn(),
  },
  workspace: {
    loadTasks: vi.fn(),
    saveTasks: vi.fn(),
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

function reviewSession(): BrainDumpReviewSession {
  return {
    id: "session-1",
    ownerUid: "uid-1",
    mode: "typed",
    state: "review",
    promptId: "brain-dump-v1",
    createdAtMs: 1,
    expiresAtMs: 4_102_444_800_000,
    source: { kind: "typed", rawText: "Call dentist" },
    review: {
      selectedCount: 1,
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
          enrichment: {
            notes: null,
            estimatedDurationMinutes: null,
            priority: null,
            firstAction: null,
          },
          validationErrors: [],
          duplicateWarnings: [],
          duplicateDecision: "undecided",
        },
      ],
    },
  };
}

describe("POST /api/brain-dump/sessions/[sessionId]/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1", email: "user@example.com", idToken: "token" });
    mocks.store.getSession.mockResolvedValue(reviewSession());
    mocks.workspace.loadTasks.mockResolvedValue([]);
    mocks.workspace.saveTasks.mockResolvedValue(undefined);
  });

  it("creates selected reviewed items through the workspace boundary", async () => {
    const response = await POST(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1/confirm", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://localhost", "x-firebase-auth": "token" },
        body: JSON.stringify({
          idempotencyKey: "confirm-key-route-1",
          itemUpdates: [{ itemId: "item-1", title: "Call orthodontist", selected: true }],
        }),
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const payload = await response.json();
    const savedTasks = mocks.workspace.saveTasks.mock.calls[0]?.[1] as Task[];

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(mocks.store.getSession).toHaveBeenCalledWith("uid-1", "session-1");
    expect(savedTasks).toHaveLength(1);
    expect(savedTasks[0].name).toBe("Call orthodontist");
    expect(payload).toMatchObject({
      ok: true,
      batch: {
        sessionId: "session-1",
        createdCount: 1,
        skippedCount: 0,
      },
    });
  });

  it("rejects creation requests without an idempotency key", async () => {
    const response = await POST(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1/confirm", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://localhost", "x-firebase-auth": "token" },
        body: JSON.stringify({
          itemUpdates: [{ itemId: "item-1", title: "Call orthodontist", selected: true }],
        }),
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      code: "brain-dump/idempotency-required",
    });
    expect(mocks.workspace.saveTasks).not.toHaveBeenCalled();
  });

  it("rejects an expired review session before creating tasks and redacts raw source", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(10_000));
    mocks.store.getSession.mockResolvedValueOnce({
      ...reviewSession(),
      expiresAtMs: 9_999,
      source: { kind: "typed", rawText: "private stale typed source" },
    });

    const response = await POST(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1/confirm", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://localhost", "x-firebase-auth": "token" },
        body: JSON.stringify({
          idempotencyKey: "confirm-key-expired",
          itemUpdates: [{ itemId: "item-1", title: "Call orthodontist", selected: true }],
        }),
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const payload = await response.json();
    const expiredSession = mocks.store.saveSession.mock.calls[0]?.[0] as BrainDumpReviewSession;

    expect(response.status).toBe(410);
    expect(payload).toEqual({
      error: "Brain Dump session expired. Start a fresh Brain Dump to continue.",
      code: "brain-dump/expired",
    });
    expect(mocks.workspace.saveTasks).not.toHaveBeenCalled();
    expect(expiredSession).toMatchObject({
      state: "expired",
      source: { kind: "typed", rawText: "" },
    });
    expect(expiredSession.review.items[0].sourceEvidence).toEqual([]);
    expect(JSON.stringify(expiredSession)).not.toContain("private stale typed source");
  });
});
