import { describe, expect, it } from "vitest";
import {
  clampCheckpointSliderSeconds,
  clampCheckpointValueToTimeGoal,
  formatCheckpointSliderLabel,
  formatCheckpointSliderProgress,
  getCheckpointSliderMaxSeconds,
  getNextCheckpointSliderSeconds,
  checkpointValueToSliderSeconds,
  parseCheckpointDurationInput,
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

  it("places the first checkpoint at half of the time goal", () => {
    expect(getNextCheckpointSliderSeconds([], "hour", 60)).toBe(1800);
    expect(getNextCheckpointSliderSeconds([], "minute", 1)).toBe(30);
  });

  it("places subsequent checkpoints halfway between the previous row and the time goal", () => {
    expect(getNextCheckpointSliderSeconds([{ hours: 0.5 }], "hour", 60)).toBe(2700);
    expect(getNextCheckpointSliderSeconds([{ hours: 0.5 }, { hours: 0.75 }], "hour", 60)).toBe(3150);
  });

  it("uses minute-unit checkpoint values when computing the next checkpoint", () => {
    expect(getNextCheckpointSliderSeconds([{ hours: 30 }], "minute", 60)).toBe(2700);
  });

  it("returns null when the previous checkpoint is already at the goal limit", () => {
    expect(getNextCheckpointSliderSeconds([{ hours: 3599 / 3600 }], "hour", 60)).toBeNull();
    expect(getNextCheckpointSliderSeconds([{ hours: 59 / 60 }], "minute", 1)).toBeNull();
  });

  it("formats slider labels and goal-relative progress for the UI readout", () => {
    expect(formatCheckpointSliderLabel(45)).toBe("45s");
    expect(formatCheckpointSliderLabel(90)).toBe("1m 30s");
    expect(formatCheckpointSliderLabel(5400)).toBe("1h 30m");
    expect(formatCheckpointSliderProgress(2700, 60)).toBe("75% of goal");
  });

  it("parses checkpoint duration input into rounded seconds", () => {
    expect(parseCheckpointDurationInput("1h 30m")).toBe(5400);
    expect(parseCheckpointDurationInput("90m")).toBe(5400);
    expect(parseCheckpointDurationInput("45s")).toBe(45);
    expect(parseCheckpointDurationInput("1.5h")).toBe(5400);
    expect(parseCheckpointDurationInput("0.5m")).toBe(30);
    expect(parseCheckpointDurationInput("1.4s")).toBe(1);
    expect(parseCheckpointDurationInput("1.5s")).toBe(2);
  });

  it("treats bare checkpoint duration numbers as minutes", () => {
    expect(parseCheckpointDurationInput("90")).toBe(5400);
    expect(parseCheckpointDurationInput("1.5")).toBe(90);
  });

  it("rejects invalid checkpoint duration input", () => {
    expect(parseCheckpointDurationInput("")).toBeNull();
    expect(parseCheckpointDurationInput("soon")).toBeNull();
    expect(parseCheckpointDurationInput("1h soon")).toBeNull();
    expect(parseCheckpointDurationInput("1:30")).toBeNull();
  });
});
