import { describe, expect, it } from "vitest";

import { buildArchieQueryResponse, buildRecommendationDraft, type ArchieWorkspaceContext } from "./archieEngine";

function createContext(overrides?: Partial<ArchieWorkspaceContext>): ArchieWorkspaceContext {
  return {
    tasks: [
      {
        id: "task-a",
        name: "Deep Work",
        order: 0,
        accumulatedMs: 0,
        running: false,
        startMs: null,
        collapsed: false,
        milestonesEnabled: false,
        milestones: [],
        hasStarted: true,
        timeGoalEnabled: true,
        timeGoalValue: 1,
        timeGoalUnit: "hour",
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        plannedStartDay: "mon",
        plannedStartTime: "09:00",
        plannedStartOpenEnded: false,
      },
      {
        id: "task-b",
        name: "Admin Cleanup",
        order: 3,
        accumulatedMs: 0,
        running: false,
        startMs: null,
        collapsed: false,
        milestonesEnabled: false,
        milestones: [],
        hasStarted: true,
        timeGoalEnabled: true,
        timeGoalValue: 1,
        timeGoalUnit: "hour",
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        plannedStartDay: null,
        plannedStartTime: null,
        plannedStartOpenEnded: false,
      },
    ],
    historyByTaskId: {
      "task-a": [
        { ts: new Date("2026-04-07T09:15:00Z").getTime(), name: "Deep Work", ms: 3600000 },
        { ts: new Date("2026-04-08T09:10:00Z").getTime(), name: "Deep Work", ms: 5400000 },
      ],
      "task-b": [],
    },
    preferences: null,
    taskUi: null,
    focusSessionNotesByTaskId: {
      "task-b": "Needs a protected morning block to get unstuck.",
    },
    ...overrides,
  };
}

describe("Archie engine", () => {
  it("creates a conservative recommendation draft from under-served task data", () => {
    const draft = buildRecommendationDraft(createContext());
    expect(draft).not.toBeNull();
    expect(draft?.summary).toContain("Admin Cleanup");
    expect(draft?.proposedChanges.length).toBeGreaterThan(0);
    expect(draft?.evidence.some((item) => item.includes("protected morning block"))).toBe(true);
  });

  it("answers product questions from curated knowledge with citations", () => {
    const response = buildArchieQueryResponse("How do I use history manager?", createContext(), (seed) => ({
      ...seed,
      id: "draft-1",
      createdAt: Date.now(),
      status: "draft",
    }));
    expect(response.mode).toBe("product_answer");
    expect(response.citations.length).toBeGreaterThan(0);
    expect(response.message.toLowerCase()).toContain("history manager");
  });

  it("returns a reviewable draft for workflow questions", () => {
    const response = buildArchieQueryResponse("What should I work on next?", createContext(), (seed) => ({
      ...seed,
      id: "draft-2",
      createdAt: Date.now(),
      status: "draft",
    }));
    expect(response.mode).toBe("workflow_advice");
    expect(response.draftId).toBe("draft-2");
    expect(response.suggestedAction?.kind).toBe("reviewDraft");
  });
});
