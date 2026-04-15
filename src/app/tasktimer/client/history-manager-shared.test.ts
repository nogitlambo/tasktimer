import { describe, expect, it } from "vitest";
import {
  buildHistoryManagerRowKey,
  formatHistoryManagerElapsed,
  groupSelectedHistoryRowsByTask,
} from "./history-manager-shared";

describe("history-manager-shared", () => {
  it("formats elapsed time consistently", () => {
    expect(formatHistoryManagerElapsed(90061000, (value) => String(value).padStart(2, "0"))).toBe("01d 01h 01m 01s");
  });

  it("builds stable row keys from history entries", () => {
    expect(buildHistoryManagerRowKey({ ts: 1234.8, ms: 5678.2, name: "Focus" })).toBe("1234|5678|Focus");
    expect(buildHistoryManagerRowKey({ ts: null, ms: -10, name: "" })).toBe("0|0|");
  });

  it("groups selected row ids by task id", () => {
    expect(
      Object.fromEntries(
        Object.entries(
          groupSelectedHistoryRowsByTask(["task-a|1|2|Start", "task-a|3|4|Stop", "task-b|9|8|Review", "broken"])
        ).map(([taskId, keys]) => [taskId, Array.from(keys)])
      )
    ).toEqual({
      "task-a": ["1|2|Start", "3|4|Stop"],
      "task-b": ["9|8|Review"],
    });
  });
});
