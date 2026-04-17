import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

import type {
  ArchieQueryRequest,
  ArchieQueryResponse,
  ArchieTelemetryEventRequest,
  ArchieTelemetryEventType,
  ArchieRecommendationApplyRequest,
  ArchieRecommendationDraft,
  ArchieDraftKind,
} from "@/app/tasktimer/lib/archieAssistant";
import { normalizeArchieAssistantPage } from "@/app/tasktimer/lib/archieAssistant";
import type { ArchieWorkspaceContext } from "@/app/tasktimer/lib/archieEngine";
import type { Task, HistoryEntry } from "@/app/tasktimer/lib/types";
import { normalizeCompletionDifficulty } from "@/app/tasktimer/lib/completionDifficulty";
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

export type ArchieServerPlan = "free" | "pro";

function asString(value: unknown, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

export function normalizeArchieUserPlan(value: unknown): ArchieServerPlan {
  return asString(value, 24).toLowerCase() === "pro" ? "pro" : "free";
}

export function canUseArchieAi(plan: ArchieServerPlan) {
  return plan === "pro";
}

export function buildArchieUpgradeResponse(): ArchieQueryResponse {
  return {
    mode: "fallback",
    message:
      "I can answer product questions on Free. Workflow recommendations, draft changes, and AI-refined responses are included with Pro.",
    citations: [],
    confidence: "high",
    suggestedAction: { kind: "navigate", label: "Upgrade to Pro", href: "/pricing" },
  };
}

export async function loadArchieUserPlan(uid: string): Promise<ArchieServerPlan> {
  const normalizedUid = asString(uid, 120);
  if (!normalizedUid) return "free";
  const snap = await getFirebaseAdminDb().collection("users").doc(normalizedUid).get();
  return normalizeArchieUserPlan(snap.exists ? snap.get("plan") : null);
}

export function assertCanUseArchieAi(plan: ArchieServerPlan) {
  if (canUseArchieAi(plan)) return;
  throw new ArchieApiError(
    "archie/pro-required",
    buildArchieUpgradeResponse().message,
    403
  );
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
  const completionDifficulty = normalizeCompletionDifficulty(raw.completionDifficulty);
  return {
    ts: Math.max(0, Math.floor(Number(raw.ts || 0) || 0)),
    name: asString(raw.name, 200),
    ms: Math.max(0, Math.floor(Number(raw.ms || 0) || 0)),
    color: asString(raw.color, 120) || undefined,
    note: asString(raw.note, 1000) || undefined,
    xpDisqualifiedUntilReset: raw.xpDisqualifiedUntilReset === undefined ? undefined : !!raw.xpDisqualifiedUntilReset,
    completionDifficulty,
  };
}

function userDraftDoc(uid: string, draftId: string) {
  return getFirebaseAdminDb().collection("users").doc(uid).collection("archieDrafts").doc(draftId);
}

function userSessionDoc(uid: string, sessionId: string) {
  return getFirebaseAdminDb().collection("users").doc(uid).collection("archieSessions").doc(sessionId);
}

function userSessionEventDoc(uid: string, sessionId: string, eventId: string) {
  return userSessionDoc(uid, sessionId).collection("events").doc(eventId);
}

const ARCHIE_TELEMETRY_RETENTION_DAYS = 90;

function retentionExpiryDate() {
  return new Date(Date.now() + ARCHIE_TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function isArchieDebugLoggingEnabled() {
  return process.env.NODE_ENV !== "production" && asString(process.env.ARCHIE_LOG_RAW_TEXT, 8) === "1";
}

function getArchieTelemetryProvider() {
  return "genkit-google-genai";
}

function getArchieTelemetryModel() {
  return asString(process.env.ARCHIE_GEMINI_MODEL, 120) || "gemini-2.5-flash";
}

function getArchieGroundingKind(response: ArchieQueryResponse) {
  if (response.draftId || response.draft) return "draft";
  if (response.mode === "fallback") return "fallback";
  if (response.citations.length) return "grounded";
  return "ungrounded";
}

function getArchieDraftKind(response: ArchieQueryResponse): ArchieDraftKind | null {
  return response.draft?.kind || null;
}

export function createArchieSessionTelemetry(input: {
  sessionId: string;
  request: ArchieQueryRequest;
  response: ArchieQueryResponse;
  latencyMs: number;
}) {
  const debugLoggingEnabled = isArchieDebugLoggingEnabled();
  return {
    sessionId: asString(input.sessionId, 120),
    activePage: normalizeArchieAssistantPage(input.request.activePage),
    responseMode: input.response.mode,
    confidence: input.response.confidence,
    citationIds: input.response.citations.map((citation) => asString(citation.id, 120)).filter(Boolean),
    citationSources: input.response.citations
      .map((citation) => asString(citation.title, 200))
      .filter(Boolean)
      .slice(0, 8),
    draftId: input.response.draftId || null,
    draftKind: getArchieDraftKind(input.response),
    groundingKind: getArchieGroundingKind(input.response),
    latencyMs: Math.max(0, Math.floor(Number(input.latencyMs || 0) || 0)),
    model: getArchieTelemetryModel(),
    provider: getArchieTelemetryProvider(),
    debugLoggingEnabled,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: retentionExpiryDate(),
    schemaVersion: 2,
    ...(debugLoggingEnabled
      ? {
          rawUserMessage: asString(input.request.message, 2000),
          rawAssistantMessage: asString(input.response.message, 4000),
        }
      : {}),
  };
}

export function createArchieTelemetryEvent(input: {
  sessionId: string;
  draftId?: string | null;
  eventType: ArchieTelemetryEventType;
  appliedCount?: number;
  draftKind?: ArchieDraftKind | null;
}) {
  return {
    sessionId: asString(input.sessionId, 120),
    draftId: asString(input.draftId, 120) || null,
    eventType: input.eventType,
    appliedCount: Math.max(0, Math.floor(Number(input.appliedCount || 0) || 0)),
    draftKind: input.draftKind || null,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: retentionExpiryDate(),
    schemaVersion: 1,
  };
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

export async function saveArchieDraft(uid: string, draft: ArchieRecommendationDraft) {
  await userDraftDoc(uid, draft.id).set({
    ...draft,
    updatedAt: FieldValue.serverTimestamp(),
    schemaVersion: 1,
  });
}

export async function attachArchieDraftSession(uid: string, draftId: string, sessionId: string) {
  const normalizedDraftId = asString(draftId, 120);
  const normalizedSessionId = asString(sessionId, 120);
  if (!normalizedDraftId || !normalizedSessionId) return;
  await userDraftDoc(uid, normalizedDraftId).set(
    {
      sessionId: normalizedSessionId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function writeArchieSession(uid: string, input: {
  sessionId?: string;
  request: ArchieQueryRequest;
  response: ArchieQueryResponse;
  latencyMs: number;
}) {
  const sessionId = asString(input.sessionId, 120) || randomUUID();
  await userSessionDoc(uid, sessionId).set(createArchieSessionTelemetry({ sessionId, ...input }));
  return sessionId;
}

export async function writeArchieTelemetryEvent(uid: string, input: {
  sessionId: string | null;
  draftId?: string | null;
  eventType: ArchieTelemetryEventType;
  appliedCount?: number;
  draftKind?: ArchieDraftKind | null;
}) {
  const sessionId = asString(input.sessionId, 120);
  if (!sessionId) return;
  const eventId = randomUUID();
  await userSessionEventDoc(uid, sessionId, eventId).set(createArchieTelemetryEvent({ ...input, sessionId }));
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
    sessionId: asString(data.sessionId, 120) || null,
  } satisfies ArchieRecommendationDraft;
}

export async function getLatestOpenArchieDraft(uid: string) {
  const snap = await getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .collection("archieDrafts")
    .orderBy("createdAt", "desc")
    .get();

  const doc = snap.docs.find((entry) => {
    const status = asString(entry.data()?.status, 24);
    const proposedChanges = entry.data()?.proposedChanges;
    const hasLegacyReorderChange = Array.isArray(proposedChanges)
      ? proposedChanges.some((change) => change?.kind === "reorder_task")
      : false;
    return (!status || status === "draft") && !hasLegacyReorderChange;
  });
  if (!doc) return null;
  return getArchieDraft(uid, doc.id);
}

export async function applyArchieDraft(uid: string, body: ArchieRecommendationApplyRequest) {
  const draftId = asString(body.draftId, 120);
  if (!draftId) {
    throw new ArchieApiError("archie/invalid-draft", "A valid Archie draft is required.", 400);
  }
  const decision = body.decision === "discard" ? "discard" : "apply";
  const draft = await getArchieDraft(uid, draftId);
  const draftRef = userDraftDoc(uid, draftId);
  const sessionId = asString(body.sessionId, 120) || null;
  if (decision === "discard") {
    await draftRef.set(
      {
        status: "discarded",
        discardedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await writeArchieTelemetryEvent(uid, {
      sessionId,
      draftId,
      eventType: "discard",
      appliedCount: 0,
      draftKind: draft.kind,
    });
    return { ok: true, decision, appliedCount: 0, draft };
  }

  const db = getFirebaseAdminDb();
  const batch = db.batch();
  let appliedCount = 0;
  draft.proposedChanges.forEach((change) => {
    if (change.kind === "reorder_task") {
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
  await writeArchieTelemetryEvent(uid, {
    sessionId,
    draftId,
    eventType: "apply",
    appliedCount,
    draftKind: draft.kind,
  });
  return { ok: true, decision, appliedCount, draft: { ...draft, status: "applied" as const } };
}

export async function recordArchieTelemetryEvent(uid: string, body: ArchieTelemetryEventRequest) {
  const sessionId = asString(body.sessionId, 120);
  if (!sessionId) {
    throw new ArchieApiError("archie/invalid-session-id", "A valid Archie session id is required.", 400);
  }
  const eventType =
    body.eventType === "review_opened" ||
    body.eventType === "apply" ||
    body.eventType === "discard" ||
    body.eventType === "response_upvote" ||
    body.eventType === "response_downvote"
      ? body.eventType
      : null;
  if (!eventType) {
    throw new ArchieApiError("archie/invalid-event", "A valid Archie telemetry event is required.", 400);
  }
  let draftKind: ArchieDraftKind | null = null;
  const draftId = asString(body.draftId, 120) || null;
  if (draftId) {
    const draft = await getArchieDraft(uid, draftId);
    draftKind = draft.kind;
  }
  await writeArchieTelemetryEvent(uid, {
    sessionId,
    draftId,
    eventType,
    draftKind,
    appliedCount: 0,
  });
  return { ok: true };
}
