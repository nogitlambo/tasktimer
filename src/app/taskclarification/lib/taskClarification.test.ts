import { describe, expect, it } from "vitest";

import {
  createTaskClarificationTaskContext,
  parseTaskClarificationResponse,
  TaskClarificationResponseSchema,
} from "./taskClarification";

const validResponse = {
  suggestedTitle: "Prepare the launch checklist",
  definitionOfDone: "The checklist is ready to review.",
  firstAction: "Open the current checklist.",
  stoppingPoint: "Stop after identifying missing items.",
  estimatedMinutes: 45,
  estimatedRange: { min: 30, max: 60 },
  subtasks: [{ title: "Open the current checklist", estimatedMinutes: 5 }],
  clarificationQuestions: [],
  warnings: [],
  reasonCodes: ["TASK_TOO_BROAD"],
  confidence: 0.86,
  ambiguityScore: 0.72,
  initiationDifficultyScore: 0.68,
};

describe("task clarification contracts", () => {
  it("normalizes an owned Task into permitted provider context and a stable source version", () => {
    const first = createTaskClarificationTaskContext("task-1", {
      id: "task-1",
      name: "Prepare launch",
      taskType: "once-off",
      onceOffTargetDate: "2026-08-10",
      notes: "must not be sent",
    });
    const second = createTaskClarificationTaskContext("task-1", {
      id: "task-1",
      name: "Prepare launch",
      taskType: "once-off",
      onceOffTargetDate: "2026-08-10",
      notes: "must not be sent",
    });

    expect(first).toMatchObject({
      taskId: "task-1",
      title: "Prepare launch",
      taskType: "once-off",
      dueDate: "2026-08-10",
    });
    expect(first?.sourceTaskVersion).toBe(second?.sourceTaskVersion);
    expect(first).not.toHaveProperty("notes");
  });

  it("accepts the bounded structured response shape", () => {
    expect(TaskClarificationResponseSchema.parse(validResponse)).toEqual(validResponse);
  });

  it("rejects reversed duration ranges", () => {
    expect(() => parseTaskClarificationResponse({ ...validResponse, estimatedRange: { min: 60, max: 30 } }, "Prepare launch"))
      .toThrow("invalid duration range");
  });

  it("rejects duplicate subtasks and a subtask that repeats the parent", () => {
    expect(() =>
      parseTaskClarificationResponse(
        { ...validResponse, subtasks: [{ title: "Prepare the launch checklist", estimatedMinutes: 10 }] },
        "Prepare the launch checklist"
      )
    ).toThrow("duplicate subtasks");

    expect(() =>
      parseTaskClarificationResponse(
        {
          ...validResponse,
          subtasks: [
            { title: "Check assets", estimatedMinutes: 10 },
            { title: "  Check   assets ", estimatedMinutes: 15 },
          ],
        },
        "Prepare launch"
      )
    ).toThrow("duplicate subtasks");
  });
});
