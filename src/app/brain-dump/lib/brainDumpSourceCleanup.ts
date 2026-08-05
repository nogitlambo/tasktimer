import type { BrainDumpReviewSession, BrainDumpSessionStore, BrainDumpSourceFile } from "./brainDumpProcessing";

export type BrainDumpSourceStorage = {
  deleteObject(path: string): Promise<void>;
};

export type BrainDumpSourceCleanupResult = {
  sessionId: string;
  deletedCount: number;
  failedCount: number;
  pendingCount: number;
  retryable: boolean;
};

export class BrainDumpSourceCleanupError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "BrainDumpSourceCleanupError";
  }
}

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function nowMs(now?: () => number) {
  return Math.max(0, Math.floor(Number(now?.() ?? Date.now()) || 0));
}

function sourcePathIsOwned(uid: string, sessionId: string, path: string) {
  const prefix = `users/${uid}/brain-dump-sources/${sessionId}/`;
  return path.startsWith(prefix) && !path.includes("..") && !/^https?:\/\//i.test(path);
}

function fileIsDue(file: BrainDumpSourceFile, currentMs: number) {
  if (file.cleanupStatus === "deleted") return false;
  return Number(file.deleteAfterMs || 0) > 0 && Number(file.deleteAfterMs || 0) <= currentMs;
}

function pendingFiles(files: BrainDumpSourceFile[], currentMs: number) {
  return files.filter((file) => file.cleanupStatus !== "deleted" && !fileIsDue(file, currentMs)).length;
}

export async function cleanupBrainDumpSourceFilesForSession(input: {
  uid: string;
  sessionId: string;
  store: BrainDumpSessionStore;
  storage: BrainDumpSourceStorage;
  now?: () => number;
}): Promise<BrainDumpSourceCleanupResult> {
  const uid = asString(input.uid, 120);
  const sessionId = asString(input.sessionId, 120);
  if (!uid) throw new BrainDumpSourceCleanupError("You must be signed in to continue.", "auth/unauthenticated", 401);
  if (!sessionId) throw new BrainDumpSourceCleanupError("Brain Dump session was not found.", "brain-dump/not-found", 404);

  const session = await input.store.getSession(uid, sessionId);
  if (!session || session.ownerUid !== uid || session.id !== sessionId) {
    throw new BrainDumpSourceCleanupError("Brain Dump session was not found.", "brain-dump/not-found", 404);
  }

  const currentMs = nowMs(input.now);
  const files = session.source.files || [];
  let deletedCount = 0;
  let failedCount = 0;
  let changed = false;

  const nextFiles: BrainDumpSourceFile[] = [];
  for (const file of files) {
    if (!fileIsDue(file, currentMs)) {
      nextFiles.push(file);
      continue;
    }

    if (!sourcePathIsOwned(uid, sessionId, file.path)) {
      failedCount += 1;
      changed = true;
      nextFiles.push({
        ...file,
        cleanupStatus: "delete_failed",
        cleanupErrorCode: "source-path-not-owned",
        lastCleanupAttemptAtMs: currentMs,
      });
      continue;
    }

    try {
      await input.storage.deleteObject(file.path);
      deletedCount += 1;
      changed = true;
      nextFiles.push({
        ...file,
        cleanupStatus: "deleted",
        cleanupErrorCode: undefined,
        deletedAtMs: currentMs,
        lastCleanupAttemptAtMs: currentMs,
      });
    } catch {
      failedCount += 1;
      changed = true;
      nextFiles.push({
        ...file,
        cleanupStatus: "delete_failed",
        cleanupErrorCode: "storage-delete-failed",
        lastCleanupAttemptAtMs: currentMs,
      });
    }
  }

  if (changed) {
    const nextSession: BrainDumpReviewSession = {
      ...session,
      source: {
        ...session.source,
        files: nextFiles,
      },
    };
    await input.store.saveSession(nextSession);
  }

  return {
    sessionId,
    deletedCount,
    failedCount,
    pendingCount: pendingFiles(nextFiles, currentMs),
    retryable: failedCount > 0,
  };
}
