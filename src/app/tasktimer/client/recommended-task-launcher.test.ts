import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { launchRecommendedTaskById } from "./recommended-task-launcher";

describe("launchRecommendedTaskById", () => {
  it("opens the Tasks page after starting the recommended task", () => {
    const calls: string[] = [];
    const task = { id: " task-1 ", name: "Tidy small area" } as Task;
    const jumpToTaskById = vi.fn((taskId: string) => calls.push(`jump:${taskId}`));
    const startTask = vi.fn((index: number, options?: { onStarted?: () => void }) => {
      calls.push(`start:${index}`);
      options?.onStarted?.();
      return "started" as const;
    });

    const result = launchRecommendedTaskById("task-1", {
      getTasks: () => [task],
      jumpToTaskById,
      startTask,
    });

    expect(result).toBe("started");
    expect(calls).toEqual(["start:0", "jump:task-1"]);
  });

  it("does not navigate or start when the task no longer exists", () => {
    const jumpToTaskById = vi.fn();
    const startTask = vi.fn();

    expect(
      launchRecommendedTaskById("missing", {
        getTasks: () => [],
        jumpToTaskById,
        startTask,
      }),
    ).toBe("not-found");
    expect(jumpToTaskById).not.toHaveBeenCalled();
    expect(startTask).not.toHaveBeenCalled();
  });

  it("does not navigate until an active-timer switch is confirmed", () => {
    const jumpToTaskById = vi.fn();
    const startTask = vi.fn(() => "requires-confirmation" as const);

    expect(
      launchRecommendedTaskById("task-1", {
        getTasks: () => [{ id: "task-1", name: "Recommended" } as Task],
        jumpToTaskById,
        startTask,
      }),
    ).toBe("requires-confirmation");

    expect(startTask).toHaveBeenCalledWith(0, expect.any(Object));
    expect(jumpToTaskById).not.toHaveBeenCalled();
  });
});
