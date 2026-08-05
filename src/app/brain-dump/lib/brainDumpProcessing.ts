import { z } from "zod";

import type { DeletedTaskMeta, Task } from "@/app/tasktimer/lib/types";

export const BRAIN_DUMP_TYPED_PROMPT_ID = "brain-dump-v1";
export const BRAIN_DUMP_VOICE_TRANSCRIPTION_PROMPT_ID = "brain-dump-voice-transcription-v1";
export const BRAIN_DUMP_VOICE_MAX_MS = 5 * 60 * 1000;
const BRAIN_DUMP_UNFINISHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const brainDumpItemTypeSchema = z.enum([
  "task",
  "project",
  "recurrence",
  "dependency",
  "location",
  "energy",
  "subtask",
  "note",
  "event",
  "reference",
]);

const brainDumpDateSourceSchema = z.enum(["explicit", "inferred", "suggested", "none"]);
const brainDumpPrioritySchema = z.enum(["low", "medium", "high"]);

const providerItemSchema = z
  .object({
    id: z.string().trim().min(1).max(120).optional(),
    itemType: brainDumpItemTypeSchema,
    title: z.string().trim().min(1).max(200),
    sourceEvidence: z.array(z.string().trim().min(1).max(280)).max(5).default([]),
    confidence: z.number().min(0).max(1),
    ambiguityFlags: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
    dueDateText: z.string().trim().min(1).max(160).optional(),
    dateSource: brainDumpDateSourceSchema.default("none"),
    recurrenceText: z.string().trim().min(1).max(200).optional(),
    dependencyTimingText: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
    estimatedDurationMinutes: z.number().min(1).max(24 * 60).optional(),
    priority: brainDumpPrioritySchema.optional(),
    firstAction: z.string().trim().min(1).max(240).optional(),
  })
  .strict();

const providerResponseSchema = z
  .object({
    items: z.array(providerItemSchema).min(1).max(100),
  })
  .strict();

const voiceTranscriptionResponseSchema = z
  .object({
    transcript: z.string().trim().min(1).max(20_000),
  })
  .strict();

export type BrainDumpItemType = z.infer<typeof brainDumpItemTypeSchema>;
export type BrainDumpDateSource = z.infer<typeof brainDumpDateSourceSchema>;
export type BrainDumpPriority = z.infer<typeof brainDumpPrioritySchema>;

export type BrainDumpReviewDate = {
  originalDateText: string | null;
  dateSource: BrainDumpDateSource;
  timezone: string;
  resolvedDate: string | null;
  dateConfidence: number;
  ambiguity: "none" | "ambiguous";
  ambiguityFlags: string[];
  userConfirmedDate: boolean;
  recurrenceText: string | null;
  dependencyTimingText: string | null;
};

export type BrainDumpReviewEnrichment = {
  notes: string | null;
  estimatedDurationMinutes: number | null;
  priority: BrainDumpPriority | null;
  firstAction: string | null;
};

export type BrainDumpReviewValidationError = {
  field: "title" | "estimatedDurationMinutes" | "notes" | "priority" | "firstAction" | "date";
  message: string;
};

export type BrainDumpDuplicateDecision = "undecided" | "create_anyway" | "skip";

export type BrainDumpDuplicateWarning = {
  id: string;
  source: "same-dump" | "workspace";
  matchType: "title" | "title-date";
  matchedItemId: string | null;
  matchedTaskId: string | null;
  matchedTitle: string;
  matchedState: "proposed" | "active" | "recent" | "archived";
  reason: string;
};

export type BrainDumpReviewItem = {
  id: string;
  itemType: BrainDumpItemType;
  title: string;
  selected: boolean;
  sourceEvidence: string[];
  confidence: number;
  ambiguityFlags: string[];
  supported: boolean;
  date: BrainDumpReviewDate;
  enrichment: BrainDumpReviewEnrichment;
  validationErrors: BrainDumpReviewValidationError[];
  duplicateWarnings: BrainDumpDuplicateWarning[];
  duplicateDecision: BrainDumpDuplicateDecision;
};

export type BrainDumpReviewDateUpdate = {
  resolvedDate?: string | null;
  userConfirmedDate?: boolean;
};

export type BrainDumpReviewEnrichmentUpdate = Partial<{
  notes: string | null;
  estimatedDurationMinutes: number | string | null;
  priority: BrainDumpPriority | "" | null;
  firstAction: string | null;
}>;

export type BrainDumpReviewItemUpdate = {
  itemId: string;
  title?: string;
  selected?: boolean;
  date?: BrainDumpReviewDateUpdate;
  enrichment?: BrainDumpReviewEnrichmentUpdate;
  duplicateDecision?: BrainDumpDuplicateDecision;
};

export type BrainDumpSessionState = "review" | "completed";

export type BrainDumpCreationBatchResult = {
  sessionId: string;
  idempotencyKey: string;
  payloadHash: string;
  state: "completed" | "partially_failed" | "failed";
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  retryableCount: number;
  completedAtMs: number;
  items: Array<{
    itemId: string;
    status: "created" | "skipped" | "failed";
    createdTaskId?: string;
    createdTaskSnapshot?: Task;
    reason?: string;
    retryable?: boolean;
  }>;
};

export type BrainDumpUndoBatchResult = {
  sessionId: string;
  idempotencyKey: string;
  state: "undone" | "partially_undone" | "not_undone" | "expired";
  removedCount: number;
  retainedCount: number;
  completedAtMs: number;
  items: Array<{
    itemId: string;
    status: "removed" | "retained" | "skipped";
    createdTaskId?: string;
    reason?: string;
  }>;
};

export type BrainDumpCreationReceipt = {
  idempotencyKey: string;
  payloadHash: string;
  state: "in_progress" | BrainDumpCreationBatchResult["state"];
  startedAtMs: number;
  completedAtMs?: number;
  batchResult?: BrainDumpCreationBatchResult;
};

export type BrainDumpReviewSession = {
  id: string;
  ownerUid: string;
  mode: "typed";
  state: BrainDumpSessionState;
  promptId: typeof BRAIN_DUMP_TYPED_PROMPT_ID;
  createdAtMs: number;
  expiresAtMs: number;
  source: {
    kind: "typed";
    rawText: string;
  };
  review: {
    selectedCount: number;
    items: BrainDumpReviewItem[];
  };
  batchResult?: BrainDumpCreationBatchResult;
  undoResult?: BrainDumpUndoBatchResult;
  creationReceipts?: Record<string, BrainDumpCreationReceipt>;
};

export type BrainDumpAiProvider = {
  extractTyped(input: { promptId: typeof BRAIN_DUMP_TYPED_PROMPT_ID; text: string; timezone: string }): Promise<unknown>;
  transcribeVoice?(input: {
    promptId: typeof BRAIN_DUMP_VOICE_TRANSCRIPTION_PROMPT_ID;
    audioBase64: string;
    mimeType: string;
    timezone: string;
    uid: string;
  }): Promise<unknown>;
};

export type BrainDumpSessionStore = {
  saveSession(session: BrainDumpReviewSession): Promise<void>;
  getSession(uid: string, sessionId: string): Promise<BrainDumpReviewSession | null>;
};

export class BrainDumpInputError extends Error {
  status = 400;
  code = "brain-dump/invalid-input";
}

export class BrainDumpProviderValidationError extends Error {
  status = 502;
  code = "brain-dump/provider-schema-invalid";
}

export class BrainDumpReviewUpdateError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "BrainDumpReviewUpdateError";
  }
}

function asTrimmedString(value: unknown, maxLength = 0) {
  const text = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function normalizeTypedInput(text: unknown) {
  const normalized = asTrimmedString(text);
  if (!normalized) {
    throw new BrainDumpInputError("Enter a Brain Dump before submitting.");
  }
  if (normalized.length > 20_000) {
    throw new BrainDumpInputError("Brain Dump input must be 20,000 characters or fewer.");
  }
  return normalized;
}

function normalizeTimezone(timezone: unknown) {
  return asTrimmedString(timezone, 120) || "UTC";
}

function normalizeVoiceAudioBase64(value: unknown) {
  const audioBase64 = asTrimmedString(value);
  if (!audioBase64) throw new BrainDumpInputError("Record audio before transcribing.");
  if (!/^[a-zA-Z0-9+/=_-]+$/.test(audioBase64)) throw new BrainDumpInputError("Voice recording data is invalid.");
  return audioBase64;
}

function normalizeVoiceMimeType(value: unknown) {
  const mimeType = asTrimmedString(value, 80).toLowerCase();
  if (mimeType !== "audio/webm") throw new BrainDumpInputError("Brain Dump voice recording must use audio/webm.");
  return mimeType;
}

function normalizeVoiceDurationMs(value: unknown) {
  const durationMs = Math.max(0, Math.floor(Number(value) || 0));
  if (!durationMs) throw new BrainDumpInputError("Voice recording duration is required.");
  if (durationMs > BRAIN_DUMP_VOICE_MAX_MS) {
    throw new BrainDumpInputError("Brain Dump voice recordings must be five minutes or shorter.");
  }
  return durationMs;
}

function normalizeNullableText(value: unknown, maxLength: number) {
  if (value === null) return null;
  const text = asTrimmedString(value, maxLength);
  return text || null;
}

function normalizeDurationMinutes(value: unknown) {
  if (value === null || value === "") return null;
  const minutes = Math.floor(Number(value));
  if (!Number.isFinite(minutes)) return null;
  return Math.max(1, Math.min(24 * 60, minutes));
}

function normalizePriority(value: unknown): BrainDumpPriority | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function normalizeDuplicateDecision(value: unknown): BrainDumpDuplicateDecision | undefined {
  if (value === "undecided" || value === "create_anyway" || value === "skip") return value;
  return undefined;
}

function normalizeDateValue(value: unknown) {
  if (value === null) return null;
  const text = asTrimmedString(value, 40);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeDuplicateTitle(value: unknown) {
  return asTrimmedString(value, 200)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|to|for|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function taskDate(task: Task) {
  return typeof task.onceOffTargetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(task.onceOffTargetDate) ? task.onceOffTargetDate : null;
}

function taskState(task: Task, nowMs: number): BrainDumpDuplicateWarning["matchedState"] {
  const completedAtMs = Math.max(0, Math.floor(Number(task.timeGoalCompletedAtMs || 0) || 0));
  const recentWindowMs = 14 * 24 * 60 * 60 * 1000;
  return completedAtMs > 0 && nowMs - completedAtMs <= recentWindowMs ? "recent" : "active";
}

function duplicateWarningId(input: {
  itemId: string;
  source: BrainDumpDuplicateWarning["source"];
  matchedId: string;
}) {
  return `${input.itemId}-${input.source}-${input.matchedId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function warningsForItem(input: {
  item: BrainDumpReviewItem;
  previousItems: BrainDumpReviewItem[];
  workspaceTasks: Task[];
  archivedTaskMeta: DeletedTaskMeta;
  nowMs: number;
}): BrainDumpDuplicateWarning[] {
  const title = normalizeDuplicateTitle(input.item.title);
  if (!title || !input.item.supported) return [];
  const date = input.item.date.resolvedDate;
  const warnings: BrainDumpDuplicateWarning[] = [];

  for (const previousItem of input.previousItems) {
    if (normalizeDuplicateTitle(previousItem.title) !== title) continue;
    const previousDate = previousItem.date.resolvedDate;
    const matchType = date && previousDate && date === previousDate ? "title-date" : "title";
    warnings.push({
      id: duplicateWarningId({ itemId: input.item.id, source: "same-dump", matchedId: previousItem.id }),
      source: "same-dump",
      matchType,
      matchedItemId: previousItem.id,
      matchedTaskId: null,
      matchedTitle: previousItem.title,
      matchedState: "proposed",
      reason: matchType === "title-date" ? "Same proposed title and date." : "Similar proposed title.",
    });
  }

  for (const task of input.workspaceTasks) {
    if (normalizeDuplicateTitle(task.name) !== title) continue;
    const existingDate = taskDate(task);
    const matchType = date && existingDate && date === existingDate ? "title-date" : "title";
    warnings.push({
      id: duplicateWarningId({ itemId: input.item.id, source: "workspace", matchedId: task.id }),
      source: "workspace",
      matchType,
      matchedItemId: null,
      matchedTaskId: task.id,
      matchedTitle: task.name,
      matchedState: taskState(task, input.nowMs),
      reason: matchType === "title-date" ? "Same existing task title and date." : "Similar existing task title.",
    });
  }

  for (const [taskId, meta] of Object.entries(input.archivedTaskMeta || {})) {
    if (meta.state !== "archived") continue;
    if (normalizeDuplicateTitle(meta.name) !== title) continue;
    warnings.push({
      id: duplicateWarningId({ itemId: input.item.id, source: "workspace", matchedId: taskId }),
      source: "workspace",
      matchType: "title",
      matchedItemId: null,
      matchedTaskId: taskId,
      matchedTitle: meta.name,
      matchedState: "archived",
      reason: "Similar archived task title.",
    });
  }

  return warnings;
}

export function refreshBrainDumpDuplicateWarnings(input: {
  items: BrainDumpReviewItem[];
  workspaceTasks?: Task[];
  archivedTaskMeta?: DeletedTaskMeta;
  nowMs: number;
}): BrainDumpReviewItem[] {
  return input.items.map((item, index) => ({
    ...item,
    duplicateWarnings: warningsForItem({
      item,
      previousItems: input.items.slice(0, index),
      workspaceTasks: input.workspaceTasks || [],
      archivedTaskMeta: input.archivedTaskMeta || {},
      nowMs: input.nowMs,
    }),
  }));
}

function createItemId(sessionId: string, index: number, providerId?: string) {
  const normalizedProviderId = asTrimmedString(providerId, 120).replace(/[^a-zA-Z0-9_-]/g, "-");
  return normalizedProviderId || `${sessionId}-item-${index + 1}`;
}

function itemIsSupported(itemType: BrainDumpItemType) {
  return itemType === "task";
}

function formatDateUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateUtc(date);
}

function getLocalDateText(nowMs: number, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(nowMs));
    const year = parts.find((part) => part.type === "year")?.value || "1970";
    const month = parts.find((part) => part.type === "month")?.value || "01";
    const day = parts.find((part) => part.type === "day")?.value || "01";
    return `${year}-${month}-${day}`;
  } catch {
    return formatDateUtc(new Date(nowMs));
  }
}

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function weekdayIndex(dateText: string) {
  const [year, month, day] = dateText.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function resolveDateText(input: { text: string | null; timezone: string; nowMs: number }) {
  const raw = asTrimmedString(input.text, 160);
  if (!raw) return { resolvedDate: null, ambiguity: "none" as const, ambiguityFlags: [] };
  const lower = raw.toLowerCase();
  const today = getLocalDateText(input.nowMs, input.timezone);
  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
    return { resolvedDate: lower, ambiguity: "none" as const, ambiguityFlags: [] };
  }
  if (lower === "today") return { resolvedDate: today, ambiguity: "none" as const, ambiguityFlags: [] };
  if (lower === "tomorrow") return { resolvedDate: addDays(today, 1), ambiguity: "none" as const, ambiguityFlags: [] };
  if (/\b(sometime|around|approx|approximately|next week|later)\b/.test(lower)) {
    return {
      resolvedDate: null,
      ambiguity: "ambiguous" as const,
      ambiguityFlags: [`Date wording "${raw}" needs review before it can affect task creation.`],
    };
  }
  const weekdayMatch = lower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch) {
    const target = WEEKDAY_INDEX[weekdayMatch[2]];
    const current = weekdayIndex(today);
    let delta = (target - current + 7) % 7;
    if (delta === 0 || weekdayMatch[1]) delta += 7;
    return { resolvedDate: addDays(today, delta), ambiguity: "none" as const, ambiguityFlags: [] };
  }
  return {
    resolvedDate: null,
    ambiguity: "ambiguous" as const,
    ambiguityFlags: [`Date wording "${raw}" could not be resolved deterministically.`],
  };
}

function buildReviewDate(input: {
  dueDateText?: string;
  dateSource: BrainDumpDateSource;
  timezone: string;
  nowMs: number;
  recurrenceText?: string;
  dependencyTimingText?: string;
}): BrainDumpReviewDate {
  const originalDateText = asTrimmedString(input.dueDateText, 160) || null;
  const dateSource = originalDateText ? input.dateSource : "none";
  const resolved = resolveDateText({ text: originalDateText, timezone: input.timezone, nowMs: input.nowMs });
  return {
    originalDateText,
    dateSource,
    timezone: input.timezone,
    resolvedDate: resolved.resolvedDate,
    dateConfidence: dateSource === "suggested" ? 0.55 : originalDateText ? 0.9 : 0,
    ambiguity: resolved.ambiguity,
    ambiguityFlags: resolved.ambiguityFlags,
    userConfirmedDate: false,
    recurrenceText: asTrimmedString(input.recurrenceText, 200) || null,
    dependencyTimingText: asTrimmedString(input.dependencyTimingText, 200) || null,
  };
}

function buildReviewEnrichment(input: {
  notes?: string;
  estimatedDurationMinutes?: number;
  priority?: BrainDumpPriority;
  firstAction?: string;
}): BrainDumpReviewEnrichment {
  return {
    notes: normalizeNullableText(input.notes, 1000),
    estimatedDurationMinutes: normalizeDurationMinutes(input.estimatedDurationMinutes),
    priority: normalizePriority(input.priority),
    firstAction: normalizeNullableText(input.firstAction, 240),
  };
}

export function normalizeBrainDumpReviewItemUpdate(update: BrainDumpReviewItemUpdate | null | undefined) {
  const date = update?.date;
  const enrichment = update?.enrichment;
  return {
    itemId: asTrimmedString(update?.itemId, 120),
    title: update && Object.prototype.hasOwnProperty.call(update, "title") ? asTrimmedString(update.title, 200) : undefined,
    selected: typeof update?.selected === "boolean" ? update.selected : undefined,
    date:
      date && typeof date === "object"
        ? {
            resolvedDate:
              Object.prototype.hasOwnProperty.call(date, "resolvedDate") && typeof date.resolvedDate !== "undefined"
                ? normalizeDateValue(date.resolvedDate)
                : undefined,
            userConfirmedDate: typeof date.userConfirmedDate === "boolean" ? date.userConfirmedDate : undefined,
          }
        : undefined,
    enrichment:
      enrichment && typeof enrichment === "object"
        ? {
            notes: Object.prototype.hasOwnProperty.call(enrichment, "notes") ? normalizeNullableText(enrichment.notes, 1000) : undefined,
            estimatedDurationMinutes: Object.prototype.hasOwnProperty.call(enrichment, "estimatedDurationMinutes")
              ? normalizeDurationMinutes(enrichment.estimatedDurationMinutes)
              : undefined,
            priority: Object.prototype.hasOwnProperty.call(enrichment, "priority") ? normalizePriority(enrichment.priority) : undefined,
            firstAction: Object.prototype.hasOwnProperty.call(enrichment, "firstAction")
              ? normalizeNullableText(enrichment.firstAction, 240)
              : undefined,
          }
        : undefined,
    duplicateDecision: normalizeDuplicateDecision(update?.duplicateDecision),
  };
}

function applyDateUpdate(date: BrainDumpReviewDate, update: ReturnType<typeof normalizeBrainDumpReviewItemUpdate>["date"]): BrainDumpReviewDate {
  if (!update) return date;
  const resolvedDate = typeof update.resolvedDate !== "undefined" ? update.resolvedDate ?? null : date.resolvedDate;
  return {
    ...date,
    resolvedDate,
    userConfirmedDate: typeof update.userConfirmedDate === "boolean" ? update.userConfirmedDate : date.userConfirmedDate,
    ambiguity: resolvedDate ? "none" : date.ambiguity,
    ambiguityFlags: resolvedDate ? [] : date.ambiguityFlags,
  };
}

function applyEnrichmentUpdate(
  enrichment: BrainDumpReviewEnrichment,
  update: ReturnType<typeof normalizeBrainDumpReviewItemUpdate>["enrichment"]
): BrainDumpReviewEnrichment {
  if (!update) return enrichment;
  return {
    notes: typeof update.notes !== "undefined" ? (update.notes ?? null) : enrichment.notes,
    estimatedDurationMinutes: typeof update.estimatedDurationMinutes !== "undefined"
      ? (update.estimatedDurationMinutes ?? null)
      : enrichment.estimatedDurationMinutes,
    priority: typeof update.priority !== "undefined" ? (update.priority ?? null) : enrichment.priority,
    firstAction: typeof update.firstAction !== "undefined" ? (update.firstAction ?? null) : enrichment.firstAction,
  };
}

function validateReviewItem(item: BrainDumpReviewItem): BrainDumpReviewValidationError[] {
  const errors: BrainDumpReviewValidationError[] = [];
  if (item.selected && item.supported && !item.title.trim()) {
    errors.push({ field: "title", message: "Enter a task title before creating this item." });
  }
  return errors;
}

export function applyBrainDumpReviewItemUpdate(
  item: BrainDumpReviewItem,
  update: ReturnType<typeof normalizeBrainDumpReviewItemUpdate> | null
): BrainDumpReviewItem {
  const nextTitle = update && typeof update.title !== "undefined" ? update.title : item.title;
  const nextItem: BrainDumpReviewItem = {
    ...item,
    title: nextTitle,
    selected: typeof update?.selected === "boolean" && item.supported ? update.selected : item.supported ? item.selected : false,
    date: applyDateUpdate(item.date, update?.date),
    enrichment: applyEnrichmentUpdate(item.enrichment, update?.enrichment),
    duplicateDecision: update?.duplicateDecision ?? item.duplicateDecision,
  };
  return {
    ...nextItem,
    validationErrors: validateReviewItem(nextItem),
  };
}

export async function processTypedBrainDump(input: {
  uid: string;
  text: string;
  timezone?: string;
  provider: BrainDumpAiProvider;
  store: BrainDumpSessionStore;
  createId: () => string;
  now?: () => number;
  workspaceTasks?: Task[];
  archivedTaskMeta?: DeletedTaskMeta;
}): Promise<BrainDumpReviewSession> {
  const uid = asTrimmedString(input.uid, 120);
  if (!uid) throw new BrainDumpInputError("You must be signed in to continue.");
  const text = normalizeTypedInput(input.text);
  const timezone = normalizeTimezone(input.timezone);
  const sessionId = asTrimmedString(input.createId(), 120);
  if (!sessionId) throw new Error("Could not create Brain Dump session id.");
  const nowMs = Math.max(0, Math.floor(Number(input.now?.() ?? Date.now()) || 0));

  const providerResponse = await input.provider.extractTyped({
    promptId: BRAIN_DUMP_TYPED_PROMPT_ID,
    text,
    timezone,
  });
  const parsed = providerResponseSchema.safeParse(providerResponse);
  if (!parsed.success) {
    throw new BrainDumpProviderValidationError("Brain Dump provider output did not match the expected review schema.");
  }

  const items = parsed.data.items.map<BrainDumpReviewItem>((item, index) => {
    const supported = itemIsSupported(item.itemType);
    const selected = supported && item.ambiguityFlags.length === 0;
    return {
      id: createItemId(sessionId, index, item.id),
      itemType: item.itemType,
      title: item.title,
      selected,
      sourceEvidence: item.sourceEvidence,
      confidence: item.confidence,
      ambiguityFlags: item.ambiguityFlags,
      supported,
      date: buildReviewDate({
        dueDateText: item.dueDateText,
        dateSource: item.dateSource,
        timezone,
        nowMs,
        recurrenceText: item.recurrenceText,
        dependencyTimingText: item.dependencyTimingText,
      }),
      enrichment: buildReviewEnrichment({
        notes: item.notes,
        estimatedDurationMinutes: item.estimatedDurationMinutes,
        priority: item.priority,
        firstAction: item.firstAction,
      }),
      validationErrors: [],
      duplicateWarnings: [],
      duplicateDecision: "undecided",
    };
  });
  const reviewedItems = refreshBrainDumpDuplicateWarnings({
    items,
    workspaceTasks: input.workspaceTasks,
    archivedTaskMeta: input.archivedTaskMeta,
    nowMs,
  });

  const session: BrainDumpReviewSession = {
    id: sessionId,
    ownerUid: uid,
    mode: "typed",
    state: "review",
    promptId: BRAIN_DUMP_TYPED_PROMPT_ID,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + BRAIN_DUMP_UNFINISHED_TTL_MS,
    source: {
      kind: "typed",
      rawText: text,
    },
    review: {
      selectedCount: reviewedItems.filter((item) => item.selected).length,
      items: reviewedItems,
    },
  };

  await input.store.saveSession(session);
  return session;
}

export async function transcribeVoiceBrainDump(input: {
  uid: string;
  audioBase64: string;
  mimeType: string;
  durationMs: number;
  timezone?: string;
  provider: BrainDumpAiProvider;
}) {
  const uid = asTrimmedString(input.uid, 120);
  if (!uid) throw new BrainDumpInputError("You must be signed in to continue.");
  const audioBase64 = normalizeVoiceAudioBase64(input.audioBase64);
  const mimeType = normalizeVoiceMimeType(input.mimeType);
  const durationMs = normalizeVoiceDurationMs(input.durationMs);
  const timezone = normalizeTimezone(input.timezone);
  if (!input.provider.transcribeVoice) {
    throw new BrainDumpProviderValidationError("Brain Dump voice transcription is not configured.");
  }
  const providerResponse = await input.provider.transcribeVoice({
    promptId: BRAIN_DUMP_VOICE_TRANSCRIPTION_PROMPT_ID,
    audioBase64,
    mimeType,
    timezone,
    uid,
  });
  const parsed = voiceTranscriptionResponseSchema.safeParse(providerResponse);
  if (!parsed.success) {
    throw new BrainDumpProviderValidationError("Brain Dump transcription output did not match the expected schema.");
  }
  return {
    transcript: parsed.data.transcript,
    mimeType,
    durationMs,
  };
}

export async function getBrainDumpReviewSessionForUser(input: {
  uid: string;
  sessionId: string;
  store: BrainDumpSessionStore;
}): Promise<BrainDumpReviewSession | null> {
  const uid = asTrimmedString(input.uid, 120);
  const sessionId = asTrimmedString(input.sessionId, 120);
  if (!uid || !sessionId) return null;
  return input.store.getSession(uid, sessionId);
}

export async function updateBrainDumpReviewSession(input: {
  uid: string;
  sessionId: string;
  itemUpdates?: BrainDumpReviewItemUpdate[];
  store: BrainDumpSessionStore;
}): Promise<BrainDumpReviewSession> {
  const uid = asTrimmedString(input.uid, 120);
  const sessionId = asTrimmedString(input.sessionId, 120);
  if (!uid) throw new BrainDumpReviewUpdateError("You must be signed in to continue.", "auth/unauthenticated", 401);
  if (!sessionId) throw new BrainDumpReviewUpdateError("Brain Dump session was not found.", "brain-dump/not-found", 404);

  const session = await input.store.getSession(uid, sessionId);
  if (!session || session.ownerUid !== uid || session.id !== sessionId) {
    throw new BrainDumpReviewUpdateError("Brain Dump session was not found.", "brain-dump/not-found", 404);
  }
  if (session.state !== "review") {
    throw new BrainDumpReviewUpdateError("Brain Dump session is not ready for editing.", "brain-dump/not-reviewable", 409);
  }

  const updatesByItemId = new Map(
    (input.itemUpdates || [])
      .map(normalizeBrainDumpReviewItemUpdate)
      .filter((update) => update.itemId)
      .map((update) => [update.itemId, update])
  );
  const updatedSession: BrainDumpReviewSession = {
    ...session,
    review: {
      selectedCount: session.review.items.filter((item) => item.selected).length,
      items: session.review.items.map((item) => applyBrainDumpReviewItemUpdate(item, updatesByItemId.get(item.id) || null)),
    },
  };
  updatedSession.review.selectedCount = updatedSession.review.items.filter((item) => item.supported && item.selected).length;
  await input.store.saveSession(updatedSession);
  return updatedSession;
}

export function toBrainDumpReviewResponse(session: BrainDumpReviewSession) {
  return {
    id: session.id,
    mode: session.mode,
    state: session.state,
    promptId: session.promptId,
    createdAtMs: session.createdAtMs,
    expiresAtMs: session.expiresAtMs,
    review: session.review,
  };
}
