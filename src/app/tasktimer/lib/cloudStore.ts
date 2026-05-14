import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";

import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { validateUsername } from "@/lib/username";
import { claimUsernameClient } from "./usernameClaim";
import { normalizeTaskTimerPlan, type TaskTimerPlan } from "./entitlements";
import { normalizeCompletionDifficulty } from "./completionDifficulty";
import { patchLeaderboardProfileFromUserRoot } from "./leaderboard";
import {
  getTaskPlannedStartByDay,
  normalizeLocalDateValue,
  normalizeScheduleStoredTime,
  normalizeTaskPlannedStartByDay,
  SCHEDULE_DAY_ORDER,
  syncLegacyPlannedStartFields,
  type ScheduleDay,
} from "./schedule-placement";

import {
  normalizeTaskStatusState,
  type DeletedTaskMeta,
  type HistoryByTaskId,
  type HistoryEntry,
  type LiveSessionsByTaskId,
  type LiveTaskSession,
  type Task,
} from "./types";
import { DEFAULT_REWARD_PROGRESS, normalizeRewardProgress, type RewardProgressV1 } from "./rewards";
import {
  DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME,
  DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME,
  normalizeTimeOfDay,
} from "./productivityPeriod";
import { normalizeStartupModule, type StartupModulePreference } from "./startupModule";

export type UserPreferencesV1 = {
  schemaVersion: 1;
  theme: "purple" | "cyan" | "lime";
  menuButtonStyle: "parallelogram" | "square";
  startupModule: StartupModulePreference;
  taskView: "list" | "tile";
  taskOrderBy: "custom" | "alpha" | "schedule";
  dynamicColorsEnabled: boolean;
  autoFocusOnTaskLaunchEnabled: boolean;
  mobilePushAlertsEnabled: boolean;
  webPushAlertsEnabled: boolean;
  checkpointAlertSoundEnabled: boolean;
  checkpointAlertToastEnabled: boolean;
  checkpointAlertSoundMode: "once" | "repeat";
  checkpointAlertToastMode: "auto5s" | "manual";
  optimalProductivityStartTime: string;
  optimalProductivityEndTime: string;
  rewards: RewardProgressV1;
  updatedAtMs: number;
};

export type DashboardConfig = {
  order: string[];
  widgets?: Record<string, unknown>;
};

export type TaskUiConfig = {
  historyRangeDaysByTaskId: Record<string, 7 | 14>;
  historyRangeModeByTaskId: Record<string, "entries" | "day">;
  pinnedHistoryTaskIds: string[];
  customTaskNames?: string[];
};

export type WorkspaceSnapshot = {
  plan: TaskTimerPlan;
  tasks: Task[];
  historyByTaskId: HistoryByTaskId;
  liveSessionsByTaskId: LiveSessionsByTaskId;
  deletedTaskMeta: DeletedTaskMeta;
  preferences: UserPreferencesV1 | null;
  dashboard: DashboardConfig | null;
  taskUi: TaskUiConfig | null;
};

function describeError(error: unknown): Record<string, unknown> {
  if (!error) return { value: error };
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown; customData?: unknown; status?: unknown; logId?: unknown };
    return {
      name: error.name,
      message: error.message,
      code: typeof withCode.code === "string" ? withCode.code : withCode.code,
      status: typeof withCode.status === "number" ? withCode.status : withCode.status,
      logId: typeof withCode.logId === "string" ? withCode.logId : withCode.logId,
      stack: error.stack || null,
      customData: withCode.customData ?? null,
    };
  }
  if (typeof error === "object") {
    const source = error as Record<string, unknown>;
    const describedObject: Record<string, unknown> = {};
    if (typeof source.name === "string" && source.name.trim()) describedObject.name = source.name;
    if (typeof source.message === "string" && source.message.trim()) describedObject.message = source.message;
    if ("code" in source) describedObject.code = source.code;
    if ("status" in source) describedObject.status = source.status;
    if ("logId" in source) describedObject.logId = source.logId;
    if ("stack" in source) describedObject.stack = source.stack ?? null;
    if ("customData" in source) describedObject.customData = source.customData ?? null;
    try {
      const spreadObject = { ...source };
      return Object.keys(spreadObject).length ? { ...describedObject, ...spreadObject } : Object.keys(describedObject).length ? describedObject : { value: String(error) };
    } catch {
      return Object.keys(describedObject).length ? describedObject : { value: String(error) };
    }
  }
  return { value: error };
}

function isPermissionDeniedError(error: unknown): boolean {
  const described = describeError(error);
  const code = String(described.code || "").trim().toLowerCase();
  const message = String(described.message || "").trim().toLowerCase();
  return code === "permission-denied" || message.includes("missing or insufficient permissions");
}

async function safeGetDoc<T>(
  work: () => Promise<T>,
  fallback: T,
  context: string,
  meta?: Record<string, unknown>
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      const describedError = describeError(error);
      console.warn(`[tasktimer-cloud] Falling back after ${context} read failure`, {
        ...(meta || {}),
        error: describedError,
        permissionDenied: isPermissionDeniedError(error),
      });
    }
    return fallback;
  }
}

async function safeGetDocsArray<T>(
  work: () => Promise<{ docs: T[] }>,
  context: string,
  meta?: Record<string, unknown>
): Promise<T[]> {
  const snapshot = await safeGetDoc(work, null as { docs: T[] } | null, context, meta);
  return Array.isArray(snapshot?.docs) ? snapshot.docs : [];
}

const userRootPermissionWarnedUids = new Set<string>();
const IDENTITY_SYNC_RECENT_WINDOW_MS = 60_000;
const IDENTITY_SYNC_DEFERRED_WINDOW_MS = 10 * 60_000;
const USER_PROFILE_BOOTSTRAP_RECENT_WINDOW_MS = 60_000;
const inFlightIdentitySyncByKey = new Map<string, Promise<void>>();
const lastSuccessfulIdentitySyncAtByKey = new Map<string, number>();
const lastDeferredIdentitySyncAtByKey = new Map<string, number>();
const lastDeferredIdentitySyncWarningAtByKey = new Map<string, number>();
const inFlightUserProfileBootstrapByUid = new Map<string, Promise<void>>();
const lastUserProfileBootstrapAtByUid = new Map<string, number>();

function normalizeIdentitySyncValue(value: string | null | undefined): string {
  return String(value || "").trim();
}

function identitySyncRequestKey(uid: string, email: string | null | undefined, prevEmail: string | null | undefined, displayName: string | null | undefined): string {
  return [
    normalizeIdentitySyncValue(uid),
    normalizeIdentitySyncValue(email).toLowerCase(),
    normalizeIdentitySyncValue(prevEmail).toLowerCase(),
    normalizeIdentitySyncValue(displayName),
  ].join("|");
}

function isExpectedIdentitySyncError(error: unknown): boolean {
  const described = describeError(error);
  const code = String(described.code || "").trim().toLowerCase();
  const message = String(described.message || "").trim().toLowerCase();
  const status = Number(described.status || 0) || null;
  return (
    code === "account/sync-identity-rate-limited" ||
    code === "auth/unauthenticated" ||
    code === "auth/admin-config-missing" ||
    code === "auth/invalid-session" ||
    status === 503 ||
    message.includes("too many identity sync attempts recently") ||
    message.includes("you must be signed in to continue") ||
    message.includes("firebase admin credentials are not configured") ||
    message.includes("your sign-in session is no longer valid")
  );
}

export async function buildIdentitySyncResponseError(response: Response): Promise<Error & {
  code?: string;
  status?: number | null;
  logId?: string;
}> {
  const responseText = await response.text().catch(() => "");
  const payload = ((): { error?: string; code?: string; logId?: string } => {
    if (!responseText) return {};
    try {
      return JSON.parse(responseText) as { error?: string; code?: string; logId?: string };
    } catch {
      return { error: responseText };
    }
  })();
  const status = Number(response.status || 0) || null;
  const code = String(payload.code || "").trim();
  const logId = String(payload.logId || "").trim();
  const message = String(payload.error || "").trim() || "Could not sync user identity lookup.";
  const nextError = new Error(status ? `${message} (status ${status})` : message) as Error & {
    code?: string;
    status?: number | null;
    logId?: string;
  };
  if (code) nextError.code = code;
  if (status) nextError.status = status;
  if (logId) nextError.logId = logId;
  return nextError;
}

function dispatchCloudSyncNotice(error: unknown) {
  if (typeof window === "undefined") return;
  const described = describeError(error);
  const code = String(described.code || "").trim();
  const status = Number(described.status || 0) || null;
  const logId = String(described.logId || "").trim();
  if (code !== "account/sync-identity-rate-limited") return;
  window.dispatchEvent(
    new CustomEvent("tasktimer:cloud-sync-notice", {
      detail: {
        code,
        message: "Account sync is temporarily limited. Your task was saved locally and will retry later.",
        logId: logId || undefined,
        status: status || undefined,
        retryable: true,
      },
    })
  );
}

function dbOrNull() {
  return getFirebaseFirestoreClient();
}

function usersDoc(uid: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid);
}

function taskDoc(uid: string, taskId: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid, "tasks", taskId);
}

function scheduledTimeGoalPushDoc(uid: string, taskId: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "scheduled_time_goal_pushes", `${uid}__${taskId}`);
}

function tasksCollection(uid: string) {
  const db = dbOrNull();
  if (!db) return null;
  return collection(db, "users", uid, "tasks");
}

function userHistoryCollection(uid: string) {
  const db = dbOrNull();
  if (!db) return null;
  return collection(db, "users", uid, "historyEntries");
}

function taskHistoryCollection(uid: string, taskId: string) {
  const db = dbOrNull();
  if (!db) return null;
  return collection(db, "users", uid, "tasks", taskId, "history");
}

function taskLiveSessionDoc(uid: string, taskId: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid, "tasks", taskId, "activeSession", "current");
}

function normalizeHistoryEntryRecord(row: unknown): HistoryEntry | null {
  if (!row || typeof row !== "object") return null;
  const next: HistoryEntry = {
    ts: Number.isFinite(Number((row as HistoryEntry).ts)) ? Math.floor(Number((row as HistoryEntry).ts)) : 0,
    name: String((row as HistoryEntry).name || ""),
    ms: Number.isFinite(Number((row as HistoryEntry).ms)) ? Math.max(0, Math.floor(Number((row as HistoryEntry).ms))) : 0,
  };
  const color = (row as HistoryEntry).color;
  const note = (row as HistoryEntry).note;
  const sessionId = (row as HistoryEntry).sessionId;
  const completionDifficulty = normalizeCompletionDifficulty((row as HistoryEntry).completionDifficulty);
  if (typeof color === "string" && color.trim()) next.color = color;
  if (typeof note === "string" && note.trim()) next.note = note.trim();
  if (completionDifficulty) next.completionDifficulty = completionDifficulty;
  if (typeof sessionId === "string" && sessionId.trim()) next.sessionId = sessionId.trim();
  return next;
}

function normalizeCanonicalHistoryEntryRecord(row: unknown): { taskId: string; entry: HistoryEntry } | null {
  if (!row || typeof row !== "object") return null;
  const taskId = String((row as { taskId?: unknown }).taskId || "").trim();
  if (!taskId) return null;
  const entry = normalizeHistoryEntryRecord(row);
  if (!entry) return null;
  return { taskId, entry };
}

function normalizeLiveTaskSessionRecord(taskIdRaw: string, row: unknown): LiveTaskSession | null {
  if (!row || typeof row !== "object") return null;
  const taskId = String((row as LiveTaskSession).taskId || taskIdRaw || "").trim();
  const sessionId = String((row as LiveTaskSession).sessionId || "").trim();
  if (!taskId || !sessionId) return null;
  const startedAtMs = Number.isFinite(Number((row as LiveTaskSession).startedAtMs)) ? Math.max(0, Math.floor(Number((row as LiveTaskSession).startedAtMs))) : 0;
  const updatedAtMs = Number.isFinite(Number((row as LiveTaskSession).updatedAtMs))
    ? Math.max(startedAtMs, Math.floor(Number((row as LiveTaskSession).updatedAtMs)))
    : startedAtMs;
  const elapsedMs = Number.isFinite(Number((row as LiveTaskSession).elapsedMs)) ? Math.max(0, Math.floor(Number((row as LiveTaskSession).elapsedMs))) : 0;
  const resumedFromMs = Number.isFinite(Number((row as LiveTaskSession).resumedFromMs)) ? Math.max(0, Math.floor(Number((row as LiveTaskSession).resumedFromMs))) : 0;
  const name = String((row as LiveTaskSession).name || "").trim() || "Task";
  const note = typeof (row as LiveTaskSession).note === "string" ? String((row as LiveTaskSession).note).trim() : "";
  const color = typeof (row as LiveTaskSession).color === "string" ? String((row as LiveTaskSession).color).trim() : "";
  return {
    sessionId,
    taskId,
    name,
    startedAtMs,
    updatedAtMs,
    elapsedMs,
    ...(resumedFromMs > 0 ? { resumedFromMs } : {}),
    status: "running",
    ...(note ? { note } : {}),
    ...(color ? { color } : {}),
  };
}

function mergeCanonicalAndLegacyHistory(canonical: HistoryByTaskId, legacy: HistoryByTaskId): HistoryByTaskId {
  const next: HistoryByTaskId = {};
  const taskIds = new Set([...Object.keys(canonical || {}), ...Object.keys(legacy || {})].filter(Boolean));
  taskIds.forEach((taskId) => {
    const rows: HistoryEntry[] = [];
    const seen = new Set<string>();
    [...(Array.isArray(canonical?.[taskId]) ? canonical[taskId] : []), ...(Array.isArray(legacy?.[taskId]) ? legacy[taskId] : [])].forEach((row) => {
      const normalized = normalizeHistoryEntryRecord(row);
      if (!normalized) return;
      const key = buildCanonicalHistoryEntryDocId(taskId, normalized);
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(normalized);
    });
    rows.sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
    if (rows.length) next[taskId] = rows;
  });
  return next;
}

async function migrateLegacyHistoryToCanonical(
  uid: string,
  legacyHistoryByTaskId: HistoryByTaskId,
  existingCanonicalDocIds: Set<string>
): Promise<void> {
  const col = userHistoryCollection(uid);
  const db = dbOrNull();
  if (!col || !db) return;
  const writes: Array<{ id: string; payload: HistoryDocPayload }> = [];
  Object.entries(legacyHistoryByTaskId || {}).forEach(([taskId, rows]) => {
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const normalized = normalizeHistoryEntryRecord(row);
      if (!normalized) return;
      const id = buildCanonicalHistoryEntryDocId(taskId, normalized);
      if (existingCanonicalDocIds.has(id)) return;
      existingCanonicalDocIds.add(id);
      writes.push({ id, payload: buildHistoryDocPayload(taskId, normalized) });
    });
  });
  const maxOpsPerBatch = 400;
  for (let index = 0; index < writes.length; index += maxOpsPerBatch) {
    const batch = writeBatch(db);
    writes.slice(index, index + maxOpsPerBatch).forEach((write) => {
      batch.set(doc(col, write.id), {
        ...write.payload,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }
}

async function deleteRemovedLegacyHistoryRows(uid: string, taskId: string, desiredCanonicalIds: Set<string>): Promise<void> {
  const legacyCol = taskHistoryCollection(uid, taskId);
  const db = dbOrNull();
  if (!legacyCol || !db) return;
  const legacy = await safeGetDocsArray(
    () => getDocs(legacyCol),
    "legacy task history cleanup",
    { uid, taskId }
  );
  const refsToDelete = legacy
    .map((row) => {
      const normalized = normalizeHistoryEntryRecord(row.data());
      if (!normalized) return null;
      const canonicalId = buildCanonicalHistoryEntryDocId(taskId, normalized);
      return desiredCanonicalIds.has(canonicalId) ? null : doc(legacyCol, row.id);
    })
    .filter((ref): ref is NonNullable<typeof ref> => !!ref);
  const maxOpsPerBatch = 400;
  for (let index = 0; index < refsToDelete.length; index += maxOpsPerBatch) {
    const batch = writeBatch(db);
    refsToDelete.slice(index, index + maxOpsPerBatch).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

function deletedTaskDoc(uid: string, taskId: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid, "deletedTasks", taskId);
}

function preferencesDoc(uid: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid, "preferences", "v1");
}

function dashboardDoc(uid: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid, "dashboard", "v1");
}

function taskUiDoc(uid: string) {
  const db = dbOrNull();
  if (!db) return null;
  return doc(db, "users", uid, "taskUi", "v1");
}

function normalizeEmail(raw: unknown): string {
  return String(raw || "").trim().toLowerCase();
}

const USER_ROOT_ALLOWED_KEYS = new Set([
  "email",
  "displayName",
  "username",
  "usernameKey",
  "avatarId",
  "avatarCustomSrc",
  "googlePhotoUrl",
  "rankThumbnailSrc",
  "rewardCurrentRankId",
  "rewardTotalXp",
  "plan",
  "planUpdatedAt",
  "createdAt",
  "updatedAt",
  "schemaVersion",
]);

function pickSupportedUserRootFields(data: Record<string, unknown> | null): Record<string, unknown> {
  if (!data) return {};
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (USER_ROOT_ALLOWED_KEYS.has(key)) {
      next[key] = value;
    }
  }
  return next;
}

function isTimestampLike(value: unknown): boolean {
  return !!value && typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function";
}

function sanitizeUserRootFieldsForClientWrite(data: Record<string, unknown> | null): Record<string, unknown> {
  const source = pickSupportedUserRootFields(data);
  const next: Record<string, unknown> = {};

  if (typeof source.email === "string") next.email = source.email;
  if (
    source.displayName === null ||
    typeof source.displayName === "string"
  ) {
    next.displayName = source.displayName;
  }
  if (source.username === null || typeof source.username === "string") next.username = source.username;
  if (source.usernameKey === null || typeof source.usernameKey === "string") next.usernameKey = source.usernameKey;
  if (typeof source.avatarId === "string") next.avatarId = source.avatarId;
  if (source.avatarCustomSrc === null || typeof source.avatarCustomSrc === "string") next.avatarCustomSrc = source.avatarCustomSrc;
  if (source.googlePhotoUrl === null || typeof source.googlePhotoUrl === "string") next.googlePhotoUrl = source.googlePhotoUrl;
  if (source.rankThumbnailSrc === null || typeof source.rankThumbnailSrc === "string") next.rankThumbnailSrc = source.rankThumbnailSrc;
  if (source.rewardCurrentRankId === null || typeof source.rewardCurrentRankId === "string") {
    next.rewardCurrentRankId = source.rewardCurrentRankId;
  }
  if (Number.isInteger(source.rewardTotalXp)) next.rewardTotalXp = source.rewardTotalXp;
  if (source.plan === "free" || source.plan === "pro") next.plan = source.plan;
  if (isTimestampLike(source.planUpdatedAt)) next.planUpdatedAt = source.planUpdatedAt;
  if (isTimestampLike(source.createdAt)) next.createdAt = source.createdAt;
  if (isTimestampLike(source.updatedAt)) next.updatedAt = source.updatedAt;
  if (Number.isInteger(source.schemaVersion)) next.schemaVersion = source.schemaVersion;

  return next;
}

function normalizeUserRootPatchForClientWrite(patch: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return sanitizeUserRootFieldsForClientWrite(patch || null);
}

function patchTouchesIdentityFields(patch: Record<string, unknown>): boolean {
  return "email" in patch || "displayName" in patch;
}

function getUnsupportedUserRootKeys(data: Record<string, unknown> | null): string[] {
  if (!data) return [];
  return Object.keys(data).filter((key) => !USER_ROOT_ALLOWED_KEYS.has(key));
}

function sanitizeUsernameCandidate(raw: unknown): string {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  const cleaned = value
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 20);
}

function buildUsernameClaimCandidates(uid: string, displayName: string, email: string): string[] {
  const uidSuffix = String(uid || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(-6) || "user";
  const emailLocalPart = String(email || "").trim().split("@")[0] || "";
  const baseCandidates = [
    sanitizeUsernameCandidate(displayName),
    sanitizeUsernameCandidate(emailLocalPart),
  ].filter(Boolean);
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: string) => {
    const next = String(candidate || "").trim().toLowerCase();
    if (!next || seen.has(next)) return;
    seen.add(next);
    candidates.push(next);
  };

  for (const base of baseCandidates) {
    pushCandidate(base);
    if (base.length >= 3) {
      pushCandidate(`${base.slice(0, Math.max(0, 20 - uidSuffix.length - 1))}_${uidSuffix}`);
    }
  }

  pushCandidate(`user_${uidSuffix}`);
  return candidates.filter((candidate) => !validateUsername(candidate));
}

async function claimMissingUsername(uid: string): Promise<void> {
  if (typeof window === "undefined" || !uid) return;
  const auth = getFirebaseAuthClient();
  const currentUser = auth?.currentUser || null;
  if (!currentUser || String(currentUser.uid || "").trim() !== uid) return;

  const displayName = String(currentUser.displayName || "").trim();
  const email = String(currentUser.email || "").trim().toLowerCase();
  const candidates = buildUsernameClaimCandidates(uid, displayName, email);
  if (!candidates.length) return;

  for (const username of candidates) {
    try {
      await claimUsernameClient(username);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (
        message === "That username is already taken."
        || message === "Username is required."
        || message === "Username must be 3 to 20 characters and use only letters, numbers, or underscores."
        || message === "That username is reserved. Please choose another."
      ) {
        continue;
      }
      return;
    }
  }
}

async function syncUserIdentityIndex(uid: string, options?: { prevEmail?: string | null; displayName?: string | null }): Promise<void> {
  if (!uid) return;
  const auth = getFirebaseAuthClient();
  const currentUser = auth?.currentUser || null;
  const idToken = await currentUser?.getIdToken();
  const authEmail = normalizeEmail(currentUser?.email);
  const authDisplayName =
    options?.displayName !== undefined
      ? options.displayName
      : currentUser?.displayName == null
        ? null
        : String(currentUser.displayName || "").trim() || null;
  if (!idToken) return;
  const requestKey = identitySyncRequestKey(uid, authEmail, options?.prevEmail || null, authDisplayName);
  const now = Date.now();
  const lastSuccessAt = lastSuccessfulIdentitySyncAtByKey.get(requestKey) || 0;
  if (now - lastSuccessAt < IDENTITY_SYNC_RECENT_WINDOW_MS) return;
  const lastDeferredAt = lastDeferredIdentitySyncAtByKey.get(requestKey) || 0;
  if (now - lastDeferredAt < IDENTITY_SYNC_DEFERRED_WINDOW_MS) return;
  const inFlight = inFlightIdentitySyncByKey.get(requestKey);
  if (inFlight) {
    await inFlight;
    return;
  }
  const syncPromise = (async () => {
  try {
    const response = await fetch("/api/account/sync-identity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-firebase-auth": idToken,
      },
      body: JSON.stringify({
        prevEmail: options?.prevEmail || null,
        displayName: authDisplayName,
      }),
    });
    if (!response.ok) {
      throw await buildIdentitySyncResponseError(response);
    }
    lastSuccessfulIdentitySyncAtByKey.set(requestKey, Date.now());
    lastDeferredIdentitySyncAtByKey.delete(requestKey);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      if (isExpectedIdentitySyncError(error)) {
        const deferredAt = Date.now();
        const lastWarningAt = lastDeferredIdentitySyncWarningAtByKey.get(requestKey) || 0;
        lastDeferredIdentitySyncAtByKey.set(requestKey, deferredAt);
        if (deferredAt - lastWarningAt >= IDENTITY_SYNC_DEFERRED_WINDOW_MS) {
          lastDeferredIdentitySyncWarningAtByKey.set(requestKey, deferredAt);
          console.warn("[tasktimer-cloud] Deferred account identity index sync", {
            uid,
            email: authEmail || null,
            prevEmail: options?.prevEmail || null,
            retryAfterMs: IDENTITY_SYNC_DEFERRED_WINDOW_MS,
            error: describeError(error),
          });
        }
      } else {
        console.error("[tasktimer-cloud] Failed to sync account identity index", {
          uid,
          email: authEmail || null,
          prevEmail: options?.prevEmail || null,
          error: describeError(error),
        });
      }
    }
    throw error;
  } finally {
    inFlightIdentitySyncByKey.delete(requestKey);
  }
  })();
  inFlightIdentitySyncByKey.set(requestKey, syncPromise);
  await syncPromise;
}

type UserRootWriteOptions = {
  patch?: Record<string, unknown>;
  includeAuthIdentity?: boolean;
  skipIdentitySync?: boolean;
  permissionDeniedIsNonFatal?: boolean;
  permissionWarningKey?: string;
  failureContext?: string;
};

type UserRootWriteResult = {
  wrote: boolean;
  rootReadable: boolean;
};

function warnUserRootPermissionDeniedOnce(
  warningKey: string,
  details: {
    uid: string;
    hasEmail: boolean;
    patchKeys: string[];
    error: Record<string, unknown>;
    context: string;
  }
) {
  if (process.env.NODE_ENV === "production") return;
  const normalizedKey = String(warningKey || "").trim();
  if (!normalizedKey || userRootPermissionWarnedUids.has(normalizedKey)) return;
  userRootPermissionWarnedUids.add(normalizedKey);
  console.warn(`[tasktimer-cloud] ${details.context} denied by current rules; continuing without write`, {
    uid: details.uid,
    hasEmail: details.hasEmail,
    patchKeys: details.patchKeys,
    error: details.error,
  });
}

async function writeUserRootDocument(uid: string, options?: UserRootWriteOptions): Promise<UserRootWriteResult> {
  const root = usersDoc(uid);
  if (!root) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Skipping user root write because document ref is unavailable", {
        uid,
      });
    }
    return { wrote: false, rootReadable: false };
  }
  const db = dbOrNull();
  if (!db) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Skipping user root write because Firestore is unavailable", {
        uid,
      });
    }
    return { wrote: false, rootReadable: false };
  }

  const auth = getFirebaseAuthClient();
  const currentUser = auth?.currentUser || null;
  const authEmail = normalizeEmail(currentUser?.email);
  const authDisplayName = currentUser?.displayName == null ? null : String(currentUser.displayName || "").trim() || null;
  const existing = await getDoc(root);
  const existingData = existing.exists() ? (existing.data() as Record<string, unknown>) : null;
  const prevEmail = normalizeEmail(existingData?.email);
  const existingPlan = normalizeTaskTimerPlan(existingData?.plan);
  const existingCreatedAt = existingData?.createdAt;
  const unsupportedKeys = getUnsupportedUserRootKeys(existingData);
  const sanitizedPatch = normalizeUserRootPatchForClientWrite(options?.patch);
  const nextEmail =
    typeof sanitizedPatch.email === "string"
      ? normalizeEmail(sanitizedPatch.email)
      : (options?.includeAuthIdentity ? authEmail : prevEmail);
  const nextDisplayName =
    "displayName" in sanitizedPatch
      ? (sanitizedPatch.displayName == null ? null : String(sanitizedPatch.displayName || "").trim() || null)
      : (options?.includeAuthIdentity ? authDisplayName : (existingData?.displayName == null ? null : String(existingData.displayName || "").trim() || null));
  const shouldSyncIdentity =
    !!nextEmail &&
    (
      options?.includeAuthIdentity === true ||
      patchTouchesIdentityFields(sanitizedPatch) ||
      !prevEmail ||
      prevEmail !== nextEmail ||
      normalizeIdentitySyncValue(existingData?.displayName == null ? null : String(existingData.displayName || "").trim() || null) !== normalizeIdentitySyncValue(nextDisplayName)
    );
  const payload = {
    ...sanitizeUserRootFieldsForClientWrite(existingData),
    ...sanitizedPatch,
    plan: existingPlan,
    ...(options?.includeAuthIdentity && authEmail ? { email: authEmail } : {}),
    ...(options?.includeAuthIdentity ? { displayName: authDisplayName } : {}),
    createdAt: isTimestampLike(existingCreatedAt) ? existingCreatedAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
  };

  try {
    if (unsupportedKeys.length && process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Sanitizing legacy user root fields before write", {
        uid,
        unsupportedKeys,
      });
    }
    if (unsupportedKeys.length) {
      await setDoc(root, payload);
    } else {
      await setDoc(root, payload, { merge: true });
    }
    if (shouldSyncIdentity && !options?.skipIdentitySync) {
      await syncUserIdentityIndex(uid, {
        prevEmail: prevEmail || null,
        displayName: nextDisplayName,
      }).catch((error) => {
        dispatchCloudSyncNotice(error);
        if (process.env.NODE_ENV !== "production" && !isExpectedIdentitySyncError(error)) {
          console.warn("[tasktimer-cloud] Continuing without account identity sync", {
            uid,
            error: describeError(error),
          });
        }
      });
    }
    return { wrote: true, rootReadable: true };
  } catch (error) {
    const failureContext = String(options?.failureContext || "User root write").trim() || "User root write";
    if (isPermissionDeniedError(error)) {
      if (options?.permissionDeniedIsNonFatal) {
        warnUserRootPermissionDeniedOnce(options?.permissionWarningKey || uid, {
          uid,
          hasEmail: !!authEmail,
          patchKeys: Object.keys(sanitizedPatch),
          error: describeError(error),
          context: failureContext,
        });
        return { wrote: false, rootReadable: false };
      }
    }
    if (process.env.NODE_ENV !== "production") {
      console.error(`[tasktimer-cloud] Failed to ${failureContext.toLowerCase()}`, {
        uid,
        hasEmail: !!authEmail,
        patchKeys: Object.keys(sanitizedPatch),
        error: describeError(error),
      });
    }
    throw error;
  }
}

function asBool(v: unknown, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

function asString(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function normalizeTimeGoalUnit(raw: unknown): "minute" | "hour" {
  return raw === "minute" ? "minute" : "hour";
}

function normalizeTimeGoalPeriod(raw: unknown): "day" | "week" {
  return raw === "day" ? "day" : "week";
}

function normalizeTimeGoalValue(raw: unknown): number {
  return Number.isFinite(Number(raw)) ? Math.max(0, Number(raw)) : 0;
}

function normalizeNullableInt(raw: unknown): number | null {
  return Number.isFinite(Number(raw)) ? Math.floor(Number(raw)) : null;
}

function normalizePlannedStartDay(raw: unknown): Task["plannedStartDay"] {
  const value = String(raw || "").trim().toLowerCase();
  return value === "mon" ||
    value === "tue" ||
    value === "wed" ||
    value === "thu" ||
    value === "fri" ||
    value === "sat" ||
    value === "sun"
    ? value
    : null;
}

function normalizeDayTimeGoalMinutes(task: Task): number | null {
  if (!task.timeGoalEnabled || task.timeGoalPeriod !== "day") return null;
  const minutes = normalizeTimeGoalValue(task.timeGoalMinutes);
  return minutes > 0 ? Math.floor(minutes) : null;
}

function computePlannedStartPushDueAtMs(task: Task): number | null {
  if (task.plannedStartPushRemindersEnabled === false) return null;
  const byDay = getTaskPlannedStartByDay(task);
  if (!byDay) return null;
  const dayMap: Record<ScheduleDay, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const now = new Date();
  let nextDueAtMs: number | null = null;
  for (const day of SCHEDULE_DAY_ORDER) {
    const time = normalizeScheduleStoredTime(byDay[day]);
    if (!time) continue;
    const [, rawHours = "0", rawMinutes = "0"] = time.match(/^(\d{1,2}):(\d{2})$/) || [];
    const hours = Math.max(0, Math.min(23, Number(rawHours || 0)));
    const minutes = Math.max(0, Math.min(59, Number(rawMinutes || 0)));
    const scheduled = new Date(now);
    const diffDays = (dayMap[day] - scheduled.getDay() + 7) % 7;
    scheduled.setDate(scheduled.getDate() + diffDays);
    scheduled.setHours(hours, minutes, 0, 0);
    if (scheduled.getTime() <= now.getTime()) {
      scheduled.setDate(scheduled.getDate() + 7);
    }
    const dueAtMs = scheduled.getTime();
    if (nextDueAtMs == null || dueAtMs < nextDueAtMs) nextDueAtMs = dueAtMs;
  }
  return nextDueAtMs;
}

function computeTimeGoalCompletePushDueAtMs(task: Task): number | null {
  if (!task.running || !task.timeGoalEnabled) return null;
  const timeGoalMinutes = normalizeTimeGoalValue(task.timeGoalMinutes);
  if (!(timeGoalMinutes > 0)) return null;
  const startMs = normalizeNullableInt(task.startMs);
  if (startMs == null) return null;
  const accumulatedMs = Number.isFinite(Number(task.accumulatedMs)) ? Math.max(0, Math.floor(Number(task.accumulatedMs))) : 0;
  const remainingMs = Math.max(0, Math.floor(timeGoalMinutes * 60_000) - accumulatedMs);
  return startMs + remainingMs;
}

function isUnscheduledGapPushCandidate(task: Task): boolean {
  return (
    normalizeDayTimeGoalMinutes(task) != null &&
    !getTaskPlannedStartByDay(task) &&
    task.plannedStartOpenEnded !== true
  );
}

async function syncScheduledTimeGoalPush(uid: string, task: Task): Promise<void> {
  const taskId = String(task.id || "").trim();
  const ref = scheduledTimeGoalPushDoc(uid, taskId);
  if (!ref || !taskId) return;

  const plannedStartDueAtMs = computePlannedStartPushDueAtMs(task);
  const unscheduledGapCandidate = isUnscheduledGapPushCandidate(task);
  const timeGoalCompleteDueAtMs = computeTimeGoalCompletePushDueAtMs(task);
  const fallbackDueAtMs = plannedStartDueAtMs ?? (unscheduledGapCandidate ? Date.now() : null);
  let effectiveDueAtMs = timeGoalCompleteDueAtMs ?? fallbackDueAtMs;
  if (effectiveDueAtMs == null) {
    try {
      await deleteDoc(ref);
    } catch {
      // Best-effort cleanup; task save remains authoritative.
    }
    return;
  }

  let existing: Awaited<ReturnType<typeof getDoc>> | null = null;
  try {
    existing = await getDoc(ref);
  } catch (error) {
    const describedError = describeError(error);
    const isMissingPreReadDenied =
      describedError.code === "permission-denied" ||
      String(describedError.message || "").toLowerCase().includes("missing or insufficient permissions");
    if (!isMissingPreReadDenied) {
      throw error;
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Scheduled push pre-read denied; treating as first write", {
        uid,
        taskId,
        error: describedError,
        errorMessage: describedError.message ?? null,
        errorCode: describedError.code ?? null,
      });
    }
  }
  const existingDueAtMs = existing?.exists() ? normalizeNullableInt(existing.get("dueAtMs")) : null;
  const existingKind = existing?.exists() ? String(existing.get("notificationKind") || "").trim() : "";
  const existingEffectiveEventType = existing?.exists() ? String(existing.get("effectiveEventType") || existing.get("eventType") || "").trim() : "";
  const preservePendingMissedCheck =
    !!existing?.exists() &&
    plannedStartDueAtMs != null &&
    timeGoalCompleteDueAtMs == null &&
    existingDueAtMs != null &&
    existingKind === "missedScheduledTask" &&
    existingEffectiveEventType === "missedScheduledTask" &&
    normalizeNullableInt(existing.get("missedCheckDueAtMs")) === existingDueAtMs;
  if (preservePendingMissedCheck) effectiveDueAtMs = existingDueAtMs;
  const notificationKind = preservePendingMissedCheck ? "missedScheduledTask" :
    timeGoalCompleteDueAtMs != null ? "timeGoalComplete" : plannedStartDueAtMs != null ? "plannedStart" : "unscheduledGap";
  const preserveSendBookkeeping = !!existing?.exists() && existingDueAtMs === effectiveDueAtMs && existingKind === notificationKind;
  const eventType = preservePendingMissedCheck ? "missedScheduledTask" :
    timeGoalCompleteDueAtMs != null ? "timeGoalComplete" : plannedStartDueAtMs != null ? "plannedStartReminder" : "unscheduledGapReminder";
  const baseEventType = preservePendingMissedCheck ? "plannedStartReminder" : eventType;
  const effectiveEventType = preservePendingMissedCheck ? "missedScheduledTask" : eventType;
  const timeGoalMinutes = normalizeDayTimeGoalMinutes(task);
  const payload = {
    ownerUid: uid,
    taskId,
    taskName: String(task.name || "").trim() || "Task",
    notificationKind,
    eventType,
    baseEventType,
    effectiveEventType,
    dueAtMs: effectiveDueAtMs,
    timeGoalMinutes: timeGoalCompleteDueAtMs != null ? Math.floor(normalizeTimeGoalValue(task.timeGoalMinutes)) : timeGoalMinutes,
    plannedStartDay: normalizePlannedStartDay(task.plannedStartDay),
    plannedStartTime: String(task.plannedStartTime || "").trim() || null,
    plannedStartByDay: normalizeTaskPlannedStartByDay(task.plannedStartByDay),
    plannedStartPushRemindersEnabled: task.plannedStartPushRemindersEnabled !== false,
    route: "/tasklaunch",
    snoozedUntilMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("snoozedUntilMs")) : null,
    sentAtMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("sentAtMs")) : null,
    sentDueAtMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("sentDueAtMs")) : null,
    missedCheckDueAtMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("missedCheckDueAtMs")) : null,
    missedScheduledStartDueAtMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("missedScheduledStartDueAtMs")) : null,
    nextPlannedStartDueAtMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("nextPlannedStartDueAtMs")) : null,
    lastMissedAtMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("lastMissedAtMs")) : null,
    lastMissedDueAtMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("lastMissedDueAtMs")) : null,
    lastActionAtMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("lastActionAtMs")) : null,
    lastActionByDeviceId: preserveSendBookkeeping ? String(existing!.get("lastActionByDeviceId") || "").trim() || null : null,
    lastGapAlertDayKey: preserveSendBookkeeping ? String(existing!.get("lastGapAlertDayKey") || "").trim() || null : null,
    lastGapAlertStartMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("lastGapAlertStartMs")) : null,
    lastGapAlertEndMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("lastGapAlertEndMs")) : null,
    activeGapDayKey: preserveSendBookkeeping ? String(existing!.get("activeGapDayKey") || "").trim() || null : null,
    activeGapStartMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("activeGapStartMs")) : null,
    activeGapEndMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("activeGapEndMs")) : null,
    postponedGapDayKey: preserveSendBookkeeping ? String(existing!.get("postponedGapDayKey") || "").trim() || null : null,
    postponedGapStartMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("postponedGapStartMs")) : null,
    postponedGapEndMs: preserveSendBookkeeping ? normalizeNullableInt(existing!.get("postponedGapEndMs")) : null,
    updatedAt: serverTimestamp(),
    createdAt: existing?.exists() ? existing.get("createdAt") || serverTimestamp() : serverTimestamp(),
    schemaVersion: 1,
  };
  try {
    await setDoc(ref, payload, {merge: true});
  } catch (error) {
    const describedError = describeError(error);
    const shouldRetryLegacy =
      describedError.code === "permission-denied" ||
      String(describedError.message || "").toLowerCase().includes("missing or insufficient permissions");
    if (!shouldRetryLegacy) throw error;
    await setDoc(
      ref,
      {
        ownerUid: uid,
        taskId,
        taskName: String(task.name || "").trim() || "Task",
        eventType,
        dueAtMs: effectiveDueAtMs,
        plannedStartTime: String(task.plannedStartTime || "").trim() || null,
        plannedStartByDay: normalizeTaskPlannedStartByDay(task.plannedStartByDay),
        plannedStartPushRemindersEnabled: task.plannedStartPushRemindersEnabled !== false,
        route: "/tasklaunch",
        sentAtMs: preserveSendBookkeeping ? normalizeNullableInt(existing?.get("sentAtMs")) : null,
        sentDueAtMs: preserveSendBookkeeping ? normalizeNullableInt(existing?.get("sentDueAtMs")) : null,
        updatedAt: serverTimestamp(),
        createdAt: existing?.exists() ? existing.get("createdAt") || serverTimestamp() : serverTimestamp(),
        schemaVersion: 1,
      },
      {merge: true}
    );
  }
}

function normalizeThemeMode(raw: unknown): UserPreferencesV1["theme"] {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "lime") return "lime";
  if (value === "cyan" || value === "command") return "cyan";
  return "purple";
}

function asTaskUi(input: unknown): TaskUiConfig | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  return {
    historyRangeDaysByTaskId: (obj.historyRangeDaysByTaskId as Record<string, 7 | 14>) || {},
    historyRangeModeByTaskId: (obj.historyRangeModeByTaskId as Record<string, "entries" | "day">) || {},
    pinnedHistoryTaskIds: Array.isArray(obj.pinnedHistoryTaskIds) ? (obj.pinnedHistoryTaskIds as string[]) : [],
    customTaskNames: Array.isArray(obj.customTaskNames) ? (obj.customTaskNames as string[]) : [],
  };
}

function mapTaskFromFirestore(taskId: string, raw: Record<string, unknown>): Task {
  const row: Record<string, unknown> = { ...raw };
  row.id = typeof row.id === "string" && row.id ? row.id : taskId;
  delete row.xpDisqualifiedUntilReset;

  const checkpointsEnabled = row.checkpointsEnabled;
  if (typeof checkpointsEnabled === "boolean" && typeof row.milestonesEnabled !== "boolean") {
    row.milestonesEnabled = checkpointsEnabled;
  }

  const checkpointTimeUnit = row.checkpointTimeUnit;
  if (
    (checkpointTimeUnit === "day" || checkpointTimeUnit === "hour" || checkpointTimeUnit === "minute") &&
    row.milestoneTimeUnit !== "day" &&
    row.milestoneTimeUnit !== "hour" &&
    row.milestoneTimeUnit !== "minute"
  ) {
    row.milestoneTimeUnit = checkpointTimeUnit === "minute" ? "minute" : "hour";
  }

  if (Array.isArray(row.checkpoints) && !Array.isArray(row.milestones)) {
    row.milestones = row.checkpoints;
  }
  if (Array.isArray(row.milestones)) {
    row.milestones = row.milestones.map((milestone) => ({
      ...(milestone as Record<string, unknown>),
      alertsEnabled: (milestone as { alertsEnabled?: unknown })?.alertsEnabled !== false,
    }));
  }

  const presetLastCheckpointId = row.presetIntervalLastCheckpointId;
  if (
    (presetLastCheckpointId === null || typeof presetLastCheckpointId === "string") &&
    row.presetIntervalLastMilestoneId === undefined
  ) {
    row.presetIntervalLastMilestoneId = presetLastCheckpointId;
  }

  row.timeGoalAction = "confirmModal";

  row.timeGoalEnabled = !!row.timeGoalEnabled;
  row.timeGoalValue = normalizeTimeGoalValue(row.timeGoalValue);
  row.timeGoalUnit = normalizeTimeGoalUnit(row.timeGoalUnit);
  row.timeGoalPeriod = normalizeTimeGoalPeriod(row.timeGoalPeriod);
  row.timeGoalMinutes = normalizeTimeGoalValue(row.timeGoalMinutes);
  row.timeGoalCompletedDayKey = row.timeGoalCompletedDayKey == null ? null : String(row.timeGoalCompletedDayKey).trim() || null;
  row.timeGoalCompletedAtMs =
    row.timeGoalCompletedAtMs == null || !Number.isFinite(Number(row.timeGoalCompletedAtMs))
      ? null
      : Math.max(0, Math.floor(Number(row.timeGoalCompletedAtMs)));
  row.timeGoalCompletedReason =
    row.timeGoalCompletedReason === "reset" || row.timeGoalCompletedReason === "goal" ? row.timeGoalCompletedReason : null;
  row.timeGoalCompletedElapsedMs =
    row.timeGoalCompletedElapsedMs == null || !Number.isFinite(Number(row.timeGoalCompletedElapsedMs))
      ? null
      : Math.max(0, Math.floor(Number(row.timeGoalCompletedElapsedMs)));
  row.taskType = row.taskType === "once-off" ? "once-off" : "recurring";
  row.onceOffDay = row.taskType === "once-off" ? normalizePlannedStartDay(row.onceOffDay) : null;
  row.onceOffTargetDate = row.taskType === "once-off" ? normalizeLocalDateValue(row.onceOffTargetDate) : null;
  row.plannedStartDay = normalizePlannedStartDay(row.plannedStartDay);
  row.plannedStartTime =
    row.plannedStartTime == null ? null : (typeof row.plannedStartTime === "string" ? row.plannedStartTime : String(row.plannedStartTime));
  row.plannedStartByDay = normalizeTaskPlannedStartByDay(row.plannedStartByDay);
  row.plannedStartOpenEnded = !!row.plannedStartOpenEnded;
  row.plannedStartPushRemindersEnabled = row.plannedStartPushRemindersEnabled !== false;

  syncLegacyPlannedStartFields(row as Task);
  return row as Task;
}

function mapTaskToFirestore(task: Task): Record<string, unknown> {
  const plannedStartPushDueAtMs = computePlannedStartPushDueAtMs(task);

  // Firestore rules for users/{uid}/tasks/{taskId} are strict (`hasOnly(...)`), so
  // only persist explicitly allowed keys to prevent permission-denied on legacy/extra fields.
  const row: Record<string, unknown> = {
    id: String(task.id || ""),
    name: String(task.name || ""),
    order: Number.isFinite(Number(task.order)) ? Math.floor(Number(task.order)) : 0,
    collapsed: !!task.collapsed,
    color: task.color == null ? null : String(task.color),
    accumulatedMs: Number.isFinite(Number(task.accumulatedMs)) ? Math.max(0, Math.floor(Number(task.accumulatedMs))) : 0,
    running: !!task.running,
    startMs: task.startMs == null ? null : (Number.isFinite(Number(task.startMs)) ? Math.floor(Number(task.startMs)) : null),
    hasStarted: !!task.hasStarted,
    checkpointsEnabled: !!task.milestonesEnabled,
    checkpointTimeUnit: task.milestoneTimeUnit === "minute" ? "minute" : "hour",
    checkpoints: Array.isArray(task.milestones)
      ? task.milestones.map((milestone) => ({
          ...milestone,
          alertsEnabled: milestone?.alertsEnabled !== false,
        }))
      : [],
    checkpointSoundEnabled: !!task.checkpointSoundEnabled,
    checkpointSoundMode: task.checkpointSoundMode === "repeat" ? "repeat" : "once",
    checkpointToastEnabled: !!task.checkpointToastEnabled,
    checkpointToastMode: task.checkpointToastMode === "manual" ? "manual" : "auto5s",
    timeGoalAction: "confirmModal",
    presetIntervalsEnabled: !!task.presetIntervalsEnabled,
    presetIntervalValue: Number.isFinite(Number(task.presetIntervalValue)) ? Math.max(0, Number(task.presetIntervalValue)) : 0,
    presetIntervalLastCheckpointId: task.presetIntervalLastMilestoneId == null ? null : String(task.presetIntervalLastMilestoneId),
    presetIntervalNextSeq:
      Number.isFinite(Number(task.presetIntervalNextSeq)) && Number(task.presetIntervalNextSeq) > 0
        ? Math.floor(Number(task.presetIntervalNextSeq))
        : 1,
    timeGoalEnabled: !!task.timeGoalEnabled,
    timeGoalValue: Number.isFinite(Number(task.timeGoalValue)) ? Math.max(0, Number(task.timeGoalValue)) : 0,
    timeGoalUnit: task.timeGoalUnit === "minute" ? "minute" : "hour",
    timeGoalPeriod: task.timeGoalPeriod === "day" ? "day" : "week",
    timeGoalMinutes: Number.isFinite(Number(task.timeGoalMinutes)) ? Math.max(0, Number(task.timeGoalMinutes)) : 0,
    timeGoalCompletedDayKey: task.timeGoalCompletedDayKey == null ? null : String(task.timeGoalCompletedDayKey).trim() || null,
    timeGoalCompletedAtMs:
      task.timeGoalCompletedAtMs == null || !Number.isFinite(Number(task.timeGoalCompletedAtMs))
        ? null
        : Math.max(0, Math.floor(Number(task.timeGoalCompletedAtMs))),
    timeGoalCompletedReason: task.timeGoalCompletedReason === "reset" || task.timeGoalCompletedReason === "goal" ? task.timeGoalCompletedReason : null,
    timeGoalCompletedElapsedMs:
      task.timeGoalCompletedElapsedMs == null || !Number.isFinite(Number(task.timeGoalCompletedElapsedMs))
        ? null
        : Math.max(0, Math.floor(Number(task.timeGoalCompletedElapsedMs))),
    taskType: task.taskType === "once-off" ? "once-off" : "recurring",
    onceOffDay: task.taskType === "once-off" ? normalizePlannedStartDay(task.onceOffDay) : null,
    onceOffTargetDate: task.taskType === "once-off" ? normalizeLocalDateValue(task.onceOffTargetDate) : null,
    plannedStartDay: normalizePlannedStartDay(task.plannedStartDay),
    plannedStartTime:
      task.plannedStartTime == null ? null : String(task.plannedStartTime).trim() || null,
    plannedStartByDay: normalizeTaskPlannedStartByDay(task.plannedStartByDay),
    plannedStartOpenEnded: !!task.plannedStartOpenEnded,
    plannedStartPushRemindersEnabled: task.plannedStartPushRemindersEnabled !== false,
    bgTimeGoalPushEligible: plannedStartPushDueAtMs != null,
    bgTimeGoalPushDueAtMs: plannedStartPushDueAtMs,
  };
  return row;
}

function mapTaskToLegacyFirestore(task: Task): Record<string, unknown> {
  const row = mapTaskToFirestore(task);
  const legacyTimeGoalAction = "confirmModal";
  const { timeGoalAction, bgTimeGoalPushEligible, bgTimeGoalPushDueAtMs, ...legacyRow } = row;
  void timeGoalAction;
  void bgTimeGoalPushEligible;
  void bgTimeGoalPushDueAtMs;
  return {
    ...legacyRow,
    finalCheckpointAction: legacyTimeGoalAction,
  };
}

function mapTaskToCompatibilityFirestore(task: Task): Record<string, unknown> {
  const legacyRow = mapTaskToLegacyFirestore(task);
  const { taskType, onceOffDay, onceOffTargetDate, ...compatibilityRow } = legacyRow;
  void taskType;
  void onceOffDay;
  void onceOffTargetDate;
  return compatibilityRow;
}

export async function saveUserRootPatch(uid: string, patch: Record<string, unknown>): Promise<void> {
  await writeUserRootDocument(uid, {
    patch,
    includeAuthIdentity: false,
    permissionDeniedIsNonFatal: false,
    failureContext: "save user root patch",
  });
  try {
    await patchLeaderboardProfileFromUserRoot(uid, patch);
  } catch (error) {
    if (!isPermissionDeniedError(error)) throw error;
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Skipping leaderboard profile patch due to current rules", {
        uid,
        error: describeError(error),
      });
    }
  }
}

async function upsertUserRoot(uid: string, options?: { skipIdentitySync?: boolean }): Promise<UserRootWriteResult> {
  return writeUserRootDocument(uid, {
    includeAuthIdentity: true,
    skipIdentitySync: options?.skipIdentitySync === true,
    permissionDeniedIsNonFatal: true,
    permissionWarningKey: `${uid}:bootstrap`,
    failureContext: "User root bootstrap",
  });
}

export async function ensureUserProfileIndex(uid: string): Promise<void> {
  if (!uid) return;
  const normalizedUid = String(uid || "").trim();
  const now = Date.now();
  const lastBootstrapAt = lastUserProfileBootstrapAtByUid.get(normalizedUid) || 0;
  if (now - lastBootstrapAt < USER_PROFILE_BOOTSTRAP_RECENT_WINDOW_MS) return;
  const inFlight = inFlightUserProfileBootstrapByUid.get(normalizedUid);
  if (inFlight) {
    await inFlight;
    return;
  }
  const bootstrapPromise = (async () => {
    try {
      try {
        await syncUserIdentityIndex(normalizedUid);
      } catch (error) {
        dispatchCloudSyncNotice(error);
        if (process.env.NODE_ENV !== "production" && !isExpectedIdentitySyncError(error)) {
          console.warn("[tasktimer-cloud] Continuing without account identity bootstrap", {
            uid: normalizedUid,
            error: describeError(error),
          });
        }
        // Account identity bootstrap is best-effort and should not block workspace hydration.
      }
      let rootReadable = false;
      try {
        const result = await upsertUserRoot(normalizedUid, { skipIdentitySync: true });
        rootReadable = result.rootReadable;
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[tasktimer-cloud] Continuing without user root bootstrap", {
            uid: normalizedUid,
            error: describeError(error),
          });
        }
        // Keep email lookup available even if user root sync fails unexpectedly.
      }
      if (!rootReadable) return;
      try {
        const root = usersDoc(normalizedUid);
        if (!root) return;
        const snap = await getDoc(root);
        const usernameKey = snap.exists() ? String(snap.get("usernameKey") || "").trim() : "";
        if (usernameKey) return;
        await claimMissingUsername(normalizedUid);
      } catch {
        // Username bootstrap is best-effort and should not block sign-in/profile indexing.
      }
    } finally {
      lastUserProfileBootstrapAtByUid.set(normalizedUid, Date.now());
      inFlightUserProfileBootstrapByUid.delete(normalizedUid);
    }
  })();
  inFlightUserProfileBootstrapByUid.set(normalizedUid, bootstrapPromise);
  await bootstrapPromise;
}

export async function loadUserWorkspace(uid: string): Promise<WorkspaceSnapshot> {
  const db = dbOrNull();
  if (!db || !uid) {
    return {
      plan: "free",
      tasks: [],
      historyByTaskId: {},
      liveSessionsByTaskId: {},
      deletedTaskMeta: {},
      preferences: null,
      dashboard: null,
      taskUi: null,
    };
  }

  const userRootRef = usersDoc(uid);
  const taskDocs = await safeGetDocsArray(
    () => getDocs(collection(db, "users", uid, "tasks")),
    "tasks collection",
    { uid }
  );
  const tasks: Task[] = [];
  const legacyHistoryByTaskId: HistoryByTaskId = {};
  const liveSessionsByTaskId: LiveSessionsByTaskId = {};
  const historyLoads = taskDocs.map(async (d) => {
    const task = mapTaskFromFirestore(d.id, d.data() as Record<string, unknown>);
    const historyDocs = await safeGetDocsArray(
      () => getDocs(query(collection(db, "users", uid, "tasks", d.id, "history"))),
      "task history collection",
      { uid, taskId: d.id }
    );
    const liveSessionRef = taskLiveSessionDoc(uid, d.id);
    const liveSessionSnap = liveSessionRef
      ? await safeGetDoc(
          () => getDoc(liveSessionRef),
          null as Awaited<ReturnType<typeof getDoc>> | null,
          "live session doc",
          { uid, taskId: d.id }
        )
      : null;
    const history = historyDocs
      .map((h) => normalizeHistoryEntryRecord(h.data()))
      .filter((row): row is HistoryEntry => !!row)
      .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
    const liveSession = liveSessionSnap?.exists() ? normalizeLiveTaskSessionRecord(d.id, liveSessionSnap.data()) : null;
    return { task, taskId: d.id, history, liveSession };
  });

  const [historyRows, canonicalHistoryDocs, deletedSnap, prefSnap, dashboardSnap, taskUiSnap, userRootSnap] = await Promise.all([
    Promise.all(historyLoads),
    safeGetDocsArray(
      () => getDocs(collection(db, "users", uid, "historyEntries")),
      "canonical history collection",
      { uid }
    ),
    safeGetDocsArray(
      () => getDocs(collection(db, "users", uid, "deletedTasks")),
      "deleted tasks collection",
      { uid }
    ),
    preferencesDoc(uid)
      ? safeGetDoc(
          () => getDoc(preferencesDoc(uid)!),
          null as Awaited<ReturnType<typeof getDoc>> | null,
          "preferences doc",
          { uid }
        )
      : Promise.resolve(null),
    dashboardDoc(uid)
      ? safeGetDoc(
          () => getDoc(dashboardDoc(uid)!),
          null as Awaited<ReturnType<typeof getDoc>> | null,
          "dashboard doc",
          { uid }
        )
      : Promise.resolve(null),
    taskUiDoc(uid)
      ? safeGetDoc(
          () => getDoc(taskUiDoc(uid)!),
          null as Awaited<ReturnType<typeof getDoc>> | null,
          "task UI doc",
          { uid }
        )
      : Promise.resolve(null),
    userRootRef
      ? safeGetDoc(
          () => getDoc(userRootRef),
          null as Awaited<ReturnType<typeof getDoc>> | null,
          "user root doc",
          { uid }
        )
      : Promise.resolve(null),
  ]);

  historyRows.forEach((row) => {
    tasks.push(row.task);
    legacyHistoryByTaskId[row.taskId] = row.history;
    if (row.liveSession) liveSessionsByTaskId[row.taskId] = row.liveSession;
  });
  const canonicalHistoryByTaskId: HistoryByTaskId = {};
  const canonicalHistoryDocIds = new Set<string>();
  canonicalHistoryDocs.forEach((row) => {
    canonicalHistoryDocIds.add(row.id);
    const normalized = normalizeCanonicalHistoryEntryRecord(row.data());
    if (!normalized) return;
    if (!Array.isArray(canonicalHistoryByTaskId[normalized.taskId])) canonicalHistoryByTaskId[normalized.taskId] = [];
    canonicalHistoryByTaskId[normalized.taskId].push(normalized.entry);
  });
  const historyByTaskId = mergeCanonicalAndLegacyHistory(canonicalHistoryByTaskId, legacyHistoryByTaskId);
  await migrateLegacyHistoryToCanonical(uid, legacyHistoryByTaskId, canonicalHistoryDocIds).catch((error) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Legacy history migration skipped", {
        uid,
        error: describeError(error),
      });
    }
  });

  const deletedTaskMeta: DeletedTaskMeta = {};
  for (const d of deletedSnap) {
    const row = d.data() as Record<string, unknown>;
    const taskSnapshotRaw =
      row.taskSnapshot && typeof row.taskSnapshot === "object"
        ? mapTaskFromFirestore(d.id, row.taskSnapshot as Record<string, unknown>)
        : null;
    deletedTaskMeta[d.id] = {
      name: asString(row.name),
      color: typeof row.color === "string" ? row.color : null,
      deletedAt: Number(row.deletedAt || 0),
      state: normalizeTaskStatusState(row.state),
      ...(taskSnapshotRaw ? { taskSnapshot: taskSnapshotRaw } : {}),
    };
  }

  const preferences: UserPreferencesV1 | null = prefSnap?.exists()
      ? {
        schemaVersion: 1,
        theme: normalizeThemeMode(prefSnap.get("theme")),
        menuButtonStyle: prefSnap.get("menuButtonStyle") === "square" ? "square" : "parallelogram",
        startupModule: normalizeStartupModule(prefSnap.get("startupModule")),
        taskView: "tile",
        taskOrderBy:
          prefSnap.get("taskOrderBy") === "alpha"
            ? "alpha"
            : prefSnap.get("taskOrderBy") === "schedule"
              ? "schedule"
              : "custom",
        dynamicColorsEnabled: asBool(prefSnap.get("dynamicColorsEnabled"), true),
        autoFocusOnTaskLaunchEnabled: asBool(prefSnap.get("autoFocusOnTaskLaunchEnabled"), true),
        mobilePushAlertsEnabled: asBool(prefSnap.get("mobilePushAlertsEnabled"), false),
        webPushAlertsEnabled:
          typeof prefSnap.get("webPushAlertsEnabled") === "boolean"
            ? asBool(prefSnap.get("webPushAlertsEnabled"), false)
            : asBool(prefSnap.get("mobilePushAlertsEnabled"), false),
        checkpointAlertSoundEnabled: asBool(prefSnap.get("checkpointAlertSoundEnabled"), true),
        checkpointAlertToastEnabled: asBool(prefSnap.get("checkpointAlertToastEnabled"), true),
        checkpointAlertSoundMode: prefSnap.get("checkpointAlertSoundMode") === "repeat" ? "repeat" : "once",
        checkpointAlertToastMode: prefSnap.get("checkpointAlertToastMode") === "manual" ? "manual" : "auto5s",
        optimalProductivityStartTime: normalizeTimeOfDay(
          prefSnap.get("optimalProductivityStartTime"),
          DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME
        ),
        optimalProductivityEndTime: normalizeTimeOfDay(
          prefSnap.get("optimalProductivityEndTime"),
          DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME
        ),
        rewards: normalizeRewardProgress(prefSnap.get("rewards") || DEFAULT_REWARD_PROGRESS),
        updatedAtMs: Number(prefSnap.get("updatedAtMs") || Date.now()),
      }
    : null;

  const dashboard: DashboardConfig | null = dashboardSnap?.exists()
    ? {
        order: Array.isArray(dashboardSnap.get("order")) ? (dashboardSnap.get("order") as string[]) : [],
        widgets:
          dashboardSnap.get("widgets") && typeof dashboardSnap.get("widgets") === "object"
            ? (dashboardSnap.get("widgets") as Record<string, unknown>)
            : undefined,
      }
    : null;

  const taskUi = taskUiSnap?.exists() ? asTaskUi(taskUiSnap.data()) : null;
  const plan = normalizeTaskTimerPlan(userRootSnap?.exists() ? userRootSnap.get("plan") : "free");

  return { plan, tasks, historyByTaskId, liveSessionsByTaskId, deletedTaskMeta, preferences, dashboard, taskUi };
}

export async function loadLiveSessions(uid: string): Promise<LiveSessionsByTaskId> {
  const snapshot = await loadUserWorkspace(uid);
  return snapshot.liveSessionsByTaskId || {};
}

export async function saveTask(uid: string, task: Task): Promise<void> {
  const ref = taskDoc(uid, String(task.id || ""));
  if (!ref) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Skipping task save because task ref is unavailable", {
        uid,
        taskId: String(task.id || ""),
      });
    }
    return;
  }
  await upsertUserRoot(uid);
  const taskRow = mapTaskToFirestore(task);
  const buildSavePayload = async (row: Record<string, unknown>) => {
    const existing = await getDoc(ref);
    const nextDueAtMs = normalizeNullableInt(row.bgTimeGoalPushDueAtMs);
    const nextEligible = !!row.bgTimeGoalPushEligible && nextDueAtMs != null;
    const existingDueAtMs = existing.exists() ? normalizeNullableInt(existing.get("bgTimeGoalPushDueAtMs")) : null;
    const preserveSendBookkeeping = nextEligible && nextDueAtMs === existingDueAtMs;
    return {
      ...row,
      bgTimeGoalPushSentAtMs:
        preserveSendBookkeeping && existing.exists()
          ? normalizeNullableInt(existing.get("bgTimeGoalPushSentAtMs"))
          : null,
      bgTimeGoalPushSentDueAtMs:
        preserveSendBookkeeping && existing.exists()
          ? normalizeNullableInt(existing.get("bgTimeGoalPushSentDueAtMs"))
          : null,
      createdAt: existing.exists() ? existing.get("createdAt") || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    };
  };
  let savedRowKeys = Object.keys(taskRow);
  try {
    await setDoc(ref, await buildSavePayload(taskRow));
  } catch (error) {
    const describedError = describeError(error);
    let recoveredWithLegacyFallback = false;
    const shouldRetryLegacy =
      describedError.code === "permission-denied" ||
      String(describedError.message || "").toLowerCase().includes("missing or insufficient permissions");
    if (shouldRetryLegacy) {
      const legacyTaskRow = mapTaskToLegacyFirestore(task);
      try {
        await setDoc(ref, await buildSavePayload(legacyTaskRow));
        savedRowKeys = Object.keys(legacyTaskRow);
        if (process.env.NODE_ENV !== "production") {
          console.warn("[tasktimer-cloud] Saved task with legacy finalCheckpointAction fallback", {
            uid,
            taskId: String(task.id || ""),
            databaseRowKeys: savedRowKeys,
          });
        }
        recoveredWithLegacyFallback = true;
      } catch (legacyError) {
        const describedLegacyError = describeError(legacyError);
        const shouldRetryCompatibility =
          describedLegacyError.code === "permission-denied" ||
          String(describedLegacyError.message || "").toLowerCase().includes("missing or insufficient permissions");
        if (shouldRetryCompatibility) {
          const compatibilityTaskRow = mapTaskToCompatibilityFirestore(task);
          try {
            await setDoc(ref, await buildSavePayload(compatibilityTaskRow));
            savedRowKeys = Object.keys(compatibilityTaskRow);
            if (process.env.NODE_ENV !== "production") {
              console.warn("[tasktimer-cloud] Saved task with compatibility fallback", {
                uid,
                taskId: String(task.id || ""),
                databaseRowKeys: savedRowKeys,
              });
            }
            recoveredWithLegacyFallback = true;
          } catch (compatibilityError) {
            if (process.env.NODE_ENV !== "production") {
              const describedCompatibilityError = describeError(compatibilityError);
              console.error("[tasktimer-cloud] Legacy fallback save failed", {
                uid,
                taskId: String(task.id || ""),
                databaseRowKeys: Object.keys(legacyTaskRow),
                taskRow: legacyTaskRow,
                compatibilityRowKeys: Object.keys(compatibilityTaskRow),
                compatibilityTaskRow,
                error: describedCompatibilityError,
                errorMessage: describedCompatibilityError.message ?? null,
                errorCode: describedCompatibilityError.code ?? null,
              });
            }
            throw compatibilityError;
          }
        } else {
          if (process.env.NODE_ENV !== "production") {
            console.error("[tasktimer-cloud] Legacy fallback save failed", {
              uid,
              taskId: String(task.id || ""),
              databaseRowKeys: Object.keys(legacyTaskRow),
              taskRow: legacyTaskRow,
              error: describedLegacyError,
              errorMessage: describedLegacyError.message ?? null,
              errorCode: describedLegacyError.code ?? null,
            });
          }
          throw legacyError;
        }
      }
    }
    if (recoveredWithLegacyFallback) {
      // The old payload shape was accepted by the deployed rules, so treat the save as successful.
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("[tasktimer-cloud] Failed to save task", {
        uid,
        taskId: String(task.id || ""),
        databaseRowKeys: Object.keys(taskRow),
        taskRow,
        error: describedError,
        errorMessage: describedError.message ?? null,
        errorCode: describedError.code ?? null,
      });
    }
    throw error;
  }
  try {
    await syncScheduledTimeGoalPush(uid, task);
  } catch (scheduleError) {
    if (process.env.NODE_ENV !== "production") {
      const describedScheduleError = describeError(scheduleError);
      console.error("[tasktimer-cloud] Failed to sync scheduled time-goal push", {
        uid,
        taskId: String(task.id || ""),
        databaseRowKeys: savedRowKeys,
        error: describedScheduleError,
        errorMessage: describedScheduleError.message ?? null,
        errorCode: describedScheduleError.code ?? null,
      });
    }
    throw scheduleError;
  }
  if (process.env.NODE_ENV !== "production") {
    console.info("[tasktimer-cloud] Task saved", {
      uid,
      taskId: String(task.id || ""),
      databaseRowKeys: savedRowKeys,
    });
  }
}

export function subscribeToTaskCollection(uid: string, listener: () => void): () => void {
  const col = tasksCollection(uid);
  if (!col || !uid) return () => {};
  const unsub = onSnapshot(
    col,
    () => {
      listener();
    },
    () => {
      // Ignore transient listener failures; focus/poll refresh remains as fallback.
    }
  );
  return () => {
    try {
      unsub();
    } catch {
      // ignore unsubscribe failures
    }
  };
}

export function subscribeToTaskLiveSessionDocs(uid: string, taskIds: string[], listener: () => void): () => void {
  const unsubs: Array<() => void> = [];
  const uniqueTaskIds = Array.from(new Set((taskIds || []).map((taskId) => String(taskId || "").trim()).filter(Boolean)));
  uniqueTaskIds.forEach((taskId) => {
    const ref = taskLiveSessionDoc(uid, taskId);
    if (!ref) return;
    const unsub = onSnapshot(
      ref,
      () => {
        listener();
      },
      () => {
        // Ignore transient listener failures; task collection/focus refresh remains as fallback.
      }
    );
    unsubs.push(() => {
      try {
        unsub();
      } catch {
        // ignore unsubscribe failures
      }
    });
  });
  return () => {
    unsubs.forEach((unsub) => unsub());
  };
}

export async function deleteTask(uid: string, taskId: string): Promise<void> {
  const ref = taskDoc(uid, taskId);
  if (!ref) return;
  await deleteDoc(ref);
  const scheduledRef = scheduledTimeGoalPushDoc(uid, taskId);
  if (!scheduledRef) return;
  try {
    await deleteDoc(scheduledRef);
  } catch {
    // Best-effort cleanup; task delete should still succeed.
  }
}

export async function appendHistoryEntry(uid: string, taskId: string, entry: HistoryEntry): Promise<void> {
  const col = userHistoryCollection(uid);
  const normalizedTaskId = String(taskId || "").trim();
  const normalizedEntry = normalizeHistoryEntryRecord(entry);
  if (!col || !normalizedTaskId || !normalizedEntry) return;
  const entryId = buildCanonicalHistoryEntryDocId(normalizedTaskId, normalizedEntry);
  await setDoc(
    doc(col, entryId),
    {
      ...buildHistoryDocPayload(normalizedTaskId, normalizedEntry),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveLiveSession(uid: string, session: LiveTaskSession): Promise<void> {
  const taskId = String(session.taskId || "").trim();
  const ref = taskLiveSessionDoc(uid, taskId);
  if (!ref || !taskId) return;
  const payload: Record<string, unknown> = {
    sessionId: String(session.sessionId || "").trim(),
    taskId,
    name: String(session.name || "").trim() || "Task",
    startedAtMs: Math.max(0, Math.floor(Number(session.startedAtMs || 0) || 0)),
    elapsedMs: Math.max(0, Math.floor(Number(session.elapsedMs || 0) || 0)),
    resumedFromMs: Math.max(0, Math.floor(Number(session.resumedFromMs || 0) || 0)),
    updatedAtMs: Math.max(0, Math.floor(Number(session.updatedAtMs || 0) || 0)),
    status: "running",
    createdAt: serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  };
  if (typeof session.note === "string" && session.note.trim()) payload.note = session.note.trim();
  if (typeof session.color === "string" && session.color.trim()) payload.color = session.color.trim();
  await setDoc(ref, payload, { merge: true });
}

export async function clearLiveSession(uid: string, taskId: string): Promise<void> {
  const ref = taskLiveSessionDoc(uid, taskId);
  if (!ref) return;
  await deleteDoc(ref);
}

export async function finalizeLiveSessionHistory(uid: string, taskId: string, entry: HistoryEntry): Promise<void> {
  const historyCol = userHistoryCollection(uid);
  const liveSessionRef = taskLiveSessionDoc(uid, taskId);
  const db = dbOrNull();
  const normalizedTaskId = String(taskId || "").trim();
  const normalizedEntry = normalizeHistoryEntryRecord(entry);
  if (!historyCol || !liveSessionRef || !db || !normalizedTaskId || !normalizedEntry) return;
  const batch = writeBatch(db);
  batch.set(
    doc(historyCol, buildCanonicalHistoryEntryDocId(normalizedTaskId, normalizedEntry)),
    {
      ...buildHistoryDocPayload(normalizedTaskId, normalizedEntry),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  batch.delete(liveSessionRef);
  await batch.commit();
}

function historyEntryIdentityFingerprint(taskId: string, entry: HistoryEntry): string {
  const normalizedTaskId = String(taskId || "").trim();
  const sessionId = typeof entry?.sessionId === "string" ? entry.sessionId.trim() : "";
  if (sessionId) return `${normalizedTaskId}|session|${sessionId}`;
  const ts = Number.isFinite(+entry?.ts) ? Math.floor(+entry.ts) : 0;
  const ms = Number.isFinite(+entry?.ms) ? Math.max(0, Math.floor(+entry.ms)) : 0;
  const name = String(entry?.name || "");
  return `${normalizedTaskId}|entry|${ts}|${ms}|${name}`;
}

function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function buildCanonicalHistoryEntryDocId(taskId: string, entry: HistoryEntry): string {
  const ts = Number.isFinite(+entry?.ts) ? Math.floor(+entry.ts) : 0;
  const ms = Number.isFinite(+entry?.ms) ? Math.max(0, Math.floor(+entry.ms)) : 0;
  const normalizedTaskId = String(taskId || "").trim();
  const sessionId = typeof entry?.sessionId === "string" ? entry.sessionId.trim() : "";
  if (sessionId) return `${normalizedTaskId}-session-${fnv1a32(historyEntryIdentityFingerprint(taskId, entry))}`;
  return `${normalizedTaskId}-${ts}-${ms}-${fnv1a32(historyEntryIdentityFingerprint(taskId, entry))}`;
}

type HistoryDocPayload = {
  taskId: string;
  ts: number;
  ms: number;
  name: string;
  color?: string;
  note?: string;
  sessionId?: string;
  completionDifficulty?: 1 | 2 | 3 | 4 | 5;
};

type HistorySyncPlan = {
  upsertIds: string[];
  deleteIds: string[];
};

function buildHistoryDocPayload(taskId: string, entry: HistoryEntry): HistoryDocPayload {
  return {
    taskId: String(taskId || "").trim(),
    ts: Number.isFinite(+entry?.ts) ? Math.floor(+entry.ts) : 0,
    ms: Number.isFinite(+entry?.ms) ? Math.max(0, Math.floor(+entry.ms)) : 0,
    name: String(entry?.name || ""),
    ...(entry?.color != null ? { color: String(entry.color) } : {}),
    ...(typeof entry?.note === "string" && entry.note.trim() ? { note: entry.note.trim() } : {}),
    ...(typeof entry?.sessionId === "string" && entry.sessionId.trim() ? { sessionId: entry.sessionId.trim() } : {}),
    ...(normalizeCompletionDifficulty(entry?.completionDifficulty)
      ? { completionDifficulty: normalizeCompletionDifficulty(entry?.completionDifficulty) as 1 | 2 | 3 | 4 | 5 }
      : {}),
  };
}

function normalizeComparableHistoryPayload(row: Record<string, unknown> | HistoryDocPayload): HistoryDocPayload {
  return {
    taskId: String(row.taskId || ""),
    ts: Number.isFinite(Number(row.ts)) ? Math.floor(Number(row.ts)) : 0,
    ms: Number.isFinite(Number(row.ms)) ? Math.max(0, Math.floor(Number(row.ms))) : 0,
    name: String(row.name || ""),
    ...(row.color != null ? { color: String(row.color) } : {}),
    ...(typeof row.note === "string" && row.note.trim() ? { note: row.note.trim() } : {}),
    ...(typeof row.sessionId === "string" && row.sessionId.trim() ? { sessionId: row.sessionId.trim() } : {}),
    ...(normalizeCompletionDifficulty(row.completionDifficulty)
      ? { completionDifficulty: normalizeCompletionDifficulty(row.completionDifficulty) as 1 | 2 | 3 | 4 | 5 }
      : {}),
  };
}

function historyPayloadsEqual(a: Record<string, unknown> | HistoryDocPayload, b: HistoryDocPayload): boolean {
  return JSON.stringify(normalizeComparableHistoryPayload(a)) === JSON.stringify(normalizeComparableHistoryPayload(b));
}

export function planHistorySyncOperations(
  currentRowsById: Record<string, Record<string, unknown>>,
  desiredRowsById: Record<string, HistoryDocPayload>
): HistorySyncPlan {
  const currentIds = new Set(Object.keys(currentRowsById || {}));
  const desiredIds = new Set(Object.keys(desiredRowsById || {}));
  const upsertIds = Array.from(desiredIds).filter((id) => {
    const current = currentRowsById[id];
    const desired = desiredRowsById[id];
    return !current || !historyPayloadsEqual(current, desired);
  });
  const deleteIds = Array.from(currentIds).filter((id) => !desiredIds.has(id));
  return { upsertIds, deleteIds };
}

export function applyHistoryReplaceModeToSyncPlan(
  plan: HistorySyncPlan,
  opts?: { allowDestructiveReplace?: boolean }
): HistorySyncPlan {
  return {
    upsertIds: plan.upsertIds,
    deleteIds: opts?.allowDestructiveReplace === true ? plan.deleteIds : [],
  };
}

export function isLargeImplicitHistoryDelete(currentCount: number, nextCount: number): boolean {
  const safeCurrentCount = Math.max(0, Math.floor(Number(currentCount || 0) || 0));
  const safeNextCount = Math.max(0, Math.floor(Number(nextCount || 0) || 0));
  const removedCount = Math.max(0, safeCurrentCount - safeNextCount);
  return removedCount > 5 && safeNextCount < safeCurrentCount * 0.8;
}

export async function replaceTaskHistory(
  uid: string,
  taskId: string,
  entries: HistoryEntry[],
  opts?: { allowDestructiveReplace?: boolean }
): Promise<void> {
  const col = userHistoryCollection(uid);
  const db = dbOrNull();
  const normalizedTaskId = String(taskId || "").trim();
  if (!col || !db || !normalizedTaskId) return;
  const deduped: HistoryEntry[] = [];
  const seen = new Set<string>();
  (entries || []).forEach((entry) => {
    const ts = Number.isFinite(+entry?.ts) ? Math.floor(+entry.ts) : 0;
    const ms = Number.isFinite(+entry?.ms) ? Math.max(0, Math.floor(+entry.ms)) : -1;
    if (ts <= 0 || ms < 0) return;
    const normalized: HistoryEntry = {
      ...entry,
      ts,
      ms,
      name: String(entry?.name || ""),
      ...(entry?.color != null ? { color: String(entry.color) } : {}),
      ...(typeof entry?.note === "string" && entry.note.trim() ? { note: entry.note.trim() } : {}),
      ...(typeof entry?.sessionId === "string" && entry.sessionId.trim() ? { sessionId: entry.sessionId.trim() } : {}),
      ...(normalizeCompletionDifficulty(entry?.completionDifficulty)
        ? { completionDifficulty: normalizeCompletionDifficulty(entry?.completionDifficulty) }
        : {}),
    };
    const key = historyEntryIdentityFingerprint(normalizedTaskId, normalized);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(normalized);
  });
  const current = await getDocs(query(col));
  const desiredRowsById: Record<string, HistoryDocPayload> = {};
  deduped.forEach((entry) => {
    desiredRowsById[buildCanonicalHistoryEntryDocId(normalizedTaskId, entry)] = buildHistoryDocPayload(normalizedTaskId, entry);
  });
  const currentRowsById: Record<string, Record<string, unknown>> = {};
  current.docs.forEach((row) => {
    const data = row.data() as Record<string, unknown>;
    if (String(data.taskId || "").trim() === normalizedTaskId) currentRowsById[row.id] = data;
  });
  const rawPlan = planHistorySyncOperations(currentRowsById, desiredRowsById);
  const plan = applyHistoryReplaceModeToSyncPlan(rawPlan, opts);
  const currentTaskCount = Object.keys(currentRowsById).length;
  if (plan.deleteIds.length && isLargeImplicitHistoryDelete(currentTaskCount, deduped.length) && !opts?.allowDestructiveReplace) {
    throw new Error(
      `Refusing implicit destructive history replacement for task ${taskId}: ${currentTaskCount} cloud rows would become ${deduped.length}.`
    );
  }
  if (!plan.deleteIds.length && !plan.upsertIds.length) return;
  const maxOpsPerBatch = 400;
  const operations: Array<{ kind: "delete" | "upsert"; id: string }> = [
    ...plan.deleteIds.map((id) => ({ kind: "delete" as const, id })),
    ...plan.upsertIds.map((id) => ({ kind: "upsert" as const, id })),
  ];
  for (let index = 0; index < operations.length; index += maxOpsPerBatch) {
    const batch = writeBatch(db);
    operations.slice(index, index + maxOpsPerBatch).forEach((op) => {
      const ref = doc(col, op.id);
      if (op.kind === "delete") {
        batch.delete(ref);
        return;
      }
      batch.set(ref, {
        ...desiredRowsById[op.id],
        createdAt: currentRowsById[op.id]?.createdAt || serverTimestamp(),
      });
    });
    await batch.commit();
  }
  if (opts?.allowDestructiveReplace === true) {
    await deleteRemovedLegacyHistoryRows(uid, normalizedTaskId, new Set(Object.keys(desiredRowsById)));
  }
}

export async function saveDeletedTaskMeta(uid: string, taskId: string, row: DeletedTaskMeta[string]): Promise<void> {
  const ref = deletedTaskDoc(uid, taskId);
  if (!ref) return;
  await setDoc(
    ref,
    {
      ...row,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteDeletedTaskMeta(uid: string, taskId: string): Promise<void> {
  const ref = deletedTaskDoc(uid, taskId);
  if (!ref) return;
  await deleteDoc(ref);
}

export async function savePreferences(uid: string, prefs: UserPreferencesV1): Promise<void> {
  const ref = preferencesDoc(uid);
  if (!ref) return;
  const normalizedRewards = normalizeRewardProgress(prefs.rewards || DEFAULT_REWARD_PROGRESS);
  try {
    await upsertUserRoot(uid);
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[tasktimer-cloud] Proceeding with preferences save despite user root upsert failure", {
          uid,
          error: describeError(error),
        });
      }
    }
  }
  await setDoc(
    ref,
    {
      ...prefs,
      rewards: normalizedRewards,
      optimalProductivityStartTime: normalizeTimeOfDay(
        prefs.optimalProductivityStartTime,
        DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME
      ),
      optimalProductivityEndTime: normalizeTimeOfDay(
        prefs.optimalProductivityEndTime,
        DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME
      ),
      schemaVersion: 1,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  try {
    await saveUserRootPatch(uid, {
      rewardCurrentRankId: normalizedRewards.currentRankId,
      rewardTotalXp: normalizedRewards.totalXp,
    });
  } catch (error) {
    if (!isPermissionDeniedError(error)) throw error;
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tasktimer-cloud] Skipping reward mirror update on user root due to current rules", {
        uid,
        error: describeError(error),
      });
    }
  }
}

export async function loadPreferences(uid: string): Promise<UserPreferencesV1 | null> {
  const ref = preferencesDoc(uid);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    schemaVersion: 1,
    theme: normalizeThemeMode(data.theme),
    menuButtonStyle: data.menuButtonStyle === "square" ? "square" : "parallelogram",
    startupModule: normalizeStartupModule(data.startupModule),
    taskView: "tile",
    taskOrderBy: data.taskOrderBy === "alpha" ? "alpha" : data.taskOrderBy === "schedule" ? "schedule" : "custom",
    dynamicColorsEnabled: asBool(data.dynamicColorsEnabled, true),
    autoFocusOnTaskLaunchEnabled: asBool(data.autoFocusOnTaskLaunchEnabled, true),
    mobilePushAlertsEnabled: asBool(data.mobilePushAlertsEnabled, false),
    webPushAlertsEnabled:
      typeof data.webPushAlertsEnabled === "boolean"
        ? asBool(data.webPushAlertsEnabled, false)
        : asBool(data.mobilePushAlertsEnabled, false),
    checkpointAlertSoundEnabled: asBool(data.checkpointAlertSoundEnabled, true),
    checkpointAlertToastEnabled: asBool(data.checkpointAlertToastEnabled, true),
    checkpointAlertSoundMode: data.checkpointAlertSoundMode === "repeat" ? "repeat" : "once",
    checkpointAlertToastMode: data.checkpointAlertToastMode === "manual" ? "manual" : "auto5s",
    optimalProductivityStartTime: normalizeTimeOfDay(
      data.optimalProductivityStartTime,
      DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME
    ),
    optimalProductivityEndTime: normalizeTimeOfDay(data.optimalProductivityEndTime, DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME),
    rewards: normalizeRewardProgress(data.rewards || DEFAULT_REWARD_PROGRESS),
    updatedAtMs: Number(data.updatedAtMs || Date.now()),
  };
}

export async function saveDashboard(uid: string, cfg: DashboardConfig): Promise<void> {
  const ref = dashboardDoc(uid);
  if (!ref) return;
  await upsertUserRoot(uid);
  await setDoc(
    ref,
    {
      order: Array.isArray(cfg.order) ? cfg.order : [],
      widgets: cfg.widgets || {},
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    },
    { merge: true }
  );
}

export async function loadDashboard(uid: string): Promise<DashboardConfig | null> {
  const ref = dashboardDoc(uid);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    order: Array.isArray(data.order) ? (data.order as string[]) : [],
    widgets: data.widgets && typeof data.widgets === "object" ? (data.widgets as Record<string, unknown>) : undefined,
  };
}

export async function saveTaskUi(uid: string, cfg: TaskUiConfig): Promise<void> {
  const ref = taskUiDoc(uid);
  if (!ref) return;
  await upsertUserRoot(uid);
  await setDoc(
    ref,
    {
      historyRangeDaysByTaskId: cfg.historyRangeDaysByTaskId || {},
      historyRangeModeByTaskId: cfg.historyRangeModeByTaskId || {},
      pinnedHistoryTaskIds: cfg.pinnedHistoryTaskIds || [],
      customTaskNames: Array.isArray(cfg.customTaskNames) ? cfg.customTaskNames.slice(0, 5) : [],
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    },
    { merge: true }
  );
}

export async function loadTaskUi(uid: string): Promise<TaskUiConfig | null> {
  const ref = taskUiDoc(uid);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return asTaskUi(snap.data());
}
