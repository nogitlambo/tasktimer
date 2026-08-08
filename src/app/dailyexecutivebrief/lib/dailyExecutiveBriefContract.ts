import { z } from "zod";

import {
  DailyExecutiveBriefAdjustmentTypeSchema,
  DailyExecutiveBriefAdjustmentStatusSchema,
  DailyExecutiveBriefCapacitySourceSchema,
  DailyExecutiveBriefDeadlineRiskSchema,
  DailyExecutiveBriefPlanHealthSchema,
  DailyExecutiveBriefReasonCodeSchema,
  type DailyExecutiveBriefPlan,
} from "./dailyExecutiveBriefPlanning";
import {
  DailyCapacityConfidenceSchema,
  DailyCapacityPrimarySourceSchema,
  DailyCapacityReasonCodeSchema,
  DailyCapacityStateSchema,
} from "@/app/adaptivecapacity/lib/dailyCapacityContract";

export const DAILY_EXECUTIVE_BRIEF_SCHEMA_VERSION = 1;
export const DAILY_EXECUTIVE_BRIEF_TTL_MS = 6 * 60 * 60 * 1000;

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const DailyExecutiveBriefCapacitySummarySchema = z.object({
  fullDayRange: z.object({ min: z.number().int().min(0), max: z.number().int().min(0) }),
  remainingRange: z.object({ min: z.number().int().min(0), max: z.number().int().min(0) }),
  state: DailyCapacityStateSchema,
  confidence: DailyCapacityConfidenceSchema,
  primarySource: DailyCapacityPrimarySourceSchema,
  sourceSignals: z.array(DailyCapacityReasonCodeSchema).max(20),
  completedMinutesToday: z.number().int().min(0),
  availableMinutesCeiling: z.number().int().min(0).nullable(),
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
});

export type DailyExecutiveBriefCapacitySummary = z.infer<typeof DailyExecutiveBriefCapacitySummarySchema>;

export const DailyExecutiveBriefSnapshotSchema = z.object({
  schemaVersion: z.literal(DAILY_EXECUTIVE_BRIEF_SCHEMA_VERSION),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["READY", "EMPTY", "INSUFFICIENT_DATA"]),
  plan: z.object({
    version: z.string().min(1).max(120),
    todayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    plannedMinutes: z.number().int().min(0),
    completedMinutes: z.number().int().min(0),
    remainingMinutes: z.number().int().min(0),
    realisticWorkloadRange: z.object({ minMinutes: z.number().int().min(0), maxMinutes: z.number().int().min(0) }),
    capacityMinutes: z.number().int().min(1),
    capacitySource: DailyExecutiveBriefCapacitySourceSchema,
    planHealth: DailyExecutiveBriefPlanHealthSchema,
    deadlineRisk: DailyExecutiveBriefDeadlineRiskSchema,
    reasonCodes: z.array(DailyExecutiveBriefReasonCodeSchema),
    unknownDurationTaskCount: z.number().int().min(0),
    activeTaskCount: z.number().int().min(0),
    adjustments: z.array(z.object({
      adjustmentId: z.string().min(1).max(320),
      taskId: z.string().min(1).max(160),
      type: DailyExecutiveBriefAdjustmentTypeSchema,
      status: DailyExecutiveBriefAdjustmentStatusSchema,
      reasonCodes: z.array(DailyExecutiveBriefReasonCodeSchema),
      explanation: z.string().min(1).max(500),
      suggestedMinutes: z.number().int().min(1).max(1440).optional(),
    })).max(3),
  }),
  nextBestAction: z.object({
    recommendationId: z.string().min(1).max(160),
    taskId: z.string().min(1).max(160),
    title: z.string().min(1).max(240),
    firstAction: z.string().max(500).nullable(),
    estimatedMinutes: z.number().int().min(1).max(1440),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
    reasonCodes: z.array(z.string().min(1).max(120)),
    sourceTaskVersion: z.string().max(200).nullable(),
  }).nullable(),
  clarificationTaskIds: z.array(z.string().min(1).max(160)).max(20),
  adaptiveCapacity: DailyExecutiveBriefCapacitySummarySchema.nullable().optional(),
  summary: z.string().min(1).max(1000),
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});

export type DailyExecutiveBriefSnapshot = z.infer<typeof DailyExecutiveBriefSnapshotSchema>;

export function buildDailyExecutiveBriefSummary(plan: DailyExecutiveBriefPlan) {
  if (plan.activeTaskCount === 0) return "There are no active tasks to plan today.";
  if (plan.planHealth === "INSUFFICIENT_DATA") {
    return plan.unknownDurationTaskCount > 0
      ? "Add an estimate to at least one active task to build a realistic plan for today."
      : "There is not enough information to build a realistic plan for today.";
  }
  const workload = `${plan.remainingMinutes} minutes of remaining work`;
  const capacity = `${plan.realisticWorkloadRange.minMinutes}-${plan.realisticWorkloadRange.maxMinutes} minutes is a realistic range`;
  if (plan.planHealth === "SIGNIFICANTLY_OVERLOADED") return `Today has ${workload}; ${capacity}. Consider reviewing the suggested adjustments.`;
  if (plan.planHealth === "SLIGHTLY_OVERLOADED") return `Today has ${workload}, which is above the available capacity. ${capacity}.`;
  return `Today has ${workload}. ${capacity}.`;
}

export function createDailyExecutiveBriefSnapshot(input: {
  date: string;
  plan: DailyExecutiveBriefPlan;
  nextBestAction?: DailyExecutiveBriefSnapshot["nextBestAction"];
  clarificationTaskIds?: string[];
  adaptiveCapacity?: DailyExecutiveBriefCapacitySummary | null;
  sourceVersion: string;
  generatedAtMs: number;
  ttlMs?: number;
  summary?: string;
}): DailyExecutiveBriefSnapshot {
  const generatedAt = new Date(input.generatedAtMs).toISOString();
  const status = input.plan.activeTaskCount === 0 ? "EMPTY" : input.plan.planHealth === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "READY";
  return DailyExecutiveBriefSnapshotSchema.parse({
    schemaVersion: DAILY_EXECUTIVE_BRIEF_SCHEMA_VERSION,
    date: input.date,
    status,
    plan: input.plan,
    nextBestAction: input.nextBestAction ?? null,
    clarificationTaskIds: input.clarificationTaskIds ?? [],
    adaptiveCapacity: input.adaptiveCapacity ?? null,
    summary: input.summary?.trim() || buildDailyExecutiveBriefSummary(input.plan),
    sourceVersion: input.sourceVersion,
    generatedAt,
    expiresAt: new Date(input.generatedAtMs + (input.ttlMs ?? DAILY_EXECUTIVE_BRIEF_TTL_MS)).toISOString(),
  });
}
