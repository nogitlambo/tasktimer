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

function reviewSession(): BrainDumpReviewSession {
  return {
    id: "session-1",
    ownerUid: "uid-1",
    mode: "typed",
    state: "review",
    promptId: "brain-dump-v1",
    createdAtMs: 1,
    expiresAtMs: 2,
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
        },
      ],
    },
  };
}

describe("POST /api/brain-dump/sessions/[sessionId]/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
