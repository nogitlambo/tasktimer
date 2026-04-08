import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";

import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";

export type FeedbackType = "bug" | "general" | "feature";
export type FeedbackStatus = "open" | "planned" | "in_progress" | "shipped" | "closed";

export type FeedbackVote = {
  uid: string;
  createdAt: Timestamp | null;
};

export type FeedbackItem = {
  feedbackId: string;
  ownerUid: string;
  authorDisplayName: string | null;
  authorEmail: string | null;
  authorRankThumbnailSrc: string | null;
  authorCurrentRankId: string | null;
  isAnonymous: boolean;
  type: FeedbackType;
  title: string;
  details: string;
  status: FeedbackStatus;
  upvoteCount: number;
  commentCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  lastActivityAt: Timestamp | null;
  schemaVersion: number;
  jiraIssueBrowseUrl: string | null;
  viewerHasUpvoted?: boolean;
};

export type ToggleFeedbackUpvoteResult =
  | { ok: true; upvoted: boolean; upvoteCount: number; jiraIssueBrowseUrl: string | null }
  | { ok: false; message: string };

export type CreateFeedbackItemInput = {
  ownerUid: string;
  authorDisplayName?: string | null;
  authorEmail?: string | null;
  authorRankThumbnailSrc?: string | null;
  authorCurrentRankId?: string | null;
  isAnonymous: boolean;
  type: FeedbackType;
  title: string;
  details: string;
  jiraIssueBrowseUrl?: string | null;
  authToken: string;
};

function dbOrNull() {
  return getFirebaseFirestoreClient();
}

function normalizeFeedbackType(value: unknown): FeedbackType {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "bug" || raw === "feature") return raw;
  return "general";
}

function normalizeFeedbackStatus(value: unknown): FeedbackStatus {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "planned" || raw === "in_progress" || raw === "shipped" || raw === "closed") return raw;
  return "open";
}

function normalizeString(value: unknown, maxLength: number): string {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function normalizeNullableString(value: unknown, maxLength: number): string | null {
  const normalized = normalizeString(value, maxLength);
  return normalized ? normalized : null;
}

function asFeedbackItem(snapshot: QueryDocumentSnapshot): FeedbackItem {
  const row = snapshot.data() as Record<string, unknown>;
  return {
    feedbackId: String(row.feedbackId || snapshot.id),
    ownerUid: String(row.ownerUid || ""),
    authorDisplayName: normalizeNullableString(row.authorDisplayName, 120),
    authorEmail: normalizeNullableString(row.authorEmail, 320),
    authorRankThumbnailSrc: normalizeNullableString(row.authorRankThumbnailSrc, 1024),
    authorCurrentRankId: normalizeNullableString(row.authorCurrentRankId, 120),
    isAnonymous: !!row.isAnonymous,
    type: normalizeFeedbackType(row.type),
    title: normalizeString(row.title, 160),
    details: normalizeString(row.details, 8000),
    status: normalizeFeedbackStatus(row.status),
    upvoteCount: Math.max(0, Math.floor(Number(row.upvoteCount || 0) || 0)),
    commentCount: Math.max(0, Math.floor(Number(row.commentCount || 0) || 0)),
    createdAt: (row.createdAt as Timestamp) || null,
    updatedAt: (row.updatedAt as Timestamp) || null,
    lastActivityAt: (row.lastActivityAt as Timestamp) || null,
    schemaVersion: Math.max(1, Math.floor(Number(row.schemaVersion || 1) || 1)),
    jiraIssueBrowseUrl: normalizeNullableString(row.jiraIssueBrowseUrl, 2048),
  };
}

function feedbackItemsCollection() {
  const db = dbOrNull();
  return db ? collection(db, "feedback_items") : null;
}

function feedbackVoteDoc(feedbackId: string, uid: string) {
  const db = dbOrNull();
  return db ? doc(db, "feedback_items", feedbackId, "votes", uid) : null;
}

export async function createFeedbackItem(input: CreateFeedbackItemInput): Promise<{ ok: true; item: FeedbackItem } | { ok: false; message: string }> {
  try {
    const ownerUid = normalizeString(input.ownerUid, 120);
    const title = normalizeString(input.title, 160);
    const details = normalizeString(input.details, 8000);
    if (!ownerUid) return { ok: false, message: "You must be signed in to submit feedback." };
    if (!title) return { ok: false, message: "A feedback title is required." };
    if (!details) return { ok: false, message: "Feedback details are required." };
    const response = await fetch("/api/feedback", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "x-firebase-auth": normalizeString(input.authToken, 8192),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authToken: normalizeString(input.authToken, 8192),
        authorCurrentRankId: normalizeNullableString(input.authorCurrentRankId, 120),
        authorDisplayName: normalizeNullableString(input.authorDisplayName, 120),
        authorEmail: normalizeNullableString(input.authorEmail, 320),
        authorRankThumbnailSrc: normalizeNullableString(input.authorRankThumbnailSrc, 1024),
        details,
        isAnonymous: !!input.isAnonymous,
        title,
        type: normalizeFeedbackType(input.type),
      }),
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; jiraIssueBrowseUrl?: string | null; jiraIssueKey?: string | null }
      | null;
    if (!response.ok) {
      return { ok: false, message: result?.error || "Could not submit feedback." };
    }
    return {
      ok: true,
      item: {
        feedbackId: "",
        ownerUid,
        authorDisplayName: normalizeNullableString(input.authorDisplayName, 120),
        authorEmail: normalizeNullableString(input.authorEmail, 320),
        authorRankThumbnailSrc: normalizeNullableString(input.authorRankThumbnailSrc, 1024),
        authorCurrentRankId: normalizeNullableString(input.authorCurrentRankId, 120),
        isAnonymous: !!input.isAnonymous,
        type: normalizeFeedbackType(input.type),
        title,
        details,
        status: "open",
        upvoteCount: 0,
        commentCount: 0,
        createdAt: null,
        updatedAt: null,
        lastActivityAt: null,
        schemaVersion: 1,
        jiraIssueBrowseUrl: normalizeNullableString(result?.jiraIssueBrowseUrl, 2048),
      },
    };
  } catch (error) {
    const message = String((error as FirestoreError | undefined)?.message || "").trim();
    return { ok: false, message: message || "Could not submit feedback." };
  }
}

export async function listFeedbackItems(opts?: { viewerUid?: string | null }): Promise<FeedbackItem[]> {
  const col = feedbackItemsCollection();
  if (!col) return [];
  const viewerUid = normalizeString(opts?.viewerUid, 120);
  const snap = await getDocs(query(col, orderBy("lastActivityAt", "desc")));
  const items = snap.docs.map((row) => asFeedbackItem(row));
  if (!viewerUid || !items.length) return items;

  const voteDocs = await Promise.all(items.map((item) => getDoc(feedbackVoteDoc(item.feedbackId, viewerUid)!)));
  return items.map((item, index) => ({ ...item, viewerHasUpvoted: voteDocs[index]?.exists?.() || false }));
}

export function subscribeToFeedbackItems(
  opts: { viewerUid?: string | null },
  onChange: (items: FeedbackItem[]) => void,
  onError?: (message: string) => void
): Unsubscribe {
  const col = feedbackItemsCollection();
  if (!col) {
    onError?.("Cloud Firestore is not available.");
    return () => {};
  }
  const viewerUid = normalizeString(opts.viewerUid, 120);
  return onSnapshot(
    query(col, orderBy("lastActivityAt", "desc")),
    async (snap) => {
      try {
        const items = snap.docs.map((row) => asFeedbackItem(row));
        if (!viewerUid || !items.length) {
          onChange(items);
          return;
        }
        const voteDocs = await Promise.all(items.map((item) => getDoc(feedbackVoteDoc(item.feedbackId, viewerUid)!)));
        onChange(items.map((item, index) => ({ ...item, viewerHasUpvoted: voteDocs[index]?.exists?.() || false })));
      } catch (error) {
        const message = String((error as FirestoreError | undefined)?.message || "").trim();
        onError?.(message || "Could not load feedback.");
      }
    },
    (error) => {
      const message = String((error as FirestoreError | undefined)?.message || "").trim();
      onError?.(message || "Could not subscribe to feedback.");
    }
  );
}

export async function hasUserUpvoted(feedbackId: string, uid: string): Promise<boolean> {
  const voteRef = feedbackVoteDoc(normalizeString(feedbackId, 120), normalizeString(uid, 120));
  if (!voteRef) return false;
  const snap = await getDoc(voteRef);
  return snap.exists();
}

export async function toggleFeedbackUpvote(
  feedbackIdRaw: string,
  uidRaw: string,
  authTokenRaw: string
): Promise<ToggleFeedbackUpvoteResult> {
  try {
    const feedbackId = normalizeString(feedbackIdRaw, 120);
    const uid = normalizeString(uidRaw, 120);
    const authToken = normalizeString(authTokenRaw, 8192);
    if (!feedbackId || !uid) return { ok: false, message: "You must be signed in to vote." };
    const response = await fetch("/api/feedback", {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "x-firebase-auth": authToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authToken,
        feedbackId,
      }),
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; upvoted?: boolean; upvoteCount?: number; jiraIssueBrowseUrl?: string | null }
      | null;
    if (!response.ok) {
      return { ok: false, message: result?.error || "Could not update vote." };
    }
    return {
      ok: true,
      upvoted: result?.upvoted === true,
      upvoteCount: Math.max(0, Math.floor(Number(result?.upvoteCount || 0) || 0)),
      jiraIssueBrowseUrl: normalizeNullableString(result?.jiraIssueBrowseUrl, 2048),
    };
  } catch (error) {
    const message = String((error as FirestoreError | undefined)?.message || (error as Error | undefined)?.message || "").trim();
    return { ok: false, message: message || "Could not update vote." };
  }
}

