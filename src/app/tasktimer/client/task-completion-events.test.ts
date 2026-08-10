import { describe, expect, it, vi } from "vitest";

import {
  dispatchTaskCompletionChangedEvent,
  TASK_COMPLETION_CHANGED_EVENT,
} from "./task-completion-events";

describe("task completion events", () => {
  it("dispatches the task id in the defined event detail", () => {
    const dispatchEvent = vi.fn();
    const windowRef = { dispatchEvent } as unknown as Window;

    dispatchTaskCompletionChangedEvent(" task-1 ", windowRef);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent<{ taskId: string }>;
    expect(event.type).toBe(TASK_COMPLETION_CHANGED_EVENT);
    expect(event.detail).toEqual({ taskId: "task-1" });
  });

  it("does not dispatch without a task id", () => {
    const dispatchEvent = vi.fn();

    dispatchTaskCompletionChangedEvent("", { dispatchEvent } as unknown as Window);

    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
