import type { Firestore } from "firebase-admin/firestore";

import { createFirestoreNextBestActionRepository, type NextBestActionCandidateLoadInput } from "@/app/nextbestaction/lib/nextBestActionRepository";
import type { NextBestActionCandidate } from "@/app/nextbestaction/lib/nextBestActionRanking";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import type { RecoveryBacklogTask } from "./recoveryPlanning";

type RawTask = Record<string, unknown>;

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function asDate(value: unknown) {
  const date = asString(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function asNonNegativeInteger(value: unknown) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function asPriority(value: unknown): RecoveryBacklogTask["priority"] {
  return value === "low" || value === "medium" || value === "high" || value === "urgent" ? value : null;
}

function ageInDays(localDate: string, createdAtMs: number) {
  if (!createdAtMs) return 0;
  const today = Date.parse(`${localDate}T00:00:00.000Z`);
  const created = new Date(createdAtMs).toISOString().slice(0, 10);
  const createdDate = Date.parse(`${created}T00:00:00.000Z`);
  return Number.isFinite(today) && Number.isFinite(createdDate) ? Math.max(0, Math.floor((today - createdDate) / 86_400_000)) : 0;
}

export function mapNextBestActionCandidateToRecoveryTask(candidate: NextBestActionCandidate, localDate: string): RecoveryBacklogTask | null {
  const task = candidate.task as unknown as RawTask;
  const taskId = asString(task.id, 160);
  if (!taskId || candidate.active === false || candidate.deleted || candidate.completed || candidate.actionable === false || candidate.ownerUid === "") return null;
  const title = asString(task.name, 200);
  const dueDate = asDate(task.onceOffTargetDate) || asDate(task.dueDate);
  const createdAtMs = asNonNegativeInteger(task.createdAtMs);
  const postponementCount = Math.max(asNonNegativeInteger(task.postponementCount), asNonNegativeInteger(candidate.postponementCount));
  return {
    taskId,
    taskVersion: asString(candidate.taskVersion, 200) || "unknown",
    title,
    dueDate,
    priority: asPriority(candidate.explicitPriority || task.priority),
    hardDeadline: task.hardDeadline === true,
    pinned: task.pinned === true,
    inProgress: task.inProgress === true || task.running === true,
    blocksImportantWork: candidate.blocksImportantWork === true || task.blocksImportantWork === true,
    flexible: task.flexible === true || task.flexibility === "flexible",
    stale: task.stale === true || task.staleTask === true || postponementCount >= 3 || ageInDays(localDate, createdAtMs) >= 90,
    requiresClarification: task.requiresClarification === true || candidate.clarification?.status === "ACTIVE" || !title,
    carriedOver: task.carriedOver === true || (dueDate != null && dueDate < localDate) || (asDate(task.resumePendingSinceDayKey) != null && (asDate(task.resumePendingSinceDayKey) as string) < localDate),
    recentlyMoved: task.recentlyMoved === true,
    postponementCount,
    nextBestActionCandidate: candidate,
  };
}

export type RecoveryPlanningRepository = {
  loadBacklog(input: NextBestActionCandidateLoadInput & { localDate: string }): Promise<RecoveryBacklogTask[]>;
};

export function createFirestoreRecoveryPlanningRepository(db: Firestore = getFirebaseAdminDb()): RecoveryPlanningRepository {
  const nextBestActionRepository = createFirestoreNextBestActionRepository(db);
  return {
    async loadBacklog(input) {
      const candidates = await nextBestActionRepository.loadCandidates(input);
      return candidates
        .map((candidate) => mapNextBestActionCandidateToRecoveryTask(candidate, input.localDate))
        .filter((task): task is RecoveryBacklogTask => task != null)
        .filter((task) => task.carriedOver || (task.dueDate != null && task.dueDate <= input.localDate) || task.inProgress || task.hardDeadline || task.requiresClarification);
    },
  };
}
