import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueuePendingTimeGoalCompletion,
  loadPendingTimeGoalCompletions,
  removePendingTimeGoalCompletion,
} from "./pending-time-goal-completions";

describe("pending time-goal completions", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) || null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
  });

  it("queues one completion per task and period", () => {
    enqueuePendingTimeGoalCompletion("queue", {
      taskId: "task-1",
      periodKey: "2026-05-02",
      completedAtMs: 1000,
      elapsedMs: 60_000,
    });
    enqueuePendingTimeGoalCompletion("queue", {
      taskId: "task-1",
      periodKey: "2026-05-02",
      completedAtMs: 2000,
      elapsedMs: 60_000,
    });

    expect(loadPendingTimeGoalCompletions("queue")).toEqual([{
      taskId: "task-1",
      periodKey: "2026-05-02",
      completedAtMs: 2000,
      elapsedMs: 60_000,
    }]);
  });

  it("removes an acknowledged queued completion", () => {
    enqueuePendingTimeGoalCompletion("queue", {
      taskId: "task-1",
      periodKey: "2026-05-02",
      completedAtMs: 1000,
      elapsedMs: 60_000,
    });

    removePendingTimeGoalCompletion("queue", "task-1", "2026-05-02");

    expect(loadPendingTimeGoalCompletions("queue")).toEqual([]);
  });
});
