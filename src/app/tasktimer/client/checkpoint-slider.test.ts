import { describe, expect, it } from "vitest";
import {
  clampCheckpointSliderSeconds,
  clampCheckpointValueToTimeGoal,
  formatCheckpointSliderLabel,
  formatCheckpointSliderProgress,
  getCheckpointSliderMaxSeconds,
  checkpointValueToSliderSeconds,
  sliderSecondsToCheckpointValue,
} from "./checkpoint-slider";

describe("checkpoint slider helpers", () => {
  it("uses a one-second-below-goal upper bound", () => {
    expect(getCheckpointSliderMaxSeconds(60)).toBe(3599);
    expect(getCheckpointSliderMaxSeconds(1)).toBe(59);
    expect(getCheckpointSliderMaxSeconds(1 / 60)).toBe(1);
  });

  it("converts hour-unit checkpoint values to slider seconds and back", () => {
    expect(checkpointValueToSliderSeconds(1.5, "hour")).toBe(5400);
    expect(checkpointValueToSliderSeconds(1 / 3600, "hour")).toBe(1);
    expect(sliderSecondsToCheckpointValue(90, "hour")).toBe(90 / 3600);
  });

  it("converts minute-unit checkpoint values to slider seconds and back", () => {
    expect(checkpointValueToSliderSeconds(45, "minute")).toBe(2700);
    expect(checkpointValueToSliderSeconds(1 / 60, "minute")).toBe(1);
    expect(sliderSecondsToCheckpointValue(45, "minute")).toBe(45 / 60);
  });

  it("clamps slider positions to the valid goal range", () => {
    expect(clampCheckpointSliderSeconds(0, 60)).toBe(1);
    expect(clampCheckpointSliderSeconds(30, 60)).toBe(30);
    expect(clampCheckpointSliderSeconds(9999, 60)).toBe(3599);
  });

  it("clamps persisted checkpoint values against the current time goal", () => {
    expect(clampCheckpointValueToTimeGoal(2, "hour", 60)).toEqual({
      sliderSeconds: 3599,
      value: 3599 / 3600,
    });
    expect(clampCheckpointValueToTimeGoal(90, "minute", 60)).toEqual({
      sliderSeconds: 3599,
      value: 3599 / 60,
    });
  });

  it("formats slider labels and goal-relative progress for the UI readout", () => {
    expect(formatCheckpointSliderLabel(45)).toBe("45s");
    expect(formatCheckpointSliderLabel(90)).toBe("1m 30s");
    expect(formatCheckpointSliderLabel(5400)).toBe("1h 30m");
    expect(formatCheckpointSliderProgress(2700, 60)).toBe("75% of goal");
  });
});
