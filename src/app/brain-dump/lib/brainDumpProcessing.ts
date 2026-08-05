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

const providerItemSchema = z
  .object({
    id: z.string().trim().min(1).max(120).optional(),
    itemType: brainDumpItemTypeSchema,
    title: z.string().trim().min(1).max(200),
    sourceEvidence: z.array(z.string().trim().min(1).max(280)).max(5).default([]),
    confidence: z.number().min(0).max(1),
    ambiguityFlags: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  })
  .strict();

const providerResponseSchema = z
  .object({
    items: z.array(providerItemSchema).min(1).max(100),
  })
  .strict();

export type BrainDumpItemType = z.infer<typeof brainDumpItemTypeSchema>;

export type BrainDumpReviewItem = {
  id: string;
  itemType: BrainDumpItemType;
  title: string;
  selected: boolean;
  sourceEvidence: string[];
  confidence: number;
  ambiguityFlags: string[];
  supported: boolean;
};

export type BrainDumpSessionState = "review" | "completed";

export type BrainDumpCreationBatchResult = {
  sessionId: string;
  createdCount: number;
  skippedCount: number;
  completedAtMs: number;
  items: Array<{
    itemId: string;
    status: "created" | "skipped";
    createdTaskId?: string;
    reason?: string;
  }>;
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
