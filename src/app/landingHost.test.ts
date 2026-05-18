import { describe, expect, it } from "vitest";
import { shouldUseLandingSoon } from "./landingHost";

describe("shouldUseLandingSoon", () => {
  it("returns true for the canonical live host", () => {
    expect(shouldUseLandingSoon("tasklaunch.app")).toBe(true);
    expect(shouldUseLandingSoon("TASKLAUNCH.APP")).toBe(true);
  });

  it("returns false for localhost development", () => {
    expect(shouldUseLandingSoon("localhost:3000")).toBe(false);
  });

  it("returns false for all other hosts", () => {
    expect(shouldUseLandingSoon("")).toBe(false);
    expect(shouldUseLandingSoon(null)).toBe(false);
    expect(shouldUseLandingSoon("127.0.0.1:3000")).toBe(false);
    expect(shouldUseLandingSoon("preview.tasklaunch.app")).toBe(false);
  });
});
