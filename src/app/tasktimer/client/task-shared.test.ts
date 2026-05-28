import { describe, expect, it } from "vitest";
import { createTaskTimerSharedTask } from "./task-shared";

describe("createTaskTimerSharedTask checkpoint validation", () => {
  const sharedTasks = createTaskTimerSharedTask({ createId: () => "id" });

  it("detects duplicate checkpoint times after normalizing to seconds", () => {
    expect(
      sharedTasks.hasDuplicateCheckpointTime(
        [
          { hours: 0.5, description: "Halfway" },
          { hours: 0.5, description: "Also halfway" },
        ],
        3600
      )
    ).toBe(true);
  });

  it("allows distinct checkpoint times", () => {
    expect(
      sharedTasks.hasDuplicateCheckpointTime(
        [
          { hours: 0.25, description: "Quarter" },
          { hours: 0.5, description: "Half" },
        ],
        3600
      )
    ).toBe(false);
  });
});
