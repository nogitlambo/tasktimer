import { parseTaskClarificationResponse, type TaskClarificationResponse } from "../lib/taskClarification";
import { CLARIFICATION_EVALUATION_DATASET, type ClarificationEvaluationCase } from "./clarificationEvaluationDataset";

export type ClarificationEvaluationProviderInput = {
  modelVersion: string;
  promptVersion: string;
  evaluationCase: ClarificationEvaluationCase;
};

export type ClarificationEvaluationProviderResult = {
  response: unknown;
  latencyMs: number;
  costUsd: number;
};

export interface ClarificationEvaluationProvider {
  clarify(input: ClarificationEvaluationProviderInput): Promise<ClarificationEvaluationProviderResult>;
}

export type ClarificationEvaluationCaseResult = {
  caseId: string;
  category: ClarificationEvaluationCase["category"];
  schemaCompliance: number;
  hallucinationRate: number;
  titleUsefulness: number;
  firstActionUsefulness: number;
  decompositionQuality: number;
  durationReasonableness: number;
  latencyMs: number | null;
  costUsd: number | null;
  costBucket: "low" | "medium" | "high" | "unknown";
  failures: string[];
};

export type ClarificationEvaluationResult = {
  datasetVersion: string;
  modelVersion: string;
  promptVersion: string;
  cases: ClarificationEvaluationCaseResult[];
  aggregate: {
    caseCount: number;
    schemaCompliance: number;
    hallucinationRate: number;
    titleUsefulness: number;
    firstActionUsefulness: number;
    decompositionQuality: number;
    durationReasonableness: number;
    averageLatencyMs: number | null;
    totalCostUsd: number;
    costBucket: "low" | "medium" | "high" | "unknown";
    failures: Array<{ caseId: string; reasons: string[] }>;
  };
};

export type ClarificationEvaluationComparison = {
  baseline: { modelVersion: string; promptVersion: string; aggregate: ClarificationEvaluationResult["aggregate"] };
  candidate: { modelVersion: string; promptVersion: string; aggregate: ClarificationEvaluationResult["aggregate"] };
  delta: {
    schemaCompliance: number;
    hallucinationRate: number;
    titleUsefulness: number;
    firstActionUsefulness: number;
    decompositionQuality: number;
    durationReasonableness: number;
    averageLatencyMs: number | null;
    totalCostUsd: number;
  };
};

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

function costBucket(value: unknown): ClarificationEvaluationCaseResult["costBucket"] {
  const cost = Number(value);
  if (!Number.isFinite(cost) || cost < 0) return "unknown";
  if (cost < 0.01) return "low";
  if (cost < 0.05) return "medium";
  return "high";
}

function safeLatency(value: unknown) {
  const latency = Number(value);
  return Number.isFinite(latency) && latency >= 0 ? Math.floor(latency) : null;
}

function safeCost(value: unknown) {
  const cost = Number(value);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

function average(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function scoreResponse(response: TaskClarificationResponse, evaluationCase: ClarificationEvaluationCase) {
  const rubric = evaluationCase.rubric;
  const outputText = JSON.stringify(response).toLocaleLowerCase();
  const forbiddenMatches = rubric.forbiddenTerms.filter((term) => outputText.includes(term.toLocaleLowerCase()));
  const hallucinationRate = rubric.forbiddenTerms.length ? forbiddenMatches.length / rubric.forbiddenTerms.length : 0;
  const suggestedTitle = normalizedText(response.suggestedTitle);
  const titleUsefulness = rubric.titleTerms.length
    ? rubric.titleTerms.every((term) => suggestedTitle.includes(term.toLocaleLowerCase()))
      ? 1
      : 0
    : response.suggestedTitle === null
      ? 1
      : 0.5;
  const firstActionUsefulness = rubric.firstActionRequired
    ? response.firstAction !== null && normalizedText(response.firstAction).length >= 5
      ? 1
      : 0
    : response.firstAction === null
      ? 1
      : 0.5;
  const subtaskCount = response.subtasks.length;
  const decompositionQuality = subtaskCount >= rubric.subtaskCount.min && subtaskCount <= rubric.subtaskCount.max ? 1 : 0;
  const durationValues = [response.estimatedMinutes, response.estimatedRange?.min ?? null, response.estimatedRange?.max ?? null].filter(
    (value): value is number => value !== null
  );
  const durationReasonableness = durationValues.length
    ? durationValues.every((value) => value >= 1 && value <= rubric.maxDurationMinutes)
      ? 1
      : 0
    : rubric.allowNullDuration
      ? 1
      : 0;
  const failures = [
    ...(forbiddenMatches.length ? ["unsupported_assumption"] : []),
    ...(titleUsefulness < 1 ? ["title_usefulness"] : []),
    ...(firstActionUsefulness < 1 ? ["first_action_usefulness"] : []),
    ...(decompositionQuality < 1 ? ["decomposition_quality"] : []),
    ...(durationReasonableness < 1 ? ["duration_reasonableness"] : []),
    ...rubric.requiredNullFields.filter((field) => response[field] !== null).map((field) => `expected_null:${field}`),
  ];
  return { hallucinationRate, titleUsefulness, firstActionUsefulness, decompositionQuality, durationReasonableness, failures };
}

function failedCase(evaluationCase: ClarificationEvaluationCase, reason: string, latencyMs: number | null, costUsd: number | null): ClarificationEvaluationCaseResult {
  return {
    caseId: evaluationCase.id,
    category: evaluationCase.category,
    schemaCompliance: 0,
    hallucinationRate: 1,
    titleUsefulness: 0,
    firstActionUsefulness: 0,
    decompositionQuality: 0,
    durationReasonableness: 0,
    latencyMs,
    costUsd,
    costBucket: costBucket(costUsd),
    failures: [reason],
  };
}

export async function runTaskClarificationEvaluation(input: {
  modelVersion: string;
  promptVersion: string;
  provider: ClarificationEvaluationProvider;
  cases?: readonly ClarificationEvaluationCase[];
}): Promise<ClarificationEvaluationResult> {
  const cases = input.cases || CLARIFICATION_EVALUATION_DATASET.cases;
  const results: ClarificationEvaluationCaseResult[] = [];
  for (const evaluationCase of cases) {
    let providerResult: ClarificationEvaluationProviderResult;
    try {
      providerResult = await input.provider.clarify({ modelVersion: input.modelVersion, promptVersion: input.promptVersion, evaluationCase });
    } catch {
      results.push(failedCase(evaluationCase, "provider_failure", null, null));
      continue;
    }
    const latencyMs = safeLatency(providerResult.latencyMs);
    const costUsd = safeCost(providerResult.costUsd);
    try {
      const response = parseTaskClarificationResponse(providerResult.response, evaluationCase.task.title);
      const scores = scoreResponse(response, evaluationCase);
      results.push({
        caseId: evaluationCase.id,
        category: evaluationCase.category,
        schemaCompliance: 1,
        ...scores,
        latencyMs,
        costUsd,
        costBucket: costBucket(costUsd),
        failures: scores.failures,
      });
    } catch {
      results.push(failedCase(evaluationCase, "invalid_schema", latencyMs, costUsd));
    }
  }

  const totalCostUsd = results.reduce((sum, result) => sum + (result.costUsd || 0), 0);
  return {
    datasetVersion: CLARIFICATION_EVALUATION_DATASET.version,
    modelVersion: input.modelVersion,
    promptVersion: input.promptVersion,
    cases: results,
    aggregate: {
      caseCount: results.length,
      schemaCompliance: average(results.map((result) => result.schemaCompliance)) || 0,
      hallucinationRate: average(results.map((result) => result.hallucinationRate)) || 0,
      titleUsefulness: average(results.map((result) => result.titleUsefulness)) || 0,
      firstActionUsefulness: average(results.map((result) => result.firstActionUsefulness)) || 0,
      decompositionQuality: average(results.map((result) => result.decompositionQuality)) || 0,
      durationReasonableness: average(results.map((result) => result.durationReasonableness)) || 0,
      averageLatencyMs: average(results.map((result) => result.latencyMs)),
      totalCostUsd,
      costBucket: costBucket(totalCostUsd),
      failures: results.filter((result) => result.failures.length).map((result) => ({ caseId: result.caseId, reasons: result.failures })),
    },
  };
}

export function compareTaskClarificationEvaluations(baseline: ClarificationEvaluationResult, candidate: ClarificationEvaluationResult): ClarificationEvaluationComparison {
  const delta = (candidateValue: number, baselineValue: number) => candidateValue - baselineValue;
  return {
    baseline: { modelVersion: baseline.modelVersion, promptVersion: baseline.promptVersion, aggregate: baseline.aggregate },
    candidate: { modelVersion: candidate.modelVersion, promptVersion: candidate.promptVersion, aggregate: candidate.aggregate },
    delta: {
      schemaCompliance: delta(candidate.aggregate.schemaCompliance, baseline.aggregate.schemaCompliance),
      hallucinationRate: delta(candidate.aggregate.hallucinationRate, baseline.aggregate.hallucinationRate),
      titleUsefulness: delta(candidate.aggregate.titleUsefulness, baseline.aggregate.titleUsefulness),
      firstActionUsefulness: delta(candidate.aggregate.firstActionUsefulness, baseline.aggregate.firstActionUsefulness),
      decompositionQuality: delta(candidate.aggregate.decompositionQuality, baseline.aggregate.decompositionQuality),
      durationReasonableness: delta(candidate.aggregate.durationReasonableness, baseline.aggregate.durationReasonableness),
      averageLatencyMs:
        candidate.aggregate.averageLatencyMs === null || baseline.aggregate.averageLatencyMs === null
          ? null
          : candidate.aggregate.averageLatencyMs - baseline.aggregate.averageLatencyMs,
      totalCostUsd: candidate.aggregate.totalCostUsd - baseline.aggregate.totalCostUsd,
    },
  };
}
