import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseStorageClient } from "@/lib/firebaseStorageClient";
import type { SessionNoteAttachment } from "./types";
import {
  HOLDING_SPACE_ALLOWED_MIME_TYPES,
  HOLDING_SPACE_MAX_ATTACHMENTS,
  HOLDING_SPACE_MAX_FILE_BYTES,
  validateHoldingSpaceFile,
} from "./holdingSpace";

export {
  HOLDING_SPACE_ALLOWED_MIME_TYPES as SESSION_NOTE_ALLOWED_MIME_TYPES,
  HOLDING_SPACE_MAX_ATTACHMENTS as SESSION_NOTE_MAX_ATTACHMENTS,
  HOLDING_SPACE_MAX_FILE_BYTES as SESSION_NOTE_MAX_FILE_BYTES,
};

export type SessionNoteAttachmentValidation = { ok: true } | { ok: false; message: string };

function nowMs() {
  return Date.now();
}

function currentUid() {
  return String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `sna-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cleanSessionNoteAttachmentFileName(value: unknown) {
  const name = String(value || "file").trim().replace(/[\\/:*?"<>|#%{}^~[\]`]/g, "-");
  return name.slice(0, 160) || "file";
}

function storagePathFor(uid: string, attachmentId: string, name: string) {
  return `users/${uid}/session-notes/${attachmentId}/${cleanSessionNoteAttachmentFileName(name)}`;
}

export function validateSessionNoteAttachmentFile(file: Pick<File, "name" | "size" | "type">): SessionNoteAttachmentValidation {
  return validateHoldingSpaceFile(file);
}

export function normalizeSessionNoteAttachment(raw: unknown): SessionNoteAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<SessionNoteAttachment>;
  const id = String(row.id || "").trim();
  const name = cleanSessionNoteAttachmentFileName(row.name);
  const contentType = String(row.contentType || "").trim().toLowerCase();
  const storagePath = String(row.storagePath || "").trim();
  const downloadUrl = String(row.downloadUrl || "").trim();
  const size = Math.max(0, Math.floor(Number(row.size || 0) || 0));
  const createdAtMs = Math.max(0, Math.floor(Number(row.createdAtMs || 0) || 0)) || nowMs();
  if (!id || !storagePath) return null;
  return { id, name, contentType, size, storagePath, downloadUrl, createdAtMs };
}

export function normalizeSessionNoteAttachments(raw: unknown): SessionNoteAttachment[] {
  const rows = Array.isArray(raw) ? raw : [];
  const attachments = rows.map(normalizeSessionNoteAttachment).filter((entry): entry is SessionNoteAttachment => !!entry);
  attachments.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return attachments.slice(0, HOLDING_SPACE_MAX_ATTACHMENTS);
}

export async function uploadSessionNoteAttachment(
  file: File,
  currentAttachments: SessionNoteAttachment[] = []
): Promise<SessionNoteAttachment> {
  const validation = validateSessionNoteAttachmentFile(file);
  if (!validation.ok) throw new Error(validation.message);
  if (currentAttachments.length >= HOLDING_SPACE_MAX_ATTACHMENTS) {
    throw new Error("Session notes support up to 10 files in v1.");
  }
  const uid = currentUid();
  if (!uid) throw new Error("You must be signed in to upload files.");
  const storage = getFirebaseStorageClient();
  if (!storage) throw new Error("File storage is not available.");
  const id = createId();
  const name = cleanSessionNoteAttachmentFileName(file.name);
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
    customMetadata: { ownerUid: uid, attachmentId: id },
  });
  return {
    id,
    name,
    contentType,
    size: file.size,
    storagePath,
    downloadUrl: await getDownloadURL(objectRef),
    createdAtMs: nowMs(),
  };
}

export async function deleteSessionNoteAttachmentFile(attachment: Pick<SessionNoteAttachment, "storagePath"> | null | undefined): Promise<void> {
  const storagePath = String(attachment?.storagePath || "").trim();
  const storage = getFirebaseStorageClient();
  if (!storagePath || !storage) return;
  await deleteObject(ref(storage, storagePath)).catch(() => {});
}
