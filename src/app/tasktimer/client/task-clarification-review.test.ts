import { describe, expect, it } from "vitest";
import {
  closeTaskClarificationReview,
  createTaskClarificationReviewError,
  createTaskClarificationReviewLoading,
  createTaskClarificationReviewReady,
  type TaskClarificationReviewRecommendation,
  type TaskClarificationReviewTask,
} from "./task-clarification-review";

const task: TaskClarificationReviewTask = {
  taskId: "task-1",
  title: "Write a report",
};

const recommendation: TaskClarificationReviewRecommendation = {
  recommendationId: "recommendation-1",
  originalTitle: "Write a report",
  suggestedTitle: "Draft the report outline",
  definitionOfDone: "An outline with three sections exists.",
  firstAction: "Open a blank document and write the three section headings.",
  stoppingPoint: "Stop after the outline is complete.",
  estimatedMinutes: 20,
  estimatedRange: { minMinutes: 15, maxMinutes: 30 },
  subtasks: [],
  clarificationQuestions: [],
  warnings: [],
};

describe("task clarification review state", () => {
  it("keeps the original task visible while a proposal is loading", () => {
    expect(createTaskClarificationReviewLoading(task)).toEqual({
      status: "loading",
      task,
      recommendation: null,
      error: null,
    });
  });

  it("keeps review data read-only and preserves the original title", () => {
    const state = createTaskClarificationReviewReady(task, recommendation);

    expect(state.status).toBe("ready");
    expect(state.task?.title).toBe("Write a report");
    expect(state.recommendation?.originalTitle).toBe("Write a report");
    expect(state.recommendation?.suggestedTitle).toBe("Draft the report outline");
  });

  it("closes without producing a task mutation", () => {
    expect(closeTaskClarificationReview()).toEqual({
      status: "closed",
      task: null,
      recommendation: null,
      error: null,
    });
    expect(createTaskClarificationReviewError(task, "Could not prepare suggestions.").status).toBe("error");
  });
});
