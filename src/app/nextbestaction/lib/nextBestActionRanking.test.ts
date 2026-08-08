import { describe, expect, it } from "vitest";

import type { Task } from "@/app/tasktimer/lib/types";

import { DEFAULT_NEXT_BEST_ACTION_RANKING_CONFIG, rankNextBestActionCandidates, type NextBestActionCandidate } from "./nextBestActionRanking";

function task(id: string, overrides: Partial<Task> = {}) {
  return {
    id,
    name: id,
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    ...overrides,
  } as Task;
}

function candidate(id: string, overrides: Partial<NextBestActionCandidate> = {}): NextBestActionCandidate {
  return {
    ownerUid: "user-1",
    task: task(id),
    ...overrides,
  };
}

describe("Next Best Action ranking", () => {
  it("ranks a due-soon task above a flexible low-priority task", () => {
    const result = rankNextBestActionCandidates({
      userId: "user-1",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      todayDate: "2026-08-07",
      candidates: [
        candidate("flexible", { explicitPriority: "low" }),
        candidate("due-soon", { task: task("due-soon", { onceOffTargetDate: "2026-08-09" }) }),
      ],
    });

    expect(result.primary?.taskId).toBe("due-soon");
    expect(result.primary?.reasonCodes).toContain("DUE_SOON");
  });

  it("excludes candidates that are not owned or actionable", () => {
    const result = rankNextBestActionCandidates({
      userId: "user-1",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      todayDate: "2026-08-07",
      candidates: [
        candidate("owned"),
        candidate("other-owner", { ownerUid: "user-2" }),
        candidate("deleted", { deleted: true }),
        candidate("completed", { completed: true }),
        candidate("blocked", { blocked: true }),
        candidate("not-actionable", { actionable: false }),
        candidate("hard-date-ineligible", { hardDateEligible: false }),
        candidate("incompatible-running", { incompatibleRunning: true }),
      ],
    });

    expect(result.candidates.map((item) => item.taskId)).toEqual(["owned"]);
  });

  it("uses duration sources in the approved precedence order", () => {
    const result = rankNextBestActionCandidates({
      userId: "user-1",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      todayDate: "2026-08-07",
      candidates: [
        candidate("user-confirmed", {
          userConfirmedDurationMinutes: 10,
          historicalDurationMinutes: 20,
          clarification: { acceptedEstimatedMinutes: 30 },
          task: task("user-confirmed", { timeGoalMinutes: 40 }),
        }),
        candidate("historical", {
          history: [{ ts: 1, ms: 20 * 60000, name: "Historical session" }],
          clarification: { acceptedEstimatedMinutes: 30 },
          task: task("historical", { timeGoalMinutes: 40 }),
        }),
        candidate("clarification", {
          clarification: { acceptedEstimatedMinutes: 30 },
          task: task("clarification", { timeGoalMinutes: 40 }),
        }),
        candidate("task-goal", { task: task("task-goal", { timeGoalMinutes: 40 }) }),
        candidate("default"),
      ],
    });

    expect(Object.fromEntries(result.candidates.map((item) => [item.taskId, [item.durationMinutes, item.durationSource]]))).toEqual({
      "user-confirmed": [10, "USER_CONFIRMED"],
      historical: [20, "HISTORICAL"],
      clarification: [30, "ACCEPTED_CLARIFICATION"],
      "task-goal": [40, "TASK_GOAL"],
      default: [20, "DEFAULT"],
    });
  });

  it("uses injected ranking weights while keeping reason codes deterministic", () => {
    const result = rankNextBestActionCandidates({
      userId: "user-1",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      todayDate: "2026-08-07",
      config: {
        ...DEFAULT_NEXT_BEST_ACTION_RANKING_CONFIG,
        version: "test-ranking-v2",
        weights: {
          ...DEFAULT_NEXT_BEST_ACTION_RANKING_CONFIG.weights,
          dueToday: 1,
          highPriority: 100,
          userPreferenceMatch: 1,
        },
      },
      candidates: [
        candidate("due", { task: task("due", { onceOffTargetDate: "2026-08-07" }) }),
        candidate("priority", { explicitPriority: "high" }),
        candidate("signals", {
          task: task("signals", { onceOffTargetDate: "2026-08-07" }),
          explicitPriority: "high",
          userConfirmedDurationMinutes: 20,
          clarification: { firstAction: "Open the checklist." },
          focusWindowMatched: true,
          postponementCount: 2,
          blocksImportantWork: true,
          recentlyStartedIncomplete: true,
          userPreferenceMatch: true,
        }),
      ],
    });

    expect(result.configVersion).toBe("test-ranking-v2");
    expect(result.primary?.taskId).toBe("signals");
    expect(result.primary?.reasonCodes).toEqual(
      expect.arrayContaining([
        "DUE_TODAY",
        "HIGH_PRIORITY",
        "MATCHES_FOCUS_WINDOW",
        "HAS_CLEAR_FIRST_ACTION",
        "FREQUENTLY_POSTPONED",
        "BLOCKS_OTHER_WORK",
        "RECENTLY_STARTED",
        "USER_PREFERENCE_MATCH",
      ])
    );
  });

  it("uses stable tie-breaking without random ordering", () => {
    const zeroWeightConfig = {
      ...DEFAULT_NEXT_BEST_ACTION_RANKING_CONFIG,
      version: "tie-test-v1",
      weights: Object.fromEntries(Object.keys(DEFAULT_NEXT_BEST_ACTION_RANKING_CONFIG.weights).map((key) => [key, 0])) as typeof DEFAULT_NEXT_BEST_ACTION_RANKING_CONFIG.weights,
    };
    const context = {
      userId: "user-1",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      todayDate: "2026-08-07",
      config: zeroWeightConfig,
    };

    expect(
      rankNextBestActionCandidates({
        ...context,
        candidates: [
          candidate("later-deadline", { explicitPriority: "high", task: task("later-deadline", { onceOffTargetDate: "2026-08-09" }) }),
          candidate("earlier-deadline", { explicitPriority: "low", task: task("earlier-deadline", { onceOffTargetDate: "2026-08-08" }) }),
        ],
      }).primary?.taskId
    ).toBe("earlier-deadline");

    expect(
      rankNextBestActionCandidates({
        ...context,
        candidates: [candidate("z-task", { task: task("z-task") }), candidate("a-task", { task: task("a-task") })],
      }).primary?.taskId
    ).toBe("a-task");
  });

  it("keeps confidence separate from importance and lowers confidence for fallback duration", () => {
    const result = rankNextBestActionCandidates({
      userId: "user-1",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      todayDate: "2026-08-07",
      candidates: [
        candidate("limited-metadata"),
        candidate("strong-signals", {
          userConfirmedDurationMinutes: 15,
          focusWindowMatched: true,
          clarification: { firstAction: "Open the checklist." },
          task: task("strong-signals", { onceOffTargetDate: "2026-08-07" }),
        }),
      ],
    });

    expect(result.candidates.find((item) => item.taskId === "limited-metadata")?.confidence).toBe("LOW");
    expect(result.candidates.find((item) => item.taskId === "strong-signals")?.confidence).toBe("HIGH");
  });

  it("scores available-time fit and records duration mismatch reasons", () => {
    const result = rankNextBestActionCandidates({
      userId: "user-1",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      todayDate: "2026-08-07",
      availableMinutes: 30,
      candidates: [
        candidate("fits", { userConfirmedDurationMinutes: 20 }),
        candidate("too-long", { userConfirmedDurationMinutes: 60 }),
      ],
    });

    expect(result.primary?.taskId).toBe("fits");
    expect(result.primary?.reasonCodes).toContain("FITS_AVAILABLE_TIME");
    expect(result.candidates.find((item) => item.taskId === "too-long")?.reasonCodes).toContain("EXCEEDS_AVAILABLE_TIME");
  });

  it("uses remaining capacity as a soft duration-fit signal", () => {
    const result = rankNextBestActionCandidates({
      userId: "user-1",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      todayDate: "2026-08-07",
      remainingCapacityRange: { min: 10, max: 20 },
      candidates: [
        candidate("fits", { userConfirmedDurationMinutes: 15 }),
        candidate("too-long", { userConfirmedDurationMinutes: 30 }),
        candidate("urgent", { userConfirmedDurationMinutes: 30, explicitPriority: "high", task: task("urgent", { onceOffTargetDate: "2026-08-07" }) }),
      ],
    });

    expect(result.candidates.find((item) => item.taskId === "fits")?.reasonCodes).toContain("FITS_REMAINING_CAPACITY");
    expect(result.candidates.find((item) => item.taskId === "urgent")).toBeDefined();
  });

  it("does not suppress hard-deadline work when capacity is low", () => {
    const result = rankNextBestActionCandidates({
      userId: "user-1",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      todayDate: "2026-08-07",
      remainingCapacityRange: { min: 0, max: 1 },
      candidates: [candidate("hard-deadline", {
        userConfirmedDurationMinutes: 60,
        explicitPriority: "high",
        hardDateEligible: true,
        task: task("hard-deadline", { onceOffTargetDate: "2026-08-07" }),
      })],
    });

    expect(result.primary?.taskId).toBe("hard-deadline");
  });
});
