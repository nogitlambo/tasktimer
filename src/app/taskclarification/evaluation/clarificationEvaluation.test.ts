import { describe, expect, it, vi } from "vitest";

import { CLARIFICATION_EVALUATION_DATASET } from "./clarificationEvaluationDataset";
import { compareTaskClarificationEvaluations, runTaskClarificationEvaluation, type ClarificationEvaluationProvider } from "./clarificationEvaluation";

describe("task clarification evaluation suite", () => {
  it("loads a fixed synthetic dataset covering every required task shape", () => {
    expect(CLARIFICATION_EVALUATION_DATASET.version).toBe("clarification-eval-v1");
    expect(CLARIFICATION_EVALUATION_DATASET.cases.map((item) => item.category)).toEqual([
      "vague",
      "clear",
      "multi_part",
      "research",
      "sensitive",
      "ambiguous",
    ]);
    expect(JSON.stringify(CLARIFICATION_EVALUATION_DATASET)).not.toMatch(/uid|firebase|production|analytics|userInstruction/i);
  });

  it("scores a provider result without using the UI or mutating persistence", async () => {
    const provider: ClarificationEvaluationProvider = {
      clarify: vi.fn(async () => ({
        response: {
          suggestedTitle: "Prepare the fictional launch checklist",
          definitionOfDone: "The fictional checklist is ready.",
          firstAction: "Open the fictional checklist template.",
          stoppingPoint: "Stop after the first checklist pass.",
          estimatedMinutes: 30,
          estimatedRange: { min: 20, max: 40 },
          subtasks: [{ title: "Open the fictional checklist template", estimatedMinutes: 10 }],
          clarificationQuestions: [],
          warnings: [],
          reasonCodes: ["TASK_TOO_BROAD"],
          confidence: 0.8,
          ambiguityScore: 0.7,
          initiationDifficultyScore: 0.6,
        },
        latencyMs: 1200,
        costUsd: 0.004,
      })),
    };

    const result = await runTaskClarificationEvaluation({ modelVersion: "gpt-5.6-terra", promptVersion: "task-clarification-v1", provider, cases: [CLARIFICATION_EVALUATION_DATASET.cases[0]] });

    expect(result.modelVersion).toBe("gpt-5.6-terra");
    expect(result.promptVersion).toBe("task-clarification-v1");
    expect(result.cases[0]).toMatchObject({ schemaCompliance: 1, latencyMs: 1200, costBucket: "low" });
    expect(result.aggregate).toMatchObject({ caseCount: 1, schemaCompliance: 1 });
    expect(provider.clarify).toHaveBeenCalledWith(expect.objectContaining({ modelVersion: "gpt-5.6-terra", promptVersion: "task-clarification-v1" }));
  });

  it("reports malformed output and provider failure without exposing returned content", async () => {
    const malformedProvider: ClarificationEvaluationProvider = {
      clarify: vi.fn(async () => ({
        response: { secretText: "must not escape the evaluator" },
        latencyMs: 40,
        costUsd: 0,
      })),
    };
    const malformed = await runTaskClarificationEvaluation({
      modelVersion: "gpt-evaluation",
      promptVersion: "prompt-test",
      provider: malformedProvider,
      cases: [CLARIFICATION_EVALUATION_DATASET.cases[1]],
    });
    expect(malformed.cases[0]).toMatchObject({ schemaCompliance: 0, failures: ["invalid_schema"], latencyMs: 40 });
    expect(JSON.stringify(malformed)).not.toContain("must not escape");

    const failing = await runTaskClarificationEvaluation({
      modelVersion: "gpt-evaluation",
      promptVersion: "prompt-test",
      provider: { clarify: vi.fn(async () => Promise.reject(new Error("provider payload contains private text"))) },
      cases: [CLARIFICATION_EVALUATION_DATASET.cases[2]],
    });
    expect(failing.cases[0]).toMatchObject({ schemaCompliance: 0, failures: ["provider_failure"] });
    expect(JSON.stringify(failing)).not.toContain("private text");
  });

  it("keeps missing duration information null and scores unsupported assumptions", async () => {
    const provider: ClarificationEvaluationProvider = {
      clarify: vi.fn(async ({ evaluationCase }) => ({
        response: {
          suggestedTitle: evaluationCase.category === "ambiguous" ? null : "Prepare a private note",
          definitionOfDone: null,
          firstAction: evaluationCase.category === "ambiguous" ? null : "Open a blank private note.",
          stoppingPoint: null,
          estimatedMinutes: null,
          estimatedRange: null,
          subtasks: [],
          clarificationQuestions: ["What does this refer to?"],
          warnings: [],
          reasonCodes: ["MISSING_INFORMATION"],
          confidence: 0.4,
          ambiguityScore: 0.9,
          initiationDifficultyScore: 0.5,
        },
        latencyMs: 800,
        costUsd: 0.02,
      })),
    };
    const result = await runTaskClarificationEvaluation({
      modelVersion: "gpt-evaluation",
      promptVersion: "prompt-test",
      provider,
      cases: [CLARIFICATION_EVALUATION_DATASET.cases[4], CLARIFICATION_EVALUATION_DATASET.cases[5]],
    });
    expect(result.cases[0]).toMatchObject({ durationReasonableness: 1 });
    expect(result.cases[1]).toMatchObject({ durationReasonableness: 1, titleUsefulness: 1 });
    expect(result.aggregate.costBucket).toBe("medium");
  });

  it("is reproducible for the same versioned dataset and provider outputs", async () => {
    const response = {
      suggestedTitle: "Prepare the fictional launch checklist",
      definitionOfDone: null,
      firstAction: "Open the fictional checklist.",
      stoppingPoint: null,
      estimatedMinutes: 20,
      estimatedRange: null,
      subtasks: [],
      clarificationQuestions: [],
      warnings: [],
      reasonCodes: [],
      confidence: 0.8,
      ambiguityScore: 0.3,
      initiationDifficultyScore: 0.3,
    };
    const createProvider = (): ClarificationEvaluationProvider => ({ clarify: vi.fn(async () => ({ response, latencyMs: 100, costUsd: 0.001 })) });
    const first = await runTaskClarificationEvaluation({ modelVersion: "model-a", promptVersion: "prompt-a", provider: createProvider(), cases: [CLARIFICATION_EVALUATION_DATASET.cases[0]] });
    const second = await runTaskClarificationEvaluation({ modelVersion: "model-a", promptVersion: "prompt-a", provider: createProvider(), cases: [CLARIFICATION_EVALUATION_DATASET.cases[0]] });
    expect(second).toEqual(first);
    expect(compareTaskClarificationEvaluations(first, { ...second, modelVersion: "model-b" }).delta).toMatchObject({ schemaCompliance: 0, totalCostUsd: 0 });
  });
});
