import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

import type {
  ArchieQueryRequest,
  ArchieQueryResponse,
  ArchieRecommendationApplyRequest,
  ArchieRecommendationDraft,
} from "@/app/tasktimer/lib/archieAssistant";
import { normalizeArchieAssistantPage } from "@/app/tasktimer/lib/archieAssistant";
import type { ArchieWorkspaceContext } from "@/app/tasktimer/lib/archieEngine";
import type { Task, HistoryEntry } from "@/app/tasktimer/lib/types";
import { getRequestIdToken } from "../feedback/shared";
import {
  canUseFirebaseAdminDefaultCredentials,
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
  hasFirebaseAdminCredentialConfig,
} from "@/lib/firebaseAdmin";

export class ArchieApiError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ArchieApiError";
    this.code = code;
    this.status = status;
  }
}

function asString(value: unknown, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

export function createArchieErrorResponse(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error && error.message ? error.message : fallbackMessage;
  if (error instanceof ArchieApiError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return Response.json({ error: message, code: "archie/internal" }, { status: 500 });
}

export async function verifyArchieRequestUser(req: Request, body?: Record<string, unknown> | null) {
  const idToken = getRequestIdToken(req, body);
  if (!idToken) {
    throw new ArchieApiError("archie/unauthenticated", "You must be signed in to use Archie.", 401);
  }
  if (!hasFirebaseAdminCredentialConfig() && !canUseFirebaseAdminDefaultCredentials()) {
    throw new ArchieApiError(
      "archie/admin-config-missing",
      "Firebase Admin credentials are not configured for Archie in this environment.",
      503
    );
  }
  try {
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const uid = asString(decodedToken.uid, 120);
    if (!uid) throw new Error("Missing uid.");
    return { uid, idToken };
  } catch {
    throw new ArchieApiError("archie/invalid-session", "Your sign-in session is no longer valid. Please sign in again.", 401);
  }
}

function normalizeTask(raw: Record<string, unknown>): Task {
  const dayRaw = asString(raw.plannedStartDay, 8).toLowerCase();
  const plannedStartDay =
    dayRaw === "mon" || dayRaw === "tue" || dayRaw === "wed" || dayRaw === "thu" || dayRaw === "fri" || dayRaw === "sat" || dayRaw === "sun"
      ? dayRaw
      : null;
  return {
    id: asString(raw.id, 120),
    name: asString(raw.name, 200) || "Task",
    order: Math.max(0, Math.floor(Number(raw.order || 0) || 0)),
    accumulatedMs: Math.max(0, Math.floor(Number(raw.accumulatedMs || 0) || 0)),
    running: !!raw.running,
    startMs: Number.isFinite(Number(raw.startMs)) ? Number(raw.startMs) : null,
    collapsed: !!raw.collapsed,
    milestonesEnabled: !!raw.milestonesEnabled,
    milestoneTimeUnit: raw.milestoneTimeUnit === "day" || raw.milestoneTimeUnit === "minute" ? raw.milestoneTimeUnit : "hour",
    milestones: Array.isArray(raw.milestones) ? (raw.milestones as Task["milestones"]) : [],
    hasStarted: !!raw.hasStarted,
    color: typeof raw.color === "string" ? raw.color : null,
    checkpointSoundEnabled: raw.checkpointSoundEnabled === undefined ? undefined : !!raw.checkpointSoundEnabled,
    checkpointSoundMode: raw.checkpointSoundMode === "repeat" ? "repeat" : "once",
    checkpointToastEnabled: raw.checkpointToastEnabled === undefined ? undefined : !!raw.checkpointToastEnabled,
    checkpointToastMode:
      raw.checkpointToastMode === "auto3s" || raw.checkpointToastMode === "manual" ? raw.checkpointToastMode : "auto5s",
    timeGoalAction:
      raw.timeGoalAction === "continue" || raw.timeGoalAction === "resetLog" || raw.timeGoalAction === "resetNoLog"
        ? raw.timeGoalAction
        : "confirmModal",
    finalCheckpointAction:
      raw.finalCheckpointAction === "continue" || raw.finalCheckpointAction === "resetLog" || raw.finalCheckpointAction === "resetNoLog"
        ? raw.finalCheckpointAction
        : "confirmModal",
    xpDisqualifiedUntilReset: !!raw.xpDisqualifiedUntilReset,
    presetIntervalsEnabled: raw.presetIntervalsEnabled === undefined ? undefined : !!raw.presetIntervalsEnabled,
    presetIntervalValue: Number.isFinite(Number(raw.presetIntervalValue)) ? Number(raw.presetIntervalValue) : undefined,
    presetIntervalLastMilestoneId: typeof raw.presetIntervalLastMilestoneId === "string" ? raw.presetIntervalLastMilestoneId : null,
    presetIntervalNextSeq: Number.isFinite(Number(raw.presetIntervalNextSeq)) ? Number(raw.presetIntervalNextSeq) : undefined,
    timeGoalEnabled: raw.timeGoalEnabled === undefined ? undefined : !!raw.timeGoalEnabled,
    timeGoalValue: Number.isFinite(Number(raw.timeGoalValue)) ? Number(raw.timeGoalValue) : undefined,
    timeGoalUnit: raw.timeGoalUnit === "minute" ? "minute" : "hour",
    timeGoalPeriod: raw.timeGoalPeriod === "day" ? "day" : "week",
    timeGoalMinutes: Number.isFinite(Number(raw.timeGoalMinutes)) ? Number(raw.timeGoalMinutes) : undefined,
    plannedStartDay,
    plannedStartTime: asString(raw.plannedStartTime, 16) || null,
    plannedStartOpenEnded: !!raw.plannedStartOpenEnded,
    plannedStartPushRemindersEnabled: raw.plannedStartPushRemindersEnabled === undefined ? undefined : !!raw.plannedStartPushRemindersEnabled,
  };
}

function normalizeHistoryEntry(raw: Record<string, unknown>): HistoryEntry {
  return {
    ts: Math.max(0, Math.floor(Number(raw.ts || 0) || 0)),
    name: asString(raw.name, 200),
    ms: Math.max(0, Math.floor(Number(raw.ms || 0) || 0)),
    color: asString(raw.color, 120) || undefined,
    note: asString(raw.note, 1000) || undefined,
    xpDisqualifiedUntilReset: raw.xpDisqualifiedUntilReset === undefined ? undefined : !!raw.xpDisqualifiedUntilReset,
  };
}

function userDraftDoc(uid: string, draftId: string) {
  return getFirebaseAdminDb().collection("users").doc(uid).collection("archieDrafts").doc(draftId);
}

function userSessionDoc(uid: string, sessionId: string) {
  return getFirebaseAdminDb().collection("users").doc(uid).collection("archieSessions").doc(sessionId);
}

export async function loadArchieWorkspaceContext(uid: string, requestBody: ArchieQueryRequest): Promise<ArchieWorkspaceContext> {
  const db = getFirebaseAdminDb();
  const tasksSnap = await db.collection("users").doc(uid).collection("tasks").get();
  const tasks = tasksSnap.docs.map((doc) => normalizeTask(doc.data()));
  const historyPairs = await Promise.all(
    tasks.map(async (task) => {
      const snap = await db.collection("users").doc(uid).collection("tasks").doc(String(task.id || "")).collection("history").get();
      return [
        String(task.id || ""),
        snap.docs.map((entry) => normalizeHistoryEntry(entry.data() as Record<string, unknown>)),
      ] as const;
    })
  );
  const [preferencesSnap, taskUiSnap] = await Promise.all([
    db.collection("users").doc(uid).collection("preferences").doc("v1").get(),
    db.collection("users").doc(uid).collection("taskUi").doc("v1").get(),
  ]);
  const historyByTaskId = Object.fromEntries(historyPairs);
  return {
    tasks,
    historyByTaskId,
    preferences: preferencesSnap.exists ? (preferencesSnap.data() as ArchieWorkspaceContext["preferences"]) : null,
    taskUi: taskUiSnap.exists ? (taskUiSnap.data() as ArchieWorkspaceContext["taskUi"]) : null,
    focusSessionNotesByTaskId: requestBody.focusSessionNotesByTaskId || {},
  };
}

export async function saveArchieDraft(uid: string, draft: ArchieRecommendationDraft, sourceMessage: string) {
  await userDraftDoc(uid, draft.id).set({
    ...draft,
    sourceMessage,
    updatedAt: FieldValue.serverTimestamp(),
    schemaVersion: 1,
  });
}

export async function writeArchieSession(uid: string, input: {
  request: ArchieQueryRequest;
  response: ArchieQueryResponse;
}) {
  const sessionId = randomUUID();
  await userSessionDoc(uid, sessionId).set({
    sessionId,
    message: asString(input.request.message, 2000),
    activePage: normalizeArchieAssistantPage(input.request.activePage),
    responseMode: input.response.mode,
    confidence: input.response.confidence,
    citations: input.response.citations,
    draftId: input.response.draftId || null,
    createdAt: FieldValue.serverTimestamp(),
    schemaVersion: 1,
  });
}

export function buildDraft(seed: Omit<ArchieRecommendationDraft, "id" | "createdAt" | "status">): ArchieRecommendationDraft {
  return {
    ...seed,
    id: randomUUID(),
    createdAt: Date.now(),
    status: "draft",
  };
}

export async function getArchieDraft(uid: string, draftId: string) {
  const snap = await userDraftDoc(uid, draftId).get();
  if (!snap.exists) {
    throw new ArchieApiError("archie/draft-not-found", "That Archie draft no longer exists.", 404);
  }
  const data = snap.data() as ArchieRecommendationDraft & { proposedChanges?: ArchieRecommendationDraft["proposedChanges"] };
  return {
    ...data,
    id: asString(data.id || draftId, 120) || draftId,
    summary: asString(data.summary, 1000),
    reasoning: asString(data.reasoning, 4000),
    evidence: Array.isArray(data.evidence) ? data.evidence.map((entry) => asString(entry, 300)).filter(Boolean) : [],
    proposedChanges: Array.isArray(data.proposedChanges) ? data.proposedChanges : [],
    createdAt: Math.max(0, Math.floor(Number(data.createdAt || 0) || 0)),
    status: data.status === "applied" || data.status === "discarded" ? data.status : "draft",
  } satisfies ArchieRecommendationDraft;
}

export async function applyArchieDraft(uid: string, body: ArchieRecommendationApplyRequest) {
  const draftId = asString(body.draftId, 120);
  if (!draftId) {
    throw new ArchieApiError("archie/invalid-draft", "A valid Archie draft is required.", 400);
  }
  const decision = body.decision === "discard" ? "discard" : "apply";
  const draft = await getArchieDraft(uid, draftId);
  const draftRef = userDraftDoc(uid, draftId);
  if (decision === "discard") {
    await draftRef.set(
      {
        status: "discarded",
        discardedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true, decision, appliedCount: 0, draft };
  }

  const db = getFirebaseAdminDb();
  const batch = db.batch();
  let appliedCount = 0;
  draft.proposedChanges.forEach((change) => {
    if (change.kind === "reorder_task") {
      const ref = db.collection("users").doc(uid).collection("tasks").doc(change.taskId);
      batch.set(ref, { order: change.afterOrder, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      appliedCount += 1;
      return;
    }
    if (change.kind === "update_schedule") {
      const ref = db.collection("users").doc(uid).collection("tasks").doc(change.taskId);
      batch.set(
        ref,
        {
          plannedStartDay: change.after.plannedStartDay,
          plannedStartTime: change.after.plannedStartTime,
          plannedStartOpenEnded: change.after.plannedStartOpenEnded,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      appliedCount += 1;
    }
  });
  batch.set(
    draftRef,
    {
      status: "applied",
      appliedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
  return { ok: true, decision, appliedCount, draft: { ...draft, status: "applied" as const } };
}
