import { describe, expect, it } from "vitest";

import { generateScheduleRepairCandidates } from "./scheduleRepairCandidates";
import { buildDeterministicScheduleRepairFixtures } from "./scheduleRepairEvaluationFixtures";

describe("Schedule Repair deterministic evaluation fixtures", () => {
  const fixtures = buildDeterministicScheduleRepairFixtures();

  it("contains 100+ deterministic scenarios across overload and safety categories", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(100);
    expect(new Set(fixtures.map((fixture) => fixture.category))).toEqual(new Set(["no-repair", "severe-overload", "slight-overload", "future-overload", "no-safe-solution"]));
  });

  it("produces stable results and reason codes for every fixture", () => {
    fixtures.forEach((fixture) => {
      const input = { localDate: fixture.localDate, tasks: fixture.tasks, remainingCapacity: fixture.capacity, futureDays: fixture.futureDays };
      const first = generateScheduleRepairCandidates(input);
      const second = generateScheduleRepairCandidates(input);
      expect(second).toEqual(first);
      expect(first.estimatedPlannedMinutesAfter).toBeLessThanOrEqual(first.evaluation.remainingPlannedMinutesBefore);
      first.actions.forEach((action) => {
        expect(action.reasonCodes.length).toBeGreaterThan(0);
        expect(action.status).toBe("PROPOSED");
        if (action.type === "MOVE_TO_LATER_DAY") expect(action.toDate && action.toDate > fixture.localDate).toBe(true);
      });
    });
  });

  it("protects due-today hard-deadline and pinned tasks from move/remove actions", () => {
    ["due-today", "pinned"].forEach((prefix) => {
      const fixture = fixtures.find((candidate) => candidate.tasks.some((task) => task.id.startsWith(prefix)));
      expect(fixture).toBeDefined();
      const result = generateScheduleRepairCandidates({ localDate: fixture!.localDate, tasks: fixture!.tasks, remainingCapacity: fixture!.capacity, futureDays: fixture!.futureDays });
      expect(result.actions.filter((action) => action.taskId.startsWith(prefix) && ["MOVE_TO_LATER_DAY", "REMOVE_FROM_TODAY"].includes(action.type))).toHaveLength(0);
    });
  });

  it("stops after minimum sufficient relief and never uses an overloaded target day", () => {
    fixtures.filter((fixture) => fixture.category === "severe-overload" || fixture.category === "future-overload").forEach((fixture) => {
      const result = generateScheduleRepairCandidates({ localDate: fixture.localDate, tasks: fixture.tasks, remainingCapacity: fixture.capacity, futureDays: fixture.futureDays });
      expect(result.relievedMinutes).toBeLessThanOrEqual(result.evaluation.remainingPlannedMinutesBefore);
      result.actions.filter((action) => action.type === "MOVE_TO_LATER_DAY").forEach((action) => {
        const target = fixture.futureDays.find((day) => day.date === action.toDate);
        expect(target).toBeDefined();
        expect(target!.plannedMinutes + (action.fromMinutes || 0)).toBeLessThanOrEqual(target!.capacityMax);
      });
    });
  });

  it("returns a no-safe-solution outcome when only protected workload remains", () => {
    const fixture = fixtures.find((candidate) => candidate.category === "no-safe-solution")!;
    const result = generateScheduleRepairCandidates({ localDate: fixture.localDate, tasks: fixture.tasks, remainingCapacity: fixture.capacity, futureDays: fixture.futureDays });
    expect(result.actions).toHaveLength(0);
    expect(result.evaluation.outcome).toBe("NO_SAFE_SOLUTION");
    expect(result.evaluation.reasonCodes).toContain("NO_SAFE_MOVE_AVAILABLE");
  });

  it("keeps partial-progress suggestions distinct from historical capacity", () => {
    const fixture = fixtures.find((candidate) => candidate.tasks.some((task) => task.partialProgressUseful))!;
    const result = generateScheduleRepairCandidates({ localDate: fixture.localDate, tasks: fixture.tasks, remainingCapacity: fixture.capacity, futureDays: fixture.futureDays });
    const partial = result.actions.find((action) => action.type === "REDUCE_TODAY_TARGET");
    expect(partial?.reasonCodes).toContain("PARTIAL_PROGRESS_USEFUL");
    expect(partial?.toMinutes).toBeLessThan(partial?.fromMinutes || 1);
  });
});
