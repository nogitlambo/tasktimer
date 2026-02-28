import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";

type UserPreferencesV1 = {
  schemaVersion: 1;
  avatarId: string;
  theme: "light" | "dark";
  defaultTaskTimerFormat: "day" | "hour" | "minute";
  dynamicColorsEnabled: boolean;
  checkpointAlertSoundEnabled: boolean;
  checkpointAlertToastEnabled: boolean;
  modeSettings: Record<string, unknown> | null;
  updatedAtMs: number;
};

type StartSyncOptions = {
  avatarSelectionStoragePrefix: string;
  storageKeys: {
    theme: string;
    defaultTaskTimerFormat: string;
    dynamicColorsEnabled: string;
    checkpointAlertSoundEnabled: string;
    checkpointAlertToastEnabled: string;
    modeSettings: string;
  };
  onCloudPreferencesApplied?: () => void;
};

const SYNC_DOC_ID = "v1";
const SYNC_STATUS_EVENT = "tasktimer:preferences-sync-state";

type SyncStatusPayload = {
  status: "idle" | "syncing" | "synced" | "error";
  message: string;
  atMs: number;
};

function emitSyncStatus(status: SyncStatusPayload["status"], message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SyncStatusPayload>(SYNC_STATUS_EVENT, {
      detail: {
        status,
        message,
        atMs: Date.now(),
      },
    })
  );
}

function parseBooleanLike(raw: string | null | undefined, fallback: boolean) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "true" || value === "1" || value === "on") return true;
  if (value === "false" || value === "0" || value === "off") return false;
  return fallback;
}

function parseTheme(raw: string | null | undefined): "light" | "dark" {
  return raw === "light" ? "light" : "dark";
}

function parseTimerFormat(raw: string | null | undefined): "day" | "hour" | "minute" {
  if (raw === "day" || raw === "minute") return raw;
  return "hour";
}

function parseModeSettings(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readLocalPreferences(uid: string, opts: StartSyncOptions): UserPreferencesV1 {
  const { storageKeys, avatarSelectionStoragePrefix } = opts;
  const avatarId = String(localStorage.getItem(`${avatarSelectionStoragePrefix}${uid}`) || "").trim();
  const theme = parseTheme(localStorage.getItem(storageKeys.theme));
  const defaultTaskTimerFormat = parseTimerFormat(localStorage.getItem(storageKeys.defaultTaskTimerFormat));
  const dynamicColorsEnabled = parseBooleanLike(localStorage.getItem(storageKeys.dynamicColorsEnabled), true);
  const checkpointAlertSoundEnabled = parseBooleanLike(localStorage.getItem(storageKeys.checkpointAlertSoundEnabled), true);
  const checkpointAlertToastEnabled = parseBooleanLike(localStorage.getItem(storageKeys.checkpointAlertToastEnabled), true);
  const modeSettings = parseModeSettings(localStorage.getItem(storageKeys.modeSettings));

  return {
    schemaVersion: 1,
    avatarId,
    theme,
    defaultTaskTimerFormat,
    dynamicColorsEnabled,
    checkpointAlertSoundEnabled,
    checkpointAlertToastEnabled,
    modeSettings,
    updatedAtMs: Date.now(),
  };
}

function applyCloudPreferencesToLocal(uid: string, prefs: UserPreferencesV1, opts: StartSyncOptions) {
  const { storageKeys, avatarSelectionStoragePrefix } = opts;
  localStorage.setItem(storageKeys.theme, prefs.theme);
  localStorage.setItem(storageKeys.defaultTaskTimerFormat, prefs.defaultTaskTimerFormat);
  localStorage.setItem(storageKeys.dynamicColorsEnabled, prefs.dynamicColorsEnabled ? "true" : "false");
  localStorage.setItem(storageKeys.checkpointAlertSoundEnabled, prefs.checkpointAlertSoundEnabled ? "true" : "false");
  localStorage.setItem(storageKeys.checkpointAlertToastEnabled, prefs.checkpointAlertToastEnabled ? "true" : "false");
  if (prefs.modeSettings && typeof prefs.modeSettings === "object") {
    localStorage.setItem(storageKeys.modeSettings, JSON.stringify(prefs.modeSettings));
  }
  if (prefs.avatarId) localStorage.setItem(`${avatarSelectionStoragePrefix}${uid}`, prefs.avatarId);
  window.dispatchEvent(new CustomEvent("tasktimer:preferences-cloud-applied"));
}

function normalizeCloudDoc(data: Record<string, unknown>): UserPreferencesV1 {
  const maybeModeSettings =
    data.modeSettings && typeof data.modeSettings === "object" ? (data.modeSettings as Record<string, unknown>) : null;
  return {
    schemaVersion: 1,
    avatarId: String(data.avatarId || "").trim(),
    theme: parseTheme(String(data.theme || "")),
    defaultTaskTimerFormat: parseTimerFormat(String(data.defaultTaskTimerFormat || "")),
    dynamicColorsEnabled: parseBooleanLike(String(data.dynamicColorsEnabled || ""), true),
    checkpointAlertSoundEnabled: parseBooleanLike(String(data.checkpointAlertSoundEnabled || ""), true),
    checkpointAlertToastEnabled: parseBooleanLike(String(data.checkpointAlertToastEnabled || ""), true),
    modeSettings: maybeModeSettings,
    updatedAtMs: Number.isFinite(Number(data.updatedAtMs)) ? Number(data.updatedAtMs) : Date.now(),
  };
}

function hashPreferences(prefs: UserPreferencesV1) {
  return JSON.stringify({
    avatarId: prefs.avatarId,
    theme: prefs.theme,
    defaultTaskTimerFormat: prefs.defaultTaskTimerFormat,
    dynamicColorsEnabled: prefs.dynamicColorsEnabled,
    checkpointAlertSoundEnabled: prefs.checkpointAlertSoundEnabled,
    checkpointAlertToastEnabled: prefs.checkpointAlertToastEnabled,
    modeSettings: prefs.modeSettings,
  });
}

export function startUserPreferencesCloudSync(opts: StartSyncOptions): () => void {
  if (typeof window === "undefined") return () => {};
  const auth = getFirebaseAuthClient();
  const db = getFirebaseFirestoreClient();
  if (!auth || !db) return () => {};

  let activeUid = "";
  let disposed = false;
  let pullTimer: number | null = null;
  let pushTimer: number | null = null;
  let pendingPushTimer: number | null = null;
  let suppressPushUntil = 0;
  let lastKnownHash = "";

  const clearTimers = () => {
    if (pullTimer != null) window.clearInterval(pullTimer);
    if (pushTimer != null) window.clearInterval(pushTimer);
    if (pendingPushTimer != null) window.clearTimeout(pendingPushTimer);
    pullTimer = null;
    pushTimer = null;
    pendingPushTimer = null;
  };

  const docRefForUid = (uid: string) => doc(db, "users", uid, "preferences", SYNC_DOC_ID);

  const pushLocalToCloudNow = async (uid: string) => {
    if (disposed || !uid) return;
    emitSyncStatus("syncing", "Syncing preferences...");
    const local = readLocalPreferences(uid, opts);
    const nextHash = hashPreferences(local);
    try {
      await setDoc(
        docRefForUid(uid),
        {
          ...local,
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      lastKnownHash = nextHash;
      emitSyncStatus("synced", "Preferences synced");
    } catch {
      // best effort sync; keep local behavior if cloud write fails
      emitSyncStatus("error", "Sync unavailable. Using local settings.");
    }
  };

  const pullCloudWithCloudWins = async (uid: string) => {
    if (disposed || !uid) return;
    emitSyncStatus("syncing", "Syncing preferences...");
    try {
      const snapshot = await getDoc(docRefForUid(uid));
      if (!snapshot.exists()) {
        await pushLocalToCloudNow(uid);
        return;
      }
      const data = snapshot.data() as Record<string, unknown>;
      const cloud = normalizeCloudDoc(data);
      const local = readLocalPreferences(uid, opts);
      const cloudHash = hashPreferences(cloud);
      const localHash = hashPreferences(local);
      if (cloudHash !== localHash) {
        applyCloudPreferencesToLocal(uid, cloud, opts);
        suppressPushUntil = Date.now() + 2500;
        if (opts.onCloudPreferencesApplied) opts.onCloudPreferencesApplied();
      }
      lastKnownHash = cloudHash;
      emitSyncStatus("synced", "Preferences synced");
    } catch {
      // keep local behavior during network/auth/firestore errors
      emitSyncStatus("error", "Sync unavailable. Using local settings.");
    }
  };

  const schedulePushIfLocalChanged = () => {
    if (disposed || !activeUid) return;
    if (Date.now() < suppressPushUntil) return;
    const local = readLocalPreferences(activeUid, opts);
    const nextHash = hashPreferences(local);
    if (!nextHash || nextHash === lastKnownHash) return;
    if (pendingPushTimer != null) window.clearTimeout(pendingPushTimer);
    pendingPushTimer = window.setTimeout(() => {
      pendingPushTimer = null;
      void pushLocalToCloudNow(activeUid);
    }, 700);
  };

  const startLoopForUid = (uid: string) => {
    clearTimers();
    activeUid = uid;
    if (!activeUid) return;
    void pullCloudWithCloudWins(activeUid);
    pullTimer = window.setInterval(() => {
      void pullCloudWithCloudWins(activeUid);
    }, 20000);
    pushTimer = window.setInterval(() => {
      schedulePushIfLocalChanged();
    }, 2000);
  };

  const unsubAuth = onAuthStateChanged(auth, (user: User | null) => {
    if (disposed) return;
    if (!user?.uid) {
      activeUid = "";
      clearTimers();
      lastKnownHash = "";
      emitSyncStatus("idle", "Sign in to sync preferences.");
      return;
    }
    emitSyncStatus("syncing", "Syncing preferences...");
    startLoopForUid(user.uid);
  });

  const onOnline = () => {
    if (!activeUid) return;
    void pullCloudWithCloudWins(activeUid);
  };
  const onVisibility = () => {
    if (document.visibilityState !== "visible" || !activeUid) return;
    void pullCloudWithCloudWins(activeUid);
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    disposed = true;
    clearTimers();
    try {
      unsubAuth();
    } catch {
      // ignore
    }
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
