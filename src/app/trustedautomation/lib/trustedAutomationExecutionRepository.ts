import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import {
  AutomationExecutionPersistenceEntitySchema,
  buildAutomationExecutionPersistenceEntity,
  parseAutomationExecutionPersistenceEntity,
} from "./trustedAutomationPersistence";
import { AutomationExecutionSchema, canTransitionAutomationExecution, type AutomationExecution } from "./trustedAutomationContract";

export const AUTOMATION_EXECUTION_COLLECTION = "automationExecutions";
export const AUTOMATION_EXECUTION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function normalizedUid(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function normalizedExecutionId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 180) : "";
}

function asMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return Number((value as { toMillis: () => number }).toMillis());
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  return Number.NaN;
}

function toIso(value: unknown) {
  const millis = asMillis(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : "";
}

export function buildAutomationExecutionFirestoreRecord(execution: AutomationExecution, nowMs = Date.now()) {
  const createdAtMs = Date.parse(execution.createdAt);
  const updatedAt = execution.finishedAt || execution.startedAt || execution.createdAt;
  const entity = buildAutomationExecutionPersistenceEntity(execution, {
    createdAt: execution.createdAt,
    updatedAt,
    retentionExpiresAt: new Date(createdAtMs + AUTOMATION_EXECUTION_RETENTION_MS).toISOString(),
  });
  const parsed = AutomationExecutionPersistenceEntitySchema.parse(entity);
  return {
    ...parsed,
    createdAt: Timestamp.fromMillis(createdAtMs),
    updatedAt: Timestamp.fromMillis(Date.parse(parsed.updatedAt)),
    retentionExpiresAt: Timestamp.fromMillis(Date.parse(parsed.retentionExpiresAt)),
    writtenAt: Timestamp.fromMillis(nowMs),
  };
}

export function parseAutomationExecutionRecord(value: unknown): AutomationExecution | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const parsed = parseAutomationExecutionPersistenceEntity({
    ...raw,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    retentionExpiresAt: toIso(raw.retentionExpiresAt),
  });
  return parsed;
}

export interface AutomationExecutionRepository {
  create(uid: string, execution: AutomationExecution): Promise<void>;
  update(uid: string, execution: AutomationExecution): Promise<void>;
  get(uid: string, executionId: string): Promise<AutomationExecution | null>;
}

export function createFirestoreAutomationExecutionRepository(
  db: Firestore = getFirebaseAdminDb(),
  now: () => number = Date.now
): AutomationExecutionRepository {
  function executionRef(uid: string, executionId: string) {
    return db.collection("users").doc(uid).collection(AUTOMATION_EXECUTION_COLLECTION).doc(executionId);
  }

  function validate(uid: string, execution: AutomationExecution) {
    if (!normalizedUid(uid) || !normalizedExecutionId(execution.id)) {
      throw Object.assign(new Error("Automation execution ownership is invalid."), { code: "automation/ownership" });
    }
    try {
      return AutomationExecutionSchema.parse(execution);
    } catch {
      throw Object.assign(new Error("Automation execution is invalid."), { code: "automation/invalid-execution" });
    }
  }

  function validateTransition(current: AutomationExecution | null, next: AutomationExecution) {
    if (!current) return;
    if (current.idempotencyKey !== next.idempotencyKey) {
      throw Object.assign(new Error("Automation execution idempotency conflict."), { code: "automation/idempotency-conflict" });
    }
    if (current.state !== next.state && !canTransitionAutomationExecution(current.state, next.state)) {
      throw Object.assign(new Error("Automation execution state transition is invalid."), { code: "automation/invalid-transition" });
    }
  }

  async function readCurrent(ref: ReturnType<typeof executionRef>) {
    const snapshot = await ref.get();
    if (!snapshot.exists) return null;
    const raw = snapshot.data() as Record<string, unknown>;
    const retentionExpiresAt = asMillis(raw.retentionExpiresAt);
    if (Number.isFinite(retentionExpiresAt) && retentionExpiresAt <= now()) return null;
    const parsed = parseAutomationExecutionRecord(raw);
    if (!parsed) throw Object.assign(new Error("Stored automation execution is invalid."), { code: "automation/invalid-execution" });
    return parsed;
  }

  return {
    async create(uid, execution) {
      const parsed = validate(uid, execution);
      await executionRef(normalizedUid(uid), parsed.id).create(buildAutomationExecutionFirestoreRecord(parsed, now()));
    },
    async update(uid, execution) {
      const parsed = validate(uid, execution);
      const ref = executionRef(normalizedUid(uid), parsed.id);
      const transactionRunner = (db as unknown as {
        runTransaction?: (callback: (transaction: {
          get: (target: ReturnType<typeof executionRef>) => Promise<{ exists: boolean; data: () => unknown }>;
          set: (target: ReturnType<typeof executionRef>, value: unknown) => void;
        }) => Promise<void>) => Promise<unknown>;
      }).runTransaction;
      const record = buildAutomationExecutionFirestoreRecord(parsed, now());
      if (transactionRunner) {
        await transactionRunner.call(db, async (transaction) => {
          const snapshot = await transaction.get(ref);
          const raw = snapshot.exists ? snapshot.data() as Record<string, unknown> : null;
          const retentionExpiresAt = raw ? asMillis(raw.retentionExpiresAt) : Number.NaN;
          const current = snapshot.exists && (!Number.isFinite(retentionExpiresAt) || retentionExpiresAt > now())
            ? parseAutomationExecutionRecord(raw)
            : null;
          if (snapshot.exists && !current) throw Object.assign(new Error("Stored automation execution is invalid."), { code: "automation/invalid-execution" });
          if (!current) throw Object.assign(new Error("Automation execution does not exist."), { code: "automation/not-found" });
          validateTransition(current, parsed);
          transaction.set(ref, record);
        });
        return;
      }
      const current = await readCurrent(ref);
      validateTransition(current, parsed);
      if (!current) throw Object.assign(new Error("Automation execution does not exist."), { code: "automation/not-found" });
      await ref.set(record);
    },
    async get(uid, executionId) {
      const safeUid = normalizedUid(uid);
      const safeExecutionId = normalizedExecutionId(executionId);
      if (!safeUid || !safeExecutionId) return null;
      const snapshot = await executionRef(safeUid, safeExecutionId).get();
      if (!snapshot.exists) return null;
      const raw = snapshot.data() as Record<string, unknown>;
      const retentionExpiresAt = asMillis(raw.retentionExpiresAt);
      if (Number.isFinite(retentionExpiresAt) && retentionExpiresAt <= now()) return null;
      return parseAutomationExecutionRecord(raw);
    },
  };
}
