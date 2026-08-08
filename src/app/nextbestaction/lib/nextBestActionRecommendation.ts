import { z } from "zod";

import {
  parseRecommendationEnvelope,
  RecommendationEnvelopeSchema,
  RecommendationStatusSchema,
  type RecommendationWithPayload,
} from "@/app/recommendations/lib/recommendationContract";

export const NEXT_BEST_ACTION_RECOMMENDATION_TTL_MS = 30 * 60 * 1000;

const nextBestActionStatuses = ["ACTIVE", "STARTED", "SKIPPED", "DISMISSED", "EXPIRED"] as const;

export const NextBestActionStatusSchema = z.enum(nextBestActionStatuses);
export type NextBestActionStatus = z.infer<typeof NextBestActionStatusSchema>;

const nextBestActionReasonCodes = [
  "DUE_TODAY",
  "DUE_SOON",
  "HIGH_PRIORITY",
  "MEDIUM_PRIORITY",
  "FITS_AVAILABLE_TIME",
  "FITS_REMAINING_CAPACITY",
  "MATCHES_FOCUS_WINDOW",
  "HAS_CLEAR_FIRST_ACTION",
  "FREQUENTLY_POSTPONED",
  "BLOCKS_OTHER_WORK",
  "RECENTLY_STARTED",
  "QUICK_WIN",
  "LONG_FOCUS_FIT",
  "LOW_DURATION_CONFIDENCE",
  "EXCEEDS_AVAILABLE_TIME",
  "USER_PREFERENCE_MATCH",
] as const;

export const NextBestActionReasonCodeSchema = z.enum(nextBestActionReasonCodes);
export type NextBestActionReasonCode = z.infer<typeof NextBestActionReasonCodeSchema>;

export const DurationEstimateSourceSchema = z.enum([
  "USER_CONFIRMED",
  "HISTORICAL",
  "ACCEPTED_CLARIFICATION",
  "TASK_GOAL",
  "DEFAULT",
]);
export type DurationEstimateSource = z.infer<typeof DurationEstimateSourceSchema>;

const nullableText = (maxLength: number) => z.string().trim().max(maxLength).nullable();

export const NextBestActionPayloadSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    firstAction: nullableText(240),
    score: z.number().finite().min(0).max(100),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
    reasonCodes: z
      .array(NextBestActionReasonCodeSchema)
      .max(nextBestActionReasonCodes.length)
      .refine((codes) => new Set(codes).size === codes.length, "Reason codes must be unique."),
    availableMinutes: z.number().int().min(1).max(1440).nullable(),
    focusWindowMatched: z.boolean(),
    durationMinutes: z.number().int().min(1).max(1440).nullable(),
    durationSource: DurationEstimateSourceSchema.nullable(),
    alternativeIndex: z.number().int().min(0).max(3),
    explanation: nullableText(500),
  })
  .strict();

export type NextBestActionPayload = z.infer<typeof NextBestActionPayloadSchema>;

export type NextBestActionRecommendation = RecommendationWithPayload<"NEXT_BEST_ACTION", NextBestActionPayload> & {
  taskId: string;
  sourceTaskVersion: string;
  status: NextBestActionStatus;
};

export function createNextBestActionRecommendation(input: {
  id: string;
  userId: string;
  taskId: string;
  sourceTaskVersion: string;
  title: string;
  firstAction: string | null;
  score: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  reasonCodes: NextBestActionReasonCode[];
  availableMinutes?: number | null;
  focusWindowMatched: boolean;
  durationMinutes: number;
  durationSource: DurationEstimateSource;
  alternativeIndex?: number;
  explanation: string;
  nowMs: number;
  auditExpiresAtMs: number;
}): NextBestActionRecommendation {
  const createdAt = new Date(input.nowMs).toISOString();
  return {
    id: input.id.trim(),
    userId: input.userId.trim(),
    type: "NEXT_BEST_ACTION",
    taskId: input.taskId.trim(),
    sourceTaskVersion: input.sourceTaskVersion.trim(),
    status: "ACTIVE",
    createdAt,
    expiresAt: new Date(input.nowMs + NEXT_BEST_ACTION_RECOMMENDATION_TTL_MS).toISOString(),
    auditExpiresAt: new Date(input.auditExpiresAtMs).toISOString(),
    payload: {
      title: input.title.trim() || "Task",
      firstAction: input.firstAction?.trim() || null,
      score: input.score,
      confidence: input.confidence,
      reasonCodes: input.reasonCodes,
      availableMinutes: input.availableMinutes == null ? null : input.availableMinutes,
      focusWindowMatched: input.focusWindowMatched,
      durationMinutes: input.durationMinutes,
      durationSource: input.durationSource,
      alternativeIndex: input.alternativeIndex || 0,
      explanation: input.explanation.trim(),
    },
  };
}

export function parseNextBestActionRecommendationRecord(value: unknown): NextBestActionRecommendation | null {
  const rawValue = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!rawValue) return null;
  const normalizedValue = { ...rawValue };
  for (const key of ["createdAt", "expiresAt", "auditExpiresAt", "completedAt", "dismissedAt", "respondedAt", "startedAt"]) {
    const timestamp = normalizedValue[key];
    if (timestamp && typeof (timestamp as { toDate?: unknown }).toDate === "function") {
      const date = (timestamp as { toDate: () => Date }).toDate();
      if (date instanceof Date && Number.isFinite(date.getTime())) normalizedValue[key] = date.toISOString();
    }
  }
  const envelope = parseRecommendationEnvelope(normalizedValue);
  if (!envelope || envelope.type !== "NEXT_BEST_ACTION") return null;

  const raw = normalizedValue;
  const taskId = typeof raw.taskId === "string" ? raw.taskId.trim() : "";
  const sourceTaskVersion = typeof raw.sourceTaskVersion === "string" ? raw.sourceTaskVersion.trim() : "";
  const status = NextBestActionStatusSchema.safeParse(envelope.status);
  const payload = NextBestActionPayloadSchema.safeParse(raw.payload);
  const envelopeContract = RecommendationEnvelopeSchema.safeParse(envelope);
  const statusContract = RecommendationStatusSchema.safeParse(envelope.status);

  if (!taskId || !sourceTaskVersion || !status.success || !payload.success || !envelopeContract.success || !statusContract.success) return null;

  return {
    ...envelope,
    type: "NEXT_BEST_ACTION",
    taskId,
    sourceTaskVersion,
    status: status.data,
    payload: payload.data,
  };
}
