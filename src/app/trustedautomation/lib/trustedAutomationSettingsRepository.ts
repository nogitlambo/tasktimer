import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import {
  AUTOMATION_SETTINGS_COLLECTION,
  AUTOMATION_SETTINGS_DOCUMENT_ID,
  AutomationSettingsSchema,
  createDefaultAutomationSettings,
  type AutomationSettings,
} from "./trustedAutomationPolicy";

type RawRow = Record<string, unknown>;

function safeUid(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function asMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    const millis = Number((value as { toMillis: () => number }).toMillis());
    return Number.isFinite(millis) ? millis : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  return 0;
}

function toIso(value: unknown) {
  if (value instanceof Timestamp || value instanceof Date || (value && typeof (value as { toMillis?: unknown }).toMillis === "function")) {
    const millis = asMillis(value);
    return Number.isFinite(millis) ? new Date(millis).toISOString() : "";
  }
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(Date.parse(value)).toISOString();
  return "";
}

export function buildAutomationSettingsFirestoreRecord(settings: AutomationSettings) {
  return {
    ...settings,
    createdAt: Timestamp.fromMillis(Date.parse(settings.createdAt)),
    updatedAt: Timestamp.fromMillis(Date.parse(settings.updatedAt)),
  };
}

export function parseAutomationSettingsRecord(value: unknown, expectedUid?: string): AutomationSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as RawRow;
  const parsed = AutomationSettingsSchema.safeParse({
    ...raw,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
  });
  if (!parsed.success) return null;
  if (expectedUid && parsed.data.userId !== expectedUid) return null;
  return parsed.data;
}

export interface AutomationSettingsRepository {
  loadOrCreate(uid: string): Promise<AutomationSettings>;
  save(uid: string, settings: AutomationSettings): Promise<void>;
}

export function createFirestoreAutomationSettingsRepository(
  db: Firestore = getFirebaseAdminDb(),
  now: () => number = Date.now
): AutomationSettingsRepository {
  function settingsRef(uid: string) {
    return db.collection("users").doc(uid).collection(AUTOMATION_SETTINGS_COLLECTION).doc(AUTOMATION_SETTINGS_DOCUMENT_ID);
  }

  return {
    async loadOrCreate(uid) {
      const normalizedUid = safeUid(uid);
      if (!normalizedUid) throw Object.assign(new Error("Automation settings ownership is invalid."), { code: "automation/ownership" });
      const snapshot = await settingsRef(normalizedUid).get();
      if (snapshot.exists) {
        const settings = parseAutomationSettingsRecord(snapshot.data(), normalizedUid);
        if (!settings) throw Object.assign(new Error("Stored automation settings are invalid."), { code: "automation/invalid-settings" });
        return settings;
      }
      const settings = createDefaultAutomationSettings(normalizedUid, now());
      await this.save(normalizedUid, settings);
      return settings;
    },
    async save(uid, settings) {
      const normalizedUid = safeUid(uid);
      if (!normalizedUid || settings.userId !== normalizedUid) {
        throw Object.assign(new Error("Automation settings ownership mismatch."), { code: "automation/ownership" });
      }
      const parsed = AutomationSettingsSchema.parse(settings);
      await settingsRef(normalizedUid).set(buildAutomationSettingsFirestoreRecord(parsed));
    },
  };
}
