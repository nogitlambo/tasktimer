export const ACCOUNT_AVATAR_UPDATED_EVENT = "tasktimer:accountAvatarUpdated";
export const ACCOUNT_PROFILE_UPDATED_EVENT = "tasktimer:accountProfileUpdated";

const TASKTIMER_STORAGE_KEY = "taskticker_tasks_v1";
const AVATAR_SELECTION_STORAGE_PREFIX = `${TASKTIMER_STORAGE_KEY}:avatarSelection:`;
const AVATAR_CUSTOM_STORAGE_PREFIX = `${TASKTIMER_STORAGE_KEY}:avatarCustom:`;
const AVATAR_CUSTOM_UPLOADS_STORAGE_PREFIX = `${TASKTIMER_STORAGE_KEY}:avatarCustomUploads:`;
const RANK_THUMBNAIL_STORAGE_PREFIX = `${TASKTIMER_STORAGE_KEY}:rankThumbnail:`;
export const MAX_STORED_CUSTOM_AVATARS = 5;

export type StoredCustomAvatarUpload = {
  id: string;
  src: string;
  label: string;
  createdAt: number;
};

function safeRead(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function safeWrite(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!value) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore localStorage failures
  }
}

function avatarStorageKeyForUid(uid: string) {
  return `${AVATAR_SELECTION_STORAGE_PREFIX}${uid}`;
}

function avatarCustomStorageKeyForUid(uid: string) {
  return `${AVATAR_CUSTOM_STORAGE_PREFIX}${uid}`;
}

function avatarCustomUploadsStorageKeyForUid(uid: string) {
  return `${AVATAR_CUSTOM_UPLOADS_STORAGE_PREFIX}${uid}`;
}

function rankThumbnailStorageKeyForUid(uid: string) {
  return `${RANK_THUMBNAIL_STORAGE_PREFIX}${uid}`;
}

export function customAvatarIdForUid(uid: string) {
  return `custom-upload:${uid}`;
}

export function customAvatarUploadIdForUid(uid: string, createdAt: number) {
  return `${customAvatarIdForUid(uid)}:${Math.max(0, Math.floor(createdAt || 0))}`;
}

export function isCustomAvatarIdForUid(uid: string, avatarId: string): boolean {
  if (!uid) return false;
  return String(avatarId || "").trim().startsWith(customAvatarIdForUid(uid));
}

export function googleAvatarIdForUid(uid: string) {
  return `google/profile-photo:${uid}`;
}

export function readStoredAvatarId(uid: string): string {
  if (!uid) return "";
  return safeRead(avatarStorageKeyForUid(uid));
}

export function readStoredCustomAvatarSrc(uid: string): string {
  if (!uid) return "";
  return safeRead(avatarCustomStorageKeyForUid(uid));
}

function normalizeStoredCustomAvatarUploads(value: unknown): StoredCustomAvatarUpload[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const uploads: StoredCustomAvatarUpload[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = String(raw.id || "").trim();
    const src = String(raw.src || "").trim();
    const label = String(raw.label || "").trim() || "Custom Upload";
    const createdAt = Math.max(0, Math.floor(Number(raw.createdAt) || 0));
    if (!id || !src || seen.has(id)) continue;
    seen.add(id);
    uploads.push({ id, src, label, createdAt });
  }
  return uploads.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_STORED_CUSTOM_AVATARS);
}

export function readStoredCustomAvatarUploads(uid: string): StoredCustomAvatarUpload[] {
  if (!uid || typeof window === "undefined") return [];
  try {
    return normalizeStoredCustomAvatarUploads(JSON.parse(window.localStorage.getItem(avatarCustomUploadsStorageKeyForUid(uid)) || "[]"));
  } catch {
    return [];
  }
}

export function writeStoredCustomAvatarUploads(uid: string, uploads: StoredCustomAvatarUpload[]): void {
  if (!uid || typeof window === "undefined") return;
  const nextUploads = normalizeStoredCustomAvatarUploads(uploads);
  try {
    if (!nextUploads.length) window.localStorage.removeItem(avatarCustomUploadsStorageKeyForUid(uid));
    else window.localStorage.setItem(avatarCustomUploadsStorageKeyForUid(uid), JSON.stringify(nextUploads));
  } catch {
    // ignore localStorage failures
  }
}

export function appendStoredCustomAvatarUpload(
  uid: string,
  upload: Pick<StoredCustomAvatarUpload, "id" | "src" | "label" | "createdAt">,
): StoredCustomAvatarUpload[] {
  if (!uid) return [];
  const nextUploads = normalizeStoredCustomAvatarUploads([upload, ...readStoredCustomAvatarUploads(uid)]);
  writeStoredCustomAvatarUploads(uid, nextUploads);
  return nextUploads;
}

export function findStoredCustomAvatarUploadSrc(uid: string, avatarId: string): string {
  if (!uid) return "";
  const normalizedAvatarId = String(avatarId || "").trim();
  if (!normalizedAvatarId) return "";
  const upload = readStoredCustomAvatarUploads(uid).find((item) => item.id === normalizedAvatarId);
  return String(upload?.src || "").trim();
}

export function migrateStoredCustomAvatarSrcToUploads(uid: string): StoredCustomAvatarUpload[] {
  if (!uid) return [];
  const legacySrc = readStoredCustomAvatarSrc(uid);
  if (!legacySrc) return readStoredCustomAvatarUploads(uid);
  const legacyId = customAvatarIdForUid(uid);
  const currentUploads = readStoredCustomAvatarUploads(uid);
  if (currentUploads.some((item) => item.id === legacyId || item.src === legacySrc)) return currentUploads;
  return appendStoredCustomAvatarUpload(uid, {
    id: legacyId,
    src: legacySrc,
    label: "Custom Upload 1",
    createdAt: 0,
  });
}

export function readStoredRankThumbnailSrc(uid: string): string {
  if (!uid) return "";
  return safeRead(rankThumbnailStorageKeyForUid(uid));
}

export function writeStoredAvatarId(uid: string, avatarId: string): void {
  if (!uid) return;
  safeWrite(avatarStorageKeyForUid(uid), String(avatarId || "").trim());
}

export function writeStoredCustomAvatarSrc(uid: string, src: string): void {
  if (!uid) return;
  safeWrite(avatarCustomStorageKeyForUid(uid), String(src || "").trim());
}

export function writeStoredRankThumbnailSrc(uid: string, src: string): void {
  if (!uid) return;
  safeWrite(rankThumbnailStorageKeyForUid(uid), String(src || "").trim());
}

export function notifyAccountAvatarUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACCOUNT_AVATAR_UPDATED_EVENT));
}

export function notifyAccountProfileUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACCOUNT_PROFILE_UPDATED_EVENT));
}
