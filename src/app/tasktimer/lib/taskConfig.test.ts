import { describe, expect, it } from "vitest";
import { formatTaskScheduleSummary } from "./taskConfig";

describe("formatTaskScheduleSummary", () => {
  it("summarizes evenly split recurring weekly scheduled blocks", () => {
    expect(
      formatTaskScheduleSummary({
        taskType: "recurring",
        durationValue: 1,
        durationUnit: "hour",
        durationPeriod: "week",
        plannedStartTime: "08:00",
        productivityDays: ["mon", "tue", "wed", "thu", "fri"],
      })
    ).toBe("Task will be split into 12 minute daily scheduled blocks at 8:00 AM on your 5 productivity days.");
  });

  it("summarizes uneven recurring weekly scheduled blocks as an exact range", () => {
    expect(
      formatTaskScheduleSummary({
        taskType: "recurring",
        durationValue: 61,
        durationUnit: "minute",
        durationPeriod: "week",
        plannedStartTime: "08:00",
        productivityDays: ["mon", "tue", "wed", "thu", "fri"],
      })
    ).toBe("Task will be split into 12-13 minute daily scheduled blocks at 8:00 AM on your 5 productivity days.");
  });

  it("summarizes recurring daily scheduled blocks", () => {
    expect(
      formatTaskScheduleSummary({
        taskType: "recurring",
        durationValue: 1,
        durationUnit: "hour",
        durationPeriod: "day",
        plannedStartTime: "08:00",
        productivityDays: ["mon", "tue", "wed", "thu", "fri"],
      })
    ).toBe("Task will be added as 1 hour daily scheduled blocks at 8:00 AM on your 5 productivity days.");
  });

  it("summarizes once-off scheduled blocks", () => {
    expect(
      formatTaskScheduleSummary({
        taskType: "once-off",
        durationValue: 1,
        durationUnit: "hour",
        durationPeriod: "day",
        plannedStartTime: "08:00",
        productivityDays: ["mon", "tue", "wed", "thu", "fri"],
        onceOffDay: "mon",
      })
    ).toBe("Task will be added as a 1 hour scheduled block at 8:00 AM on Monday.");
  });

  it("returns empty text for invalid scheduled summary inputs", () => {
    expect(
      formatTaskScheduleSummary({
        taskType: "recurring",
        durationValue: 0,
        durationUnit: "hour",
        durationPeriod: "day",
        plannedStartTime: "08:00",
        productivityDays: ["mon"],
      })
    ).toBe("");
  });
});
