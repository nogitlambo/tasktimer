import { describe, expect, it } from "vitest";
import {
  buildTaskClarificationApplyPatch,
  buildTaskClarificationSelectedSubtasks,
  parseTaskClarificationApplyRequest,
} from "./taskClarificationApply";

describe("task clarification apply contract", () => {
  it("builds only the approved Task name patch from a selected edited value", () => {
    const request = parseTaskClarificationApplyRequest({
      acceptedFields: ["name"],
      values: { name: "Draft the launch checklist" },
      idempotencyKey: "apply-1",
    });

    expect(buildTaskClarificationApplyPatch(request)).toEqual({ name: "Draft the launch checklist" });
  });

  it("rejects unsupported or unselected fields before persistence", () => {
    expect(() =>
      parseTaskClarificationApplyRequest({
        acceptedFields: ["definitionOfDone"],
        values: { definitionOfDone: "The checklist is ready." },
        idempotencyKey: "apply-1",
      })
    ).toThrow();

    expect(() =>
      parseTaskClarificationApplyRequest({
        acceptedFields: [],
        values: { name: "Changed" },
        idempotencyKey: "apply-1",
      })
    ).toThrow();
  });

  it("preserves selected recommendation subtask IDs and edited titles", () => {
    const request = parseTaskClarificationApplyRequest({
      acceptedFields: ["subtasks"],
      values: { subtasks: [{ id: "subtask-1", title: "Open the launch checklist", estimatedMinutes: 10 }] },
      idempotencyKey: "apply-2",
    });

    expect(buildTaskClarificationSelectedSubtasks(request)).toEqual([
      { id: "subtask-1", title: "Open the launch checklist", estimatedMinutes: 10 },
    ]);
  });
});
