import { describe, expect, it } from "vitest";
import { createTaskClarificationOpenEvent, createTaskClarificationStartTaskEvent } from "./task-clarification-events";

describe("task clarification events", () => {
  it("carries only the task context needed to request a read-only proposal", () => {
    const event = createTaskClarificationOpenEvent({
      taskId: "task-1",
      title: "Write a report",
      taskType: "once-off",
      dueDate: "2026-08-12",
    });

    expect(event.type).toBe("tasktimer:open-task-clarification");
    expect(event.detail).toEqual({
      taskId: "task-1",
      title: "Write a report",
      taskType: "once-off",
      dueDate: "2026-08-12",
    });
  });

  it("carries the created Task ID for the existing Start behavior", () => {
    const event = createTaskClarificationStartTaskEvent({ taskId: "created-task-1" });

    expect(event.type).toBe("tasktimer:start-task-by-id");
    expect(event.detail).toEqual({ taskId: "created-task-1" });
  });
});
