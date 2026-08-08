import { z } from "zod";

const recommendationTypes = ["TASK_CLARIFICATION", "NEXT_BEST_ACTION"] as const;

export const RECOMMENDATION_COLLECTION = "taskRecommendations";

export const RecommendationTypeSchema = z.enum(recommendationTypes);
export type RecommendationType = z.infer<typeof RecommendationTypeSchema>;

const recommendationStatuses = [
  "ACTIVE",
  "ACCEPTED",
  "PARTIALLY_ACCEPTED",
  "DISMISSED",
  "EXPIRED",
  "REVERSED",
  "STARTED",
  "SKIPPED",
] as const;

export const RecommendationStatusSchema = z.enum(recommendationStatuses);
export type RecommendationStatus = z.infer<typeof RecommendationStatusSchema>;

const optionalNullableText = (maxLength: number) => z.string().trim().max(maxLength).nullable().optional();

export const RecommendationEnvelopeSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    userId: z.string().trim().min(1).max(120),
    type: RecommendationTypeSchema,
    taskId: optionalNullableText(160),
    sourceTaskVersion: optionalNullableText(160),
    taskVersion: optionalNullableText(160),
    status: RecommendationStatusSchema,
    createdAt: z.string().trim().min(1),
    expiresAt: z.string().trim().min(1),
    completedAt: optionalNullableText(40),
    dismissedAt: optionalNullableText(40),
    respondedAt: optionalNullableText(40),
    auditExpiresAt: optionalNullableText(40),
    modelVersion: optionalNullableText(120),
    promptVersion: optionalNullableText(120),
  })
  .passthrough();

export type RecommendationEnvelope = z.infer<typeof RecommendationEnvelopeSchema>;

export type RecommendationWithPayload<TType extends RecommendationType, TPayload> = Omit<RecommendationEnvelope, "type"> & {
  type: TType;
  payload: TPayload;
};

export function parseRecommendationType(value: unknown): RecommendationType | null {
  if (value == null) return "TASK_CLARIFICATION";
  const parsed = RecommendationTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseRecommendationEnvelope(value: unknown): RecommendationEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = RecommendationEnvelopeSchema.safeParse({
    ...(value as Record<string, unknown>),
    type: parseRecommendationType((value as Record<string, unknown>).type),
  });
  return parsed.success ? parsed.data : null;
}
