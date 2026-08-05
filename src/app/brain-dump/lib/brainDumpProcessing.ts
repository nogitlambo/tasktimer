import { z } from "zod";

export const BRAIN_DUMP_TYPED_PROMPT_ID = "brain-dump-v1";
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
  })
  .strict();

const providerResponseSchema = z
  .object({
    items: z.array(providerItemSchema).min(1).max(100),
  })
  .strict();

export type BrainDumpItemType = z.infer<typeof brainDumpItemTypeSchema>;
export type BrainDumpDateSource = z.infer<typeof brainDumpDateSourceSchema>;

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
    reason?: string;
    retryable?: boolean;
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
  creationReceipts?: Record<string, BrainDumpCreationReceipt>;
};

export type BrainDumpAiProvider = {
  extractTyped(input: { promptId: typeof BRAIN_DUMP_TYPED_PROMPT_ID; text: string; timezone: string }): Promise<unknown>;
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

export async function processTypedBrainDump(input: {
  uid: string;
  text: string;
  timezone?: string;
  provider: BrainDumpAiProvider;
  store: BrainDumpSessionStore;
  createId: () => string;
  now?: () => number;
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
    };
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
      selectedCount: items.filter((item) => item.selected).length,
      items,
    },
  };

  await input.store.saveSession(session);
  return session;
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
