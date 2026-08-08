import { describe, expect, it } from "vitest";

import { createDailyExecutiveBriefSummaryProvider, validateDailyExecutiveBriefAiSummary, type DailyExecutiveBriefSummaryInput } from "./dailyExecutiveBriefSummaryProvider";

const facts: DailyExecutiveBriefSummaryInput = { plannedMinutes: 90, completedMinutes: 10, remainingMinutes: 80, realisticWorkloadRange: { minMinutes: 45, maxMinutes: 60 }, planHealth: "SLIGHTLY_OVERLOADED", deadlineRisk: "WATCH", reasonCodes: ["OVER_CAPACITY"] };

describe("Daily Executive Brief summary provider", () => {
  it("accepts a summary supported by deterministic facts", () => {
    expect(validateDailyExecutiveBriefAiSummary({ summary: "80 minutes remain; a realistic range is 45-60 minutes." }, facts)).toBe("80 minutes remain; a realistic range is 45-60 minutes.");
  });

  it("rejects invented numbers, dates, task details, and unsupported claims", () => {
    expect(validateDailyExecutiveBriefAiSummary({ summary: "120 minutes remain." }, facts)).toBeNull();
    expect(validateDailyExecutiveBriefAiSummary({ summary: "Tomorrow, your task is urgent." }, facts)).toBeNull();
    expect(validateDailyExecutiveBriefAiSummary({ summary: "The plan is overloaded." }, { ...facts, planHealth: "REALISTIC" })).toBeNull();
  });

  it("falls through provider failures as errors for the caller to handle", async () => {
    const provider = createDailyExecutiveBriefSummaryProvider({ apiKey: "test-key", fetchImpl: async () => new Response("{}", { status: 429 }) });
    await expect(provider.summarize(facts)).rejects.toThrow("summary request failed");
  });
});
