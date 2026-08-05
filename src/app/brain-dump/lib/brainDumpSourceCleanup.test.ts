import { describe, expect, it, vi } from "vitest";

import type { BrainDumpReviewSession, BrainDumpSessionStore } from "./brainDumpProcessing";
import { cleanupBrainDumpSourceFilesForSession } from "./brainDumpSourceCleanup";

function session(overrides: Partial<BrainDumpReviewSession> = {}): BrainDumpReviewSession {
  return {
    id: "session-1",
    ownerUid: "uid-1",
    mode: "typed",
    state: "completed",
    promptId: "brain-dump-v1",
    createdAtMs: 1_800_000_000_000,
    expiresAtMs: 1_800_604_800_000,
    source: {
      kind: "typed",
      rawText: "",
      files: [
        {
          path: "users/uid-1/brain-dump-sources/session-1/voice.webm",
          contentType: "audio/webm",
          sizeBytes: 256_000,
          createdAtMs: 1_800_000_000_000,
          deleteAfterMs: 1_800_086_400_000,
          cleanupStatus: "delete_pending",
        },
      ],
    },
    review: { selectedCount: 0, items: [] },
    batchResult: {
      sessionId: "session-1",
      idempotencyKey: "confirm-key-1",
      payloadHash: "hash",
      state: "completed",
      createdCount: 1,
      skippedCount: 0,
      failedCount: 0,
      retryableCount: 0,
      completedAtMs: 1_800_000_000_000,
      items: [{ itemId: "item-1", status: "created", createdTaskId: "task-created" }],
    },
    ...overrides,
  };
}

describe("cleanupBrainDumpSourceFilesForSession", () => {
  it("deletes completed-session private source files after 24 hours while preserving created-task receipts", async () => {
    let savedSession: BrainDumpReviewSession | null = null;
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => session()),
      saveSession: vi.fn(async (nextSession) => {
        savedSession = nextSession;
      }),
    };
    const storage = {
      deleteObject: vi.fn(async () => {}),
    };

    const result = await cleanupBrainDumpSourceFilesForSession({
      uid: "uid-1",
      sessionId: "session-1",
      store,
      storage,
      now: () => 1_800_086_400_001,
    });

    expect(storage.deleteObject).toHaveBeenCalledWith("users/uid-1/brain-dump-sources/session-1/voice.webm");
    expect(result).toEqual({
      sessionId: "session-1",
      deletedCount: 1,
      failedCount: 0,
      pendingCount: 0,
      retryable: false,
    });
    const updatedSession = savedSession as unknown as BrainDumpReviewSession;
    expect(updatedSession.source.files?.[0]).toMatchObject({
      cleanupStatus: "deleted",
      deletedAtMs: 1_800_086_400_001,
    });
    expect(updatedSession.batchResult?.items[0].createdTaskId).toBe("task-created");
    expect(JSON.stringify(result)).not.toContain("voice.webm");
  });

  it("does not delete another user's source file path", async () => {
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () =>
        session({
          source: {
            kind: "typed",
            rawText: "",
            files: [
              {
                path: "users/uid-2/brain-dump-sources/session-1/voice.webm",
                contentType: "audio/webm",
                sizeBytes: 256_000,
                createdAtMs: 1,
                deleteAfterMs: 2,
                cleanupStatus: "delete_pending",
              },
            ],
          },
        })
      ),
      saveSession: vi.fn(async () => {}),
    };
    const storage = {
      deleteObject: vi.fn(async () => {}),
    };

    const result = await cleanupBrainDumpSourceFilesForSession({
      uid: "uid-1",
      sessionId: "session-1",
      store,
      storage,
      now: () => 3,
    });

    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(result).toMatchObject({ deletedCount: 0, failedCount: 1, retryable: true });
    const saved = vi.mocked(store.saveSession).mock.calls[0]?.[0] as BrainDumpReviewSession;
    expect(saved.source.files?.[0]).toMatchObject({
      cleanupStatus: "delete_failed",
      cleanupErrorCode: "source-path-not-owned",
    });
  });

  it("records retryable cleanup failures without exposing source content", async () => {
    const store: BrainDumpSessionStore = {
      getSession: vi.fn(async () => session()),
      saveSession: vi.fn(async () => {}),
    };
    const storage = {
      deleteObject: vi.fn(async () => {
        throw new Error("storage unavailable for private path");
      }),
    };

    const result = await cleanupBrainDumpSourceFilesForSession({
      uid: "uid-1",
      sessionId: "session-1",
      store,
      storage,
      now: () => 1_800_086_400_001,
    });

    expect(result).toEqual({
      sessionId: "session-1",
      deletedCount: 0,
      failedCount: 1,
      pendingCount: 0,
      retryable: true,
    });
    const saved = vi.mocked(store.saveSession).mock.calls[0]?.[0] as BrainDumpReviewSession;
    expect(saved.source.files?.[0]).toMatchObject({
      cleanupStatus: "delete_failed",
      cleanupErrorCode: "storage-delete-failed",
      lastCleanupAttemptAtMs: 1_800_086_400_001,
    });
    expect(JSON.stringify(result)).not.toContain("voice.webm");
    expect(JSON.stringify(result)).not.toContain("storage unavailable");
  });
});
