import { describe, expect, it } from "vitest";
import {
  clampCheckpointSliderMinutes,
  clampCheckpointValueToTimeGoal,
  formatCheckpointSliderLabel,
  formatCheckpointSliderProgress,
  getCheckpointSliderMaxMinutes,
  checkpointValueToSliderMinutes,
  sliderMinutesToCheckpointValue,
} from "./checkpoint-slider";

describe("checkpoint slider helpers", () => {
  it("uses a one-minute-below-goal upper bound", () => {
    expect(getCheckpointSliderMaxMinutes(60)).toBe(59);
    expect(getCheckpointSliderMaxMinutes(1)).toBe(1);
  });

  it("converts hour-unit checkpoint values to slider minutes and back", () => {
    expect(checkpointValueToSliderMinutes(1.5, "hour")).toBe(90);
    expect(sliderMinutesToCheckpointValue(90, "hour")).toBe(1.5);
  });

  it("converts minute-unit checkpoint values to slider minutes and back", () => {
    expect(checkpointValueToSliderMinutes(45, "minute")).toBe(45);
    expect(sliderMinutesToCheckpointValue(45, "minute")).toBe(45);
  });

  it("clamps slider positions to the valid goal range", () => {
    expect(clampCheckpointSliderMinutes(0, 60)).toBe(1);
    expect(clampCheckpointSliderMinutes(999, 60)).toBe(59);
  });

  it("clamps persisted checkpoint values against the current time goal", () => {
    expect(clampCheckpointValueToTimeGoal(2, "hour", 60)).toEqual({
      sliderMinutes: 59,
      value: 59 / 60,
    });
    expect(clampCheckpointValueToTimeGoal(90, "minute", 60)).toEqual({
      sliderMinutes: 59,
      value: 59,
    });
  });

  it("formats slider labels and goal-relative progress for the UI readout", () => {
    expect(formatCheckpointSliderLabel(90)).toBe("1h 30m");
    expect(formatCheckpointSliderLabel(45)).toBe("45m");
    expect(formatCheckpointSliderProgress(45, 60)).toBe("75% of goal");
  });
});
