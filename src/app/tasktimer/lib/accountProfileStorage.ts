import { STORAGE_KEY } from "./storage";

export const ACCOUNT_AVATAR_UPDATED_EVENT = "tasktimer:accountAvatarUpdated";

const AVATAR_SELECTION_STORAGE_PREFIX = `${STORAGE_KEY}:avatarSelection:`;
const AVATAR_CUSTOM_STORAGE_PREFIX = `${STORAGE_KEY}:avatarCustom:`;
const RANK_THUMBNAIL_STORAGE_PREFIX = `${STORAGE_KEY}:rankThumbnail:`;

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

export function avatarStorageKeyForUid(uid: string) {
  return `${AVATAR_SELECTION_STORAGE_PREFIX}${uid}`;
}

export function avatarCustomStorageKeyForUid(uid: string) {
  return `${AVATAR_CUSTOM_STORAGE_PREFIX}${uid}`;
}

export function rankThumbnailStorageKeyForUid(uid: string) {
  return `${RANK_THUMBNAIL_STORAGE_PREFIX}${uid}`;
}

export function customAvatarIdForUid(uid: string) {
  return `custom-upload:${uid}`;
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
