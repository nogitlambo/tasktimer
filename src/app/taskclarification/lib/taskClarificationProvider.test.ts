import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  configuredTaskClarificationOpenAiModel,
  getTaskClarificationAIProvider,
  TASK_CLARIFICATION_OPENAI_RESPONSES_URL,
} from "./taskClarificationProvider";

describe("Task clarification OpenAI provider", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.TASK_CLARIFICATION_OPENAI_MODEL;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.TASK_CLARIFICATION_OPENAI_MODEL = "gpt-evaluation";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.OPENAI_API_KEY = originalApiKey;
    process.env.TASK_CLARIFICATION_OPENAI_MODEL = originalModel;
  });

  it("uses the configured model and strict structured output without exposing provider access to the browser", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          suggestedTitle: "Prepare launch checklist",
          definitionOfDone: "The checklist is ready.",
          firstAction: "Open the checklist.",
          stoppingPoint: "Stop after the first review.",
          estimatedMinutes: 30,
          estimatedRange: { min: 20, max: 40 },
          subtasks: [{ title: "Open the checklist", estimatedMinutes: 5 }],
          clarificationQuestions: [],
          warnings: [],
          reasonCodes: ["TASK_TOO_BROAD"],
          confidence: 0.9,
          ambiguityScore: 0.7,
          initiationDifficultyScore: 0.6,
        }),
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTaskClarificationAIProvider().clarifyTask({
      taskId: "task-1",
      title: "Prepare launch",
      taskType: "once-off",
      dueDate: "2026-08-10",
      timezone: "Australia/Sydney",
      currentDate: "2026-08-07",
      userInstruction: "Keep the first step under 20 minutes.",
    });

    expect(configuredTaskClarificationOpenAiModel()).toBe("gpt-evaluation");
    expect(fetchMock).toHaveBeenCalledWith(
      TASK_CLARIFICATION_OPENAI_RESPONSES_URL,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer test-openai-key" }),
      })
    );
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestBody = JSON.parse(String(requestInit.body || "{}")) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      model: "gpt-evaluation",
      store: false,
      text: { format: { type: "json_schema", name: "task_clarification_response", strict: true } },
    });
    expect(JSON.stringify(requestBody)).toContain("Prepare launch");
    expect(JSON.stringify(requestBody)).toContain("Keep the first step under 20 minutes.");
    expect(JSON.stringify(requestBody)).not.toContain("OPENAI_API_KEY");
    expect(result.suggestedTitle).toBe("Prepare launch checklist");
  });

  it("fails closed when the server API key is unavailable", async () => {
    process.env.OPENAI_API_KEY = "";

    await expect(
      getTaskClarificationAIProvider().clarifyTask({
        taskId: "task-1",
        title: "Prepare launch",
        timezone: "UTC",
        currentDate: "2026-08-07",
      })
    ).rejects.toMatchObject({ status: 503, code: "task-clarification/provider-unavailable" });
  });
});
