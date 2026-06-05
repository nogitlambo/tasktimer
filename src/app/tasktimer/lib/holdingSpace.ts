import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { getFirebaseStorageClient } from "@/lib/firebaseStorageClient";
import { sanitizeRichNoteHtml } from "../client/rich-session-notes";

export const HOLDING_SPACE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const HOLDING_SPACE_MAX_ATTACHMENTS = 10;

export const HOLDING_SPACE_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const HOLDING_SPACE_SHADOW_KEY = "taskticker_tasks_v1:shadow:holdingSpace";

export type HoldingSpaceAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  storagePath: string;
  downloadUrl: string;
  createdAtMs: number;
};

export type HoldingSpaceDocument = {
  schemaVersion: 1;
  contentHtml: string;
  attachments: HoldingSpaceAttachment[];
  updatedAtMs: number;
};

export type HoldingSpaceUploadValidation =
  | { ok: true }
  | { ok: false; message: string };

function nowMs() {
  return Date.now();
}

function currentUid() {
  return String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
}

function holdingSpaceDocRef(uid: string) {
  const db = getFirebaseFirestoreClient();
  if (!db || !uid) return null;
  return doc(db, "users", uid, "holdingSpace", "v1");
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `hs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanFileName(value: unknown) {
  const name = String(value || "file").trim().replace(/[\\/:*?"<>|#%{}^~[\]`]/g, "-");
  return name.slice(0, 160) || "file";
}

function storagePathFor(uid: string, attachmentId: string, name: string) {
  return `users/${uid}/holding-space/${attachmentId}/${cleanFileName(name)}`;
}

function normalizeAttachment(raw: unknown): HoldingSpaceAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<HoldingSpaceAttachment>;
  const id = String(row.id || "").trim();
  const name = cleanFileName(row.name);
  const contentType = String(row.contentType || "").trim().toLowerCase();
  const storagePath = String(row.storagePath || "").trim();
  const downloadUrl = String(row.downloadUrl || "").trim();
  const size = Math.max(0, Math.floor(Number(row.size || 0) || 0));
  const createdAtMs = Math.max(0, Math.floor(Number(row.createdAtMs || 0) || 0)) || nowMs();
  if (!id || !storagePath) return null;
  return {
    id,
    name,
    contentType,
    size,
    storagePath,
    downloadUrl,
    createdAtMs,
  };
}

export function normalizeHoldingSpaceDocument(raw: unknown): HoldingSpaceDocument {
  const row = raw && typeof raw === "object" ? (raw as Partial<HoldingSpaceDocument>) : {};
  const attachments = Array.isArray(row.attachments)
    ? row.attachments.map(normalizeAttachment).filter((entry): entry is HoldingSpaceAttachment => !!entry)
    : [];
  attachments.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return {
    schemaVersion: 1,
    contentHtml: sanitizeRichNoteHtml(row.contentHtml || ""),
    attachments,
    updatedAtMs: Math.max(0, Math.floor(Number(row.updatedAtMs || 0) || 0)) || nowMs(),
  };
}

function readShadow(uid: string): HoldingSpaceDocument {
  if (typeof window === "undefined") return normalizeHoldingSpaceDocument(null);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HOLDING_SPACE_SHADOW_KEY) || "null") as {
      uid?: string;
      data?: unknown;
    } | null;
    if (!parsed || String(parsed.uid || "").trim() !== uid) return normalizeHoldingSpaceDocument(null);
    return normalizeHoldingSpaceDocument(parsed.data);
  } catch {
    return normalizeHoldingSpaceDocument(null);
  }
}

function writeShadow(uid: string, value: HoldingSpaceDocument) {
  if (typeof window === "undefined" || !uid) return;
  try {
    window.localStorage.setItem(HOLDING_SPACE_SHADOW_KEY, JSON.stringify({ uid, data: value }));
  } catch {
    // Ignore browser storage failures; Firestore remains authoritative.
  }
}

export function clearHoldingSpaceShadow() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HOLDING_SPACE_SHADOW_KEY);
  } catch {
    // ignore localStorage failures
  }
}

export function validateHoldingSpaceFile(file: Pick<File, "name" | "size" | "type">): HoldingSpaceUploadValidation {
  if (!file) return { ok: false, message: "Choose a file to upload." };
  if (file.size > HOLDING_SPACE_MAX_FILE_BYTES) return { ok: false, message: "Files must be 10 MB or smaller." };
  const contentType = String(file.type || "").trim().toLowerCase();
  const extension = String(file.name || "").trim().toLowerCase().split(".").pop() || "";
  const inferredMarkdown = extension === "md" || extension === "markdown";
  if (HOLDING_SPACE_ALLOWED_MIME_TYPES.has(contentType) || (inferredMarkdown && (!contentType || contentType === "application/octet-stream"))) {
    return { ok: true };
  }
  return { ok: false, message: "Unsupported file type." };
}

export async function loadHoldingSpaceDocument(): Promise<HoldingSpaceDocument> {
  const uid = currentUid();
  if (!uid) return normalizeHoldingSpaceDocument(null);
  const fallback = readShadow(uid);
  const ref = holdingSpaceDocRef(uid);
  if (!ref) return fallback;
  try {
    const snap = await getDoc(ref);
    const next = normalizeHoldingSpaceDocument(snap.exists() ? snap.data() : fallback);
    writeShadow(uid, next);
    return next;
  } catch {
    return fallback;
  }
}

export async function saveHoldingSpaceDocument(input: Pick<HoldingSpaceDocument, "contentHtml" | "attachments">): Promise<HoldingSpaceDocument> {
  const uid = currentUid();
  if (!uid) throw new Error("You must be signed in to save Holding Space.");
  const next = normalizeHoldingSpaceDocument({
    ...input,
    updatedAtMs: nowMs(),
  });
  writeShadow(uid, next);
  const ref = holdingSpaceDocRef(uid);
  if (!ref) throw new Error("Cloud storage is not available.");
  await setDoc(
    ref,
    {
      schemaVersion: 1,
      contentHtml: next.contentHtml,
      attachments: next.attachments,
      updatedAtMs: next.updatedAtMs,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return next;
}

export async function uploadHoldingSpaceFile(file: File, currentDoc: HoldingSpaceDocument): Promise<HoldingSpaceDocument> {
  const validation = validateHoldingSpaceFile(file);
  if (!validation.ok) throw new Error(validation.message);
  if (currentDoc.attachments.length >= HOLDING_SPACE_MAX_ATTACHMENTS) {
    throw new Error("Holding Space supports up to 10 files in v1.");
  }
  const uid = currentUid();
  if (!uid) throw new Error("You must be signed in to upload files.");
  const storage = getFirebaseStorageClient();
  if (!storage) throw new Error("File storage is not available.");
  const id = createId();
  const name = cleanFileName(file.name);
  const rawContentType = String(file.type || "").trim().toLowerCase();
  const extension = String(file.name || "").trim().toLowerCase().split(".").pop() || "";
  const contentType =
    (extension === "md" || extension === "markdown") && (!rawContentType || rawContentType === "application/octet-stream")
      ? "text/markdown"
      : rawContentType;
  const storagePath = storagePathFor(uid, id, name);
  const objectRef = ref(storage, storagePath);
  await uploadBytes(objectRef, file, {
    contentType,
    customMetadata: {
      ownerUid: uid,
      attachmentId: id,
    },
  });
  const downloadUrl = await getDownloadURL(objectRef);
  const attachment: HoldingSpaceAttachment = {
    id,
    name,
    contentType,
    size: file.size,
    storagePath,
    downloadUrl,
    createdAtMs: nowMs(),
  };
  return saveHoldingSpaceDocument({
    contentHtml: currentDoc.contentHtml,
    attachments: [attachment, ...currentDoc.attachments],
  });
}

export async function deleteHoldingSpaceAttachment(attachmentId: string, currentDoc: HoldingSpaceDocument): Promise<HoldingSpaceDocument> {
  const target = currentDoc.attachments.find((entry) => entry.id === attachmentId);
  const nextAttachments = currentDoc.attachments.filter((entry) => entry.id !== attachmentId);
  const nextDoc = await saveHoldingSpaceDocument({
    contentHtml: currentDoc.contentHtml,
    attachments: nextAttachments,
  });
  if (target?.storagePath) {
    const storage = getFirebaseStorageClient();
    if (storage) {
      await deleteObject(ref(storage, target.storagePath)).catch(() => {});
    }
  }
  return nextDoc;
}

export async function deleteHoldingSpaceDocument(): Promise<void> {
  const uid = currentUid();
  if (!uid) return;
  const ref = holdingSpaceDocRef(uid);
  if (!ref) return;
  await deleteDoc(ref);
  clearHoldingSpaceShadow();
}
