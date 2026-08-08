import { createHash } from "node:crypto";
import { z } from "zod";

import type { RecommendationType } from "@/app/recommendations/lib/recommendationContract";

export const TASK_CLARIFICATION_PROMPT_VERSION = "task-clarification-v1";
export const TASK_CLARIFICATION_RECOMMENDATION_TTL_MS = 24 * 60 * 60 * 1000;
export const TASK_CLARIFICATION_AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const TASK_CLARIFICATION_USER_INSTRUCTION_MAX_LENGTH = 280;

const reasonCodes = [
  "TASK_TOO_BROAD",
  "NO_CLEAR_OUTCOME",
  "MISSING_FIRST_ACTION",
  "MULTIPLE_ACTIONS",
  "UNCLEAR_SCOPE",
  "UNCLEAR_OBJECT",
  "RESEARCH_NOT_TIME_BOXED",
  "POSSIBLE_PROJECT",
  "MISSING_INFORMATION",
  "FREQUENTLY_POSTPONED",
  "DURATION_UNCERTAIN",
] as const;

export const TaskClarificationReasonCodeSchema = z.enum(reasonCodes);

const nullableText = (maxLength: number) =>
  z.union([
    z
      .string()
      .trim()
      .max(maxLength)
      .transform((value) => value || null),
    z.null(),
  ]);

export const TaskClarificationSubtaskSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    estimatedMinutes: z.number().int().min(1).max(480).nullable(),
  })
  .strict();

export const TaskClarificationResponseSchema = z
  .object({
    suggestedTitle: nullableText(160),
    definitionOfDone: nullableText(500),
    firstAction: nullableText(240),
    stoppingPoint: nullableText(240),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
    estimatedRange: z
      .object({
        min: z.number().int().min(1).max(1440),
        max: z.number().int().min(1).max(1440),
      })
      .strict()
      .nullable(),
    subtasks: z.array(TaskClarificationSubtaskSchema).max(8),
    clarificationQuestions: z.array(z.string().trim().min(1).max(240)).max(3),
    warnings: z.array(z.string().trim().min(1).max(240)).max(3).default([]),
    reasonCodes: z.array(TaskClarificationReasonCodeSchema).max(reasonCodes.length),
    confidence: z.number().min(0).max(1),
    ambiguityScore: z.number().min(0).max(1),
    initiationDifficultyScore: z.number().min(0).max(1),
  })
  .strict();

export type TaskClarificationResponse = z.infer<typeof TaskClarificationResponseSchema>;
export type TaskClarificationRecommendationSubtask = TaskClarificationResponse["subtasks"][number] & { id: string };

export type TaskClarificationStatus =
  | "ACTIVE"
  | "ACCEPTED"
  | "PARTIALLY_ACCEPTED"
  | "DISMISSED"
  | "EXPIRED"
  | "REVERSED";

export type TaskClarificationApplyStatus = "NOT_APPLIED" | "APPLIED";
export type TaskClarificationUndoStatus = "NOT_AVAILABLE" | "AVAILABLE" | "EXPIRED" | "REVERSED" | "PARTIALLY_REVERSED";
export type TaskClarificationUndoResult = "REVERSED" | "PARTIALLY_REVERSED" | "NO_CHANGES" | null;
export type TaskClarificationSupportedTaskFields = { name?: string };

export type TaskClarificationTaskContext = {
  taskId: string;
  title: string;
  taskType?: "recurring" | "once-off";
  dueDate?: string;
  sourceTaskVersion: string;
};

export type TaskClarificationProviderInput = {
  taskId: string;
  title: string;
  taskType?: "recurring" | "once-off";
  dueDate?: string;
  timezone: string;
  currentDate: string;
  userInstruction?: string;
};

export interface TaskClarificationAIProvider {
  clarifyTask(input: TaskClarificationProviderInput): Promise<TaskClarificationResponse>;
}

export type TaskClarificationRecommendation = Omit<TaskClarificationResponse, "subtasks"> & {
  subtasks: TaskClarificationRecommendationSubtask[];
  type?: Extract<RecommendationType, "TASK_CLARIFICATION">;
  id: string;
  userId: string;
  taskId: string;
  sourceTaskVersion: string;
  status: TaskClarificationStatus;
  originalTitle: string;
  userInstruction: string | null;
  sourceRecommendationId: string | null;
  regenerationCount: number;
  applyIdempotencyKey: string | null;
  applyStatus: TaskClarificationApplyStatus;
  applyResult: "APPLIED" | "NO_SUPPORTED_CHANGES" | null;
  originalTaskFields: TaskClarificationSupportedTaskFields | null;
  appliedTaskFields: TaskClarificationSupportedTaskFields | null;
  appliedTaskVersion: string | null;
  reversibleUntil: string | null;
  undoIdempotencyKey: string | null;
  undoStatus: TaskClarificationUndoStatus;
  undoResult: TaskClarificationUndoResult;
  undoConflicts: string[];
  createdSubtaskProvenance: Array<{ recommendationSubtaskId: string; taskId: string }>;
  acceptedFields: string[];
  rejectedFields: string[];
  createdSubtaskIds: string[];
  createdSubtaskVersions: Array<{ taskId: string; sourceTaskVersion: string }>;
  removedSubtaskIds: string[];
  modelVersion: string;
  promptVersion: string;
  createdAt: string;
  respondedAt: string | null;
  expiresAt: string;
  auditExpiresAt: string;
};

export class TaskClarificationValidationError extends Error {
  status = 502;
  code = "task-clarification/provider-invalid";
}

export class TaskClarificationInputError extends Error {
  status = 400;
  code = "task-clarification/invalid-instruction";
}

export function normalizeTaskClarificationUserInstruction(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new TaskClarificationInputError("Task clarification instructions must be text.");
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > TASK_CLARIFICATION_USER_INSTRUCTION_MAX_LENGTH) {
    throw new TaskClarificationInputError("Task clarification instructions are too long.");
  }
  return normalized;
}

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function stableValue(value: unknown): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return Number((value as { toMillis: () => number }).toMillis());
  }
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, stableValue((value as Record<string, unknown>)[key])])
    );
  }
  return String(value);
}

export function computeTaskClarificationSourceVersion(taskId: string, rawTask: Record<string, unknown>) {
  const payload = JSON.stringify(stableValue({ taskId, task: rawTask }));
  return createHash("sha256").update(payload).digest("hex");
}

export function createTaskClarificationTaskContext(
  taskId: string,
  rawTask: Record<string, unknown> | null | undefined
): TaskClarificationTaskContext | null {
  const normalizedTaskId = asString(taskId, 160);
  const title = asString(rawTask?.name, 160);
  if (!normalizedTaskId || !title || !rawTask) return null;

  const taskType = rawTask.taskType === "once-off" ? "once-off" : "recurring";
  const rawDueDate = asString(rawTask.onceOffTargetDate, 40);
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDueDate) ? rawDueDate : undefined;

  return {
    taskId: normalizedTaskId,
    title,
    taskType,
    ...(dueDate ? { dueDate } : {}),
    sourceTaskVersion: computeTaskClarificationSourceVersion(normalizedTaskId, rawTask),
  };
}

export function parseTaskClarificationResponse(
  value: unknown,
  parentTitle: string
): TaskClarificationResponse {
  const parsed = TaskClarificationResponseSchema.parse(value);
  if (parsed.estimatedRange && parsed.estimatedRange.min > parsed.estimatedRange.max) {
    throw new TaskClarificationValidationError("Task clarification returned an invalid duration range.");
  }

  const parentKey = normalizeComparableTitle(parentTitle);
  const seen = new Set<string>();
  for (const subtask of parsed.subtasks) {
    const key = normalizeComparableTitle(subtask.title);
    if (!key || key === parentKey || seen.has(key)) {
      throw new TaskClarificationValidationError("Task clarification returned duplicate subtasks.");
    }
    seen.add(key);
  }
  return parsed;
}

function normalizeComparableTitle(value: string) {
  return asString(value, 240).toLocaleLowerCase().replace(/\s+/g, " ");
}

export function createTaskClarificationRecommendation(input: {
  id: string;
  userId: string;
  task: TaskClarificationTaskContext;
  response: TaskClarificationResponse;
  modelVersion: string;
  promptVersion?: string;
  userInstruction?: string;
  sourceRecommendationId?: string | null;
  regenerationCount?: number;
  nowMs: number;
}): TaskClarificationRecommendation {
  const createdAt = new Date(input.nowMs).toISOString();
  return {
    id: asString(input.id, 160),
    userId: asString(input.userId, 120),
    taskId: input.task.taskId,
    sourceTaskVersion: input.task.sourceTaskVersion,
    type: "TASK_CLARIFICATION",
    status: "ACTIVE",
    originalTitle: input.task.title,
    userInstruction: normalizeTaskClarificationUserInstruction(input.userInstruction) || null,
    sourceRecommendationId: input.sourceRecommendationId || null,
    regenerationCount: Math.max(0, Math.floor(Number(input.regenerationCount) || 0)),
    applyIdempotencyKey: null,
    applyStatus: "NOT_APPLIED",
    applyResult: null,
    originalTaskFields: null,
    appliedTaskFields: null,
    appliedTaskVersion: null,
    reversibleUntil: null,
    undoIdempotencyKey: null,
    undoStatus: "NOT_AVAILABLE",
    undoResult: null,
    undoConflicts: [],
    ...input.response,
    subtasks: input.response.subtasks.map((subtask, index) => ({ ...subtask, id: `subtask-${index + 1}` })),
    acceptedFields: [],
    rejectedFields: [],
    createdSubtaskIds: [],
    createdSubtaskVersions: [],
    removedSubtaskIds: [],
    createdSubtaskProvenance: [],
    modelVersion: asString(input.modelVersion, 120),
    promptVersion: asString(input.promptVersion || TASK_CLARIFICATION_PROMPT_VERSION, 120),
    createdAt,
    respondedAt: null,
    expiresAt: new Date(input.nowMs + TASK_CLARIFICATION_RECOMMENDATION_TTL_MS).toISOString(),
    auditExpiresAt: new Date(input.nowMs + TASK_CLARIFICATION_AUDIT_RETENTION_MS).toISOString(),
  };
}
