import { describe, expect, it } from "vitest";

import { calculateDailyExecutiveBriefPlan, type DailyExecutiveBriefPlanningInput } from "./dailyExecutiveBriefPlanning";

const baseInput: DailyExecutiveBriefPlanningInput = {
  todayDate: "2026-08-07",
  availability: {
    userSelectedMinutes: null,
    remainingFocusWindowMinutes: null,
    scheduleAvailableMinutes: 60,
    historicalBaselineMinutes: 90,
    productDefaultMinutes: 120,
    focusWindowPresent: true,
  },
  tasks: [],
};

function task(overrides: Partial<NonNullable<DailyExecutiveBriefPlanningInput["tasks"]>[number]> = {}) {
  return {
    id: "task-1",
    estimatedMinutes: 30,
    completedMinutes: 0,
    priority: "medium" as const,
    flexible: true,
    ...overrides,
  };
}

describe("calculateDailyExecutiveBriefPlan", () => {
  it("uses capacity sources in the documented precedence order", () => {
    const plan = calculateDailyExecutiveBriefPlan({
      ...baseInput,
      availability: { ...baseInput.availability, userSelectedMinutes: 25, remainingFocusWindowMinutes: 40, scheduleAvailableMinutes: 60 },
      tasks: [task({ estimatedMinutes: 20 })],
    });
    expect(plan.capacitySource).toBe("USER_SELECTED");
    expect(plan.capacityMinutes).toBe(25);
  });

  it("calculates planned, completed, remaining, and realistic workload values deterministically", () => {
    const input = { ...baseInput, tasks: [task({ id: "a", estimatedMinutes: 30, completedMinutes: 10 }), task({ id: "b", estimatedMinutes: 40, completedMinutes: 5 })] };
    expect(calculateDailyExecutiveBriefPlan(input)).toMatchObject({
      plannedMinutes: 70,
      completedMinutes: 15,
      remainingMinutes: 55,
      realisticWorkloadRange: { minMinutes: 45, maxMinutes: 60 },
      planHealth: "REALISTIC",
    });
  });

  it("classifies light, slightly overloaded, and significantly overloaded plans", () => {
    const one = (minutes: number) => calculateDailyExecutiveBriefPlan({ ...baseInput, tasks: [task({ estimatedMinutes: minutes })] });
    expect(one(30).planHealth).toBe("REALISTIC");
    expect(one(70).planHealth).toBe("SLIGHTLY_OVERLOADED");
    expect(one(100).planHealth).toBe("SIGNIFICANTLY_OVERLOADED");
  });

  it("reports insufficient data for empty or entirely unknown plans", () => {
    expect(calculateDailyExecutiveBriefPlan(baseInput).planHealth).toBe("INSUFFICIENT_DATA");
    const plan = calculateDailyExecutiveBriefPlan({ ...baseInput, tasks: [task({ estimatedMinutes: null })] });
    expect(plan.planHealth).toBe("INSUFFICIENT_DATA");
    expect(plan.reasonCodes).toContain("UNKNOWN_DURATION");
  });

  it("classifies overdue and hard deadline risk without guessing missing dates", () => {
    const plan = calculateDailyExecutiveBriefPlan({
      ...baseInput,
      tasks: [task({ id: "overdue", dueDate: "2026-08-06" }), task({ id: "hard", dueDate: "2026-08-07", hardDeadline: true })],
    });
    expect(plan.deadlineRisk).toBe("CRITICAL");
    expect(plan.reasonCodes).toEqual(expect.arrayContaining(["OVERDUE", "DUE_TODAY"]));
  });

  it("reports clustered due-soon tasks and short or missing focus windows", () => {
    const plan = calculateDailyExecutiveBriefPlan({
      ...baseInput,
      availability: { ...baseInput.availability, remainingFocusWindowMinutes: 20, focusWindowPresent: false },
      tasks: [task({ id: "a", dueDate: "2026-08-08" }), task({ id: "b", dueDate: "2026-08-09" })],
    });
    expect(plan.deadlineRisk).toBe("WATCH");
    expect(plan.reasonCodes).toEqual(expect.arrayContaining(["DUE_SOON", "CLUSTERED_DEADLINES", "NO_FOCUS_WINDOW", "SHORT_FOCUS_WINDOW"]));
  });

  it("offers at most three safe adjustments and never suggests hard, urgent, pinned, or in-progress work", () => {
    const plan = calculateDailyExecutiveBriefPlan({
      ...baseInput,
      tasks: [
        task({ id: "safe-split", estimatedMinutes: 60 }),
        task({ id: "safe-move", estimatedMinutes: 30, dueDate: null }),
        task({ id: "safe-reduce", estimatedMinutes: 25, dueDate: "2026-08-07" }),
        task({ id: "hard", estimatedMinutes: 60, hardDeadline: true }),
        task({ id: "urgent", estimatedMinutes: 60, priority: "urgent" }),
        task({ id: "pinned", estimatedMinutes: 60, pinned: true }),
        task({ id: "running", estimatedMinutes: 60, inProgress: true }),
      ],
    });
    expect(plan.adjustments).toHaveLength(3);
    expect(plan.adjustments.map((adjustment) => adjustment.taskId)).toEqual(["safe-split", "safe-move", "safe-reduce"]);
    expect(plan.adjustments.map((adjustment) => adjustment.type)).toEqual(["SPLIT", "MOVE", "REDUCE"]);
    expect(plan.adjustments.some((adjustment) => ["hard", "urgent", "pinned", "running"].includes(adjustment.taskId))).toBe(false);
  });

  it("does not produce adjustments for a realistic plan", () => {
    const plan = calculateDailyExecutiveBriefPlan({ ...baseInput, tasks: [task({ estimatedMinutes: 20 })] });
    expect(plan.adjustments).toEqual([]);
  });

  it("does not mutate input task or availability data", () => {
    const input = { ...baseInput, tasks: [task({ estimatedMinutes: 100 })] };
    const before = JSON.parse(JSON.stringify(input));
    calculateDailyExecutiveBriefPlan(input);
    expect(input).toEqual(before);
  });
});
