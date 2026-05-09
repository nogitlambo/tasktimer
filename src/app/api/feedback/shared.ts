import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

import {
  canUseFirebaseAdminDefaultCredentials,
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
  hasFirebaseAdminCredentialConfig,
} from "@/lib/firebaseAdmin";
import { asString, type FeedbackType } from "../jira/feedback/shared";

const FEEDBACK_SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const FEEDBACK_SUBMISSION_LIMIT = 3;
const FEEDBACK_VOTE_COOLDOWN_MS = 10 * 1000;
const FEEDBACK_REFRESH_WINDOW_MS = 60 * 1000;
const FEEDBACK_REFRESH_LIMIT = 12;
const FEEDBACK_VOTE_TRACK_TTL_MS = 24 * 60 * 60 * 1000;

type FeedbackSubmissionEvent = {
  atMs: number;
  fingerprint: string;
};

type FeedbackControlState = {
  submissionEvents: FeedbackSubmissionEvent[];
  refreshEvents: number[];
  voteToggleByFeedbackId: Record<string, number>;
};

export class FeedbackApiError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "FeedbackApiError";
    this.code = code;
    this.status = status;
  }
}

function parseCookieValue(cookieHeader: string | null, name: string) {
  const source = String(cookieHeader || "");
  if (!source) return "";
  const parts = source.split(";");
  for (const part of parts) {
    const [rawName, ...rawValue] = part.split("=");
    if (asString(rawName) !== name) continue;
    const joined = rawValue.join("=").trim();
    if (!joined) return "";
    try {
      return decodeURIComponent(joined);
    } catch {
      return joined;
    }
  }
  return "";
}

export function getRequestIdToken(req: Request, body?: Record<string, unknown> | null) {
  const authHeader = asString(req.headers.get("authorization"));
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice("Bearer ".length).trim();
    if (bearerToken) return bearerToken;
  }
  const customHeaderToken = asString(req.headers.get("x-firebase-auth"), 8192);
  if (customHeaderToken) return customHeaderToken;
  const bodyToken = asString(body?.authToken, 8192);
  if (bodyToken) return bodyToken;
  return parseCookieValue(req.headers.get("cookie"), "tasktimer_feedback_auth");
}

export async function verifyFeedbackRequestUser(req: Request, body?: Record<string, unknown> | null) {
  const idToken = getRequestIdToken(req, body);
  const guestSubmission = body?.guest === true || asString(body?.guest, 16).toLowerCase() === "true";
  if (!idToken && guestSubmission) {
    const forwardedFor = asString(req.headers.get("x-forwarded-for"), 240).split(",")[0]?.trim() || "";
    const userAgent = asString(req.headers.get("user-agent"), 500);
    const acceptLanguage = asString(req.headers.get("accept-language"), 240);
    const fingerprint = createHash("sha256")
      .update([forwardedFor, userAgent, acceptLanguage].join("::"))
      .digest("hex")
      .slice(0, 32);
    return { uid: `guest:${fingerprint}`, email: null, idToken: "" };
  }
  if (!idToken) {
    throw new FeedbackApiError("feedback/unauthenticated", "You must be signed in to use feedback.", 401);
  }
  if (!hasFirebaseAdminCredentialConfig() && !canUseFirebaseAdminDefaultCredentials()) {
    throw new FeedbackApiError(
      "feedback/admin-config-missing",
      "Firebase Admin credentials are not configured for this environment. Add FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY locally, or run in a Google-managed runtime with default credentials.",
      503
    );
  }
  try {
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const uid = asString(decodedToken.uid, 120);
    const email = asString(decodedToken.email, 320) || null;
    if (!uid) throw new Error("Missing uid.");
    return { uid, email, idToken };
  } catch {
    throw new FeedbackApiError("feedback/invalid-session", "Your sign-in session is no longer valid. Please sign in again.", 401);
  }
}

export async function loadFeedbackAuthorProfile(uid: string) {
  const normalizedUid = asString(uid, 120);
  if (!normalizedUid) {
    return {
      displayName: null,
      rankThumbnailSrc: null,
      currentRankId: null,
    };
  }
  const snap = await getFirebaseAdminDb().collection("users").doc(normalizedUid).get();
  if (!snap.exists) {
    return {
      displayName: null,
      rankThumbnailSrc: null,
      currentRankId: null,
    };
  }
  return {
    displayName: asString(snap.get("displayName"), 120) || null,
    rankThumbnailSrc: asString(snap.get("rankThumbnailSrc"), 2048) || null,
    currentRankId: asString(snap.get("rewardCurrentRankId"), 120) || null,
  };
}

function feedbackControlDoc(uid: string) {
  return getFirebaseAdminDb().collection("feedback_limits").doc(uid);
}

function normalizeSubmissionEvents(value: unknown) {
  if (!Array.isArray(value)) return [] as FeedbackSubmissionEvent[];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const event = entry as { atMs?: unknown; fingerprint?: unknown };
      const atMs = Number(event.atMs || 0);
      const fingerprint = asString(event.fingerprint, 80);
      if (!Number.isFinite(atMs) || atMs <= 0 || !fingerprint) return null;
      return { atMs: Math.floor(atMs), fingerprint };
    })
    .filter((entry): entry is FeedbackSubmissionEvent => !!entry);
}

function normalizeRefreshEvents(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  return value
    .map((entry) => Math.floor(Number(entry || 0)))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
}

function normalizeVoteToggleMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, number>;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, rawValue]) => [asString(key, 160), Math.floor(Number(rawValue || 0))] as const)
      .filter(([key, rawValue]) => !!key && Number.isFinite(rawValue) && rawValue > 0)
  );
}

function normalizeFeedbackControlState(value: unknown): FeedbackControlState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    submissionEvents: normalizeSubmissionEvents(raw.submissionEvents),
    refreshEvents: normalizeRefreshEvents(raw.refreshEvents),
    voteToggleByFeedbackId: normalizeVoteToggleMap(raw.voteToggleByFeedbackId),
  };
}

function pruneSubmissionEvents(events: FeedbackSubmissionEvent[], nowMs: number) {
  return events.filter((entry) => nowMs - entry.atMs < FEEDBACK_SUBMISSION_WINDOW_MS);
}

function pruneRefreshEvents(events: number[], nowMs: number) {
  return events.filter((entry) => nowMs - entry < FEEDBACK_REFRESH_WINDOW_MS);
}

function pruneVoteToggleMap(events: Record<string, number>, nowMs: number) {
  return Object.fromEntries(
    Object.entries(events).filter(([, entry]) => nowMs - entry < FEEDBACK_VOTE_TRACK_TTL_MS)
  );
}

function buildFeedbackFingerprint(type: FeedbackType, title: string, details: string) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256")
    .update([normalize(type), normalize(title), normalize(details)].join("::"))
    .digest("hex");
}

export async function recordFeedbackRefresh(uid: string) {
  const normalizedUid = asString(uid, 120);
  if (!normalizedUid) {
    throw new FeedbackApiError("feedback/unauthenticated", "You must be signed in to refresh feedback.", 401);
  }
  const db = getFirebaseAdminDb();
  const nowMs = Date.now();
  await db.runTransaction(async (tx) => {
    const ref = feedbackControlDoc(normalizedUid);
    const snap = await tx.get(ref);
    const state = normalizeFeedbackControlState(snap.data());
    const refreshEvents = pruneRefreshEvents(state.refreshEvents, nowMs);
    if (refreshEvents.length >= FEEDBACK_REFRESH_LIMIT) {
      throw new FeedbackApiError("feedback/refresh-rate-limited", "Please wait before refreshing feedback again.", 429);
    }
    refreshEvents.push(nowMs);
    tx.set(
      ref,
      {
        schemaVersion: 1,
        refreshEvents: refreshEvents.slice(-FEEDBACK_REFRESH_LIMIT),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export async function validateAndRecordFeedbackSubmission(input: {
  uid: string;
  type: FeedbackType;
  title: string;
  details: string;
  createPayload: Record<string, unknown>;
}) {
  const normalizedUid = asString(input.uid, 120);
  const fingerprint = buildFeedbackFingerprint(input.type, input.title, input.details);
  const db = getFirebaseAdminDb();
  const nowMs = Date.now();
  const feedbackRef = db.collection("feedback_items").doc();

  await db.runTransaction(async (tx) => {
    const controlRef = feedbackControlDoc(normalizedUid);
    const controlSnap = await tx.get(controlRef);
    const state = normalizeFeedbackControlState(controlSnap.data());
    const submissionEvents = pruneSubmissionEvents(state.submissionEvents, nowMs);

    if (submissionEvents.some((entry) => entry.fingerprint === fingerprint)) {
      throw new FeedbackApiError("feedback/duplicate-submission", "You recently submitted similar feedback. Please wait before sending it again.", 429);
    }
    if (submissionEvents.length >= FEEDBACK_SUBMISSION_LIMIT) {
      throw new FeedbackApiError("feedback/submission-rate-limited", "Daily submission limit reached. Please try again later.", 429);
    }

    submissionEvents.push({ atMs: nowMs, fingerprint });
    tx.create(feedbackRef, {
      feedbackId: feedbackRef.id,
      ...input.createPayload,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastActivityAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    });
    tx.set(
      controlRef,
      {
        schemaVersion: 1,
        submissionEvents: submissionEvents.slice(-FEEDBACK_SUBMISSION_LIMIT),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { feedbackId: feedbackRef.id };
}

export async function toggleFeedbackVoteWithLimits(input: {
  uid: string;
  feedbackId: string;
}) {
  const normalizedUid = asString(input.uid, 120);
  const normalizedFeedbackId = asString(input.feedbackId, 120);
  if (!normalizedUid || !normalizedFeedbackId) {
    throw new FeedbackApiError("feedback/invalid-vote", "Feedback vote target is unavailable.", 400);
  }

  const db = getFirebaseAdminDb();
  const nowMs = Date.now();
  return db.runTransaction(async (tx) => {
    const controlRef = feedbackControlDoc(normalizedUid);
    const itemRef = db.collection("feedback_items").doc(normalizedFeedbackId);
    const voteRef = itemRef.collection("votes").doc(normalizedUid);

    const [controlSnap, itemSnap, voteSnap] = await Promise.all([
      tx.get(controlRef),
      tx.get(itemRef),
      tx.get(voteRef),
    ]);

    if (!itemSnap.exists) {
      throw new FeedbackApiError("feedback/not-found", "Feedback item not found.", 404);
    }

    const state = normalizeFeedbackControlState(controlSnap.data());
    const voteToggleByFeedbackId = pruneVoteToggleMap(state.voteToggleByFeedbackId, nowMs);
    const lastToggleAtMs = Math.floor(Number(voteToggleByFeedbackId[normalizedFeedbackId] || 0));
    if (lastToggleAtMs > 0 && nowMs - lastToggleAtMs < FEEDBACK_VOTE_COOLDOWN_MS) {
      throw new FeedbackApiError("feedback/vote-cooldown", "Please wait before voting on this item again.", 429);
    }

    const currentCount = Math.max(0, Math.floor(Number(itemSnap.get("upvoteCount") || 0) || 0));
    const upvoted = !voteSnap.exists;
    const nextCount = upvoted ? currentCount + 1 : Math.max(0, currentCount - 1);
    const jiraIssueBrowseUrl = asString(itemSnap.get("jiraIssueBrowseUrl"), 2048) || null;

    voteToggleByFeedbackId[normalizedFeedbackId] = nowMs;
    if (upvoted) {
      tx.create(voteRef, {
        uid: normalizedUid,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.delete(voteRef);
    }

    tx.set(
      itemRef,
      {
        upvoteCount: nextCount,
        updatedAt: FieldValue.serverTimestamp(),
        lastActivityAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(
      controlRef,
      {
        schemaVersion: 1,
        voteToggleByFeedbackId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      upvoted,
      upvoteCount: nextCount,
      jiraIssueBrowseUrl,
    };
  });
}
