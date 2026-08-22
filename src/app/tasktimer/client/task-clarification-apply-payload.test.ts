import { describe, expect, it } from "vitest";

import { buildTaskClarificationApplyPayload } from "./task-clarification-apply-payload";

describe("task clarification apply payload", () => {
  it("keeps accepted fields aligned with valid selected values", () => {
    expect(
      buildTaskClarificationApplyPayload({
        titleSelected: false,
        draftTitle: "",
        selectedSubtaskIds: ["subtask-1", "missing-subtask"],
        draftSubtaskTitles: {},
        subtasks: [{ id: "subtask-1", title: "Open the launch checklist", estimatedMinutes: 10 }],
        idempotencyKey: "apply-1",
      })
    ).toEqual({
      acceptedFields: ["subtasks"],
      values: {
        subtasks: [{ id: "subtask-1", title: "Open the launch checklist", estimatedMinutes: 10 }],
      },
      idempotencyKey: "apply-1",
    });
  });

  it("drops blank selected subtask edits instead of sending an invalid apply request", () => {
    expect(
      buildTaskClarificationApplyPayload({
        titleSelected: false,
        draftTitle: "",
        selectedSubtaskIds: ["subtask-1"],
        draftSubtaskTitles: { "subtask-1": "   " },
        subtasks: [{ id: "subtask-1", title: "Open the launch checklist", estimatedMinutes: 10 }],
        idempotencyKey: "apply-1",
      })
    ).toBeNull();
  });

  it("normalizes invalid selected subtask estimates to null", () => {
    expect(
      buildTaskClarificationApplyPayload({
        titleSelected: true,
        draftTitle: "Draft the launch checklist",
        selectedSubtaskIds: ["subtask-1"],
        draftSubtaskTitles: {},
        subtasks: [{ id: "subtask-1", title: "Open the launch checklist", estimatedMinutes: 0 }],
        idempotencyKey: "apply-1",
      })
    ).toEqual({
      acceptedFields: ["name", "subtasks"],
      values: {
        name: "Draft the launch checklist",
        subtasks: [{ id: "subtask-1", title: "Open the launch checklist", estimatedMinutes: null }],
      },
      idempotencyKey: "apply-1",
    });
  });
});
