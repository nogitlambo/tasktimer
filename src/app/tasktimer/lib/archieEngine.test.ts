import { afterEach, describe, expect, it, vi } from "vitest";

import { buildArchieQueryResponse, buildRecommendationDraft, type ArchieWorkspaceContext } from "./archieEngine";
import { DEFAULT_REWARD_PROGRESS } from "./rewards";

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

function createPreferences(overrides?: Partial<NonNullable<ArchieWorkspaceContext["preferences"]>>) {
  return {
    schemaVersion: 1,
    theme: "purple",
    menuButtonStyle: "square",
    startupModule: "dashboard",
    taskView: "list",
    taskOrderBy: "custom",
    dynamicColorsEnabled: true,
    autoFocusOnTaskLaunchEnabled: false,
    mobilePushAlertsEnabled: false,
    webPushAlertsEnabled: false,
    checkpointAlertSoundEnabled: true,
    checkpointAlertToastEnabled: true,
    optimalProductivityStartTime: "00:00",
    optimalProductivityEndTime: "23:59",
    rewards: DEFAULT_REWARD_PROGRESS,
    updatedAtMs: 0,
    ...overrides,
  } satisfies NonNullable<ArchieWorkspaceContext["preferences"]>;
}

describe("Archie engine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a conservative recommendation draft from under-served task data", () => {
    const draft = buildRecommendationDraft(createContext());
    expect(draft).not.toBeNull();
    expect(draft?.summary).toContain("Admin Cleanup");
    expect(draft?.proposedChanges.length).toBeGreaterThan(0);
    expect(draft?.proposedChanges.some((change) => change.kind === "reorder_task")).toBe(false);
    expect(draft?.evidence.some((item) => item.includes("protected morning block"))).toBe(true);
    expect(draft?.reasoning).toContain("active flow");
    expect(draft?.reasoning).toContain("protected morning block");
  });

  it("does not use Tasks screen display order as a workflow optimization signal", () => {
    const draft = buildRecommendationDraft(
      createContext({
        tasks: [
          {
            id: "task-a",
            name: "Deep Work",
            order: 99,
            accumulatedMs: 0,
            running: false,
            startMs: null,
            collapsed: false,
            milestonesEnabled: false,
            milestones: [],
            hasStarted: true,
            plannedStartDay: "mon",
            plannedStartTime: "09:00",
            plannedStartOpenEnded: false,
          },
          {
            id: "task-b",
            name: "Admin Cleanup",
            order: 0,
            accumulatedMs: 0,
            running: false,
            startMs: null,
            collapsed: false,
            milestonesEnabled: false,
            milestones: [],
            hasStarted: true,
            plannedStartDay: null,
            plannedStartTime: null,
            plannedStartOpenEnded: false,
          },
        ],
      })
    );

    expect(draft?.proposedChanges.some((change) => change.kind === "reorder_task")).toBe(false);
    expect(draft?.kind).not.toBe("task_prioritization");
    expect(draft?.reasoning.toLowerCase()).not.toContain("reorder");
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
    expect(response.citations[0]?.route).toBe("/history-manager");
    expect(response.citations[0]?.title).toContain("Settings");
  });

  it("returns settings pane citations for settings answers", () => {
    const response = buildArchieQueryResponse("Where do I change the theme?", createContext(), (seed) => ({
      ...seed,
      id: "draft-settings",
      createdAt: Date.now(),
      status: "draft",
    }));
    expect(response.mode).toBe("product_answer");
    expect(response.citations[0]?.route).toBe("/settings");
    expect(response.citations[0]?.settingsPane).toBe("appearance");
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

  it("uses recent completion difficulty as recommendation evidence", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T10:00:00.000Z"));

    const draft = buildRecommendationDraft(
      createContext({
        historyByTaskId: {
          "task-a": [{ ts: new Date("2026-04-14T09:15:00Z").getTime(), name: "Deep Work", ms: 3600000, completionDifficulty: 5 }],
          "task-b": [{ ts: new Date("2026-04-14T08:15:00Z").getTime(), name: "Admin Cleanup", ms: 3600000, completionDifficulty: 1 }],
        },
      })
    );

    expect(draft?.summary).toContain("Admin Cleanup");
    expect(draft?.evidence).toContain("Recent challenge rating: Very Difficult.");
    expect(draft?.reasoning).toContain("very difficult");
  });

  it("prefers logged work windows inside the configured productivity period", () => {
    const draft = buildRecommendationDraft(
      createContext({
        preferences: createPreferences({
          optimalProductivityStartTime: "14:00",
          optimalProductivityEndTime: "15:00",
        }),
        historyByTaskId: {
          "task-a": [
            { ts: new Date(2026, 3, 7, 9, 15).getTime(), name: "Deep Work", ms: 7200000 },
            { ts: new Date(2026, 3, 8, 14, 10).getTime(), name: "Deep Work", ms: 3600000 },
          ],
          "task-b": [],
        },
      })
    );

    const scheduleChange = draft?.proposedChanges.find((change) => change.kind === "update_schedule");
    expect(scheduleChange?.kind).toBe("update_schedule");
    if (scheduleChange?.kind === "update_schedule") {
      expect(scheduleChange.after.plannedStartTime).toBe("14:00");
    }
  });

  it("falls back to the strongest logged window when the configured productivity period has no history", () => {
    const draft = buildRecommendationDraft(
      createContext({
        preferences: createPreferences({
          optimalProductivityStartTime: "14:00",
          optimalProductivityEndTime: "15:00",
        }),
        historyByTaskId: {
          "task-a": [{ ts: new Date(2026, 3, 7, 9, 15).getTime(), name: "Deep Work", ms: 7200000 }],
          "task-b": [],
        },
      })
    );

    const scheduleChange = draft?.proposedChanges.find((change) => change.kind === "update_schedule");
    expect(scheduleChange?.kind).toBe("update_schedule");
    if (scheduleChange?.kind === "update_schedule") {
      expect(scheduleChange.after.plannedStartTime).toBe("09:00");
    }
  });

  it("uses broader 90-day history to identify recently under-served tasks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T10:00:00.000Z"));

    const historicalRows = Array.from({ length: 12 }, (_, index) => ({
      ts: new Date(2026, 0, 5 + index * 7, 8, 0).getTime(),
      name: "Admin Cleanup",
      ms: 60 * 60 * 1000,
    }));

    const draft = buildRecommendationDraft(
      createContext({
        historyByTaskId: {
          "task-a": [
            { ts: new Date(2026, 3, 11, 9, 0).getTime(), name: "Deep Work", ms: 2 * 60 * 60 * 1000 },
            { ts: new Date(2026, 3, 12, 9, 0).getTime(), name: "Deep Work", ms: 2 * 60 * 60 * 1000 },
            { ts: new Date(2026, 3, 13, 9, 0).getTime(), name: "Deep Work", ms: 2 * 60 * 60 * 1000 },
          ],
          "task-b": [
            ...historicalRows,
            { ts: new Date(2026, 3, 13, 8, 0).getTime(), name: "Admin Cleanup", ms: 15 * 60 * 1000 },
          ],
        },
      })
    );

    expect(draft?.summary).toContain("Admin Cleanup");
    expect(draft?.evidence.some((item) => item.includes("broader 90-day activity pattern"))).toBe(true);
    expect(draft?.reasoning).toContain("broader 90-day pattern");
  });

  it("builds a multi-task daily schedule revamp from trailing 30-day activity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T10:00:00.000Z"));

    const draft = buildRecommendationDraft(
      createContext({
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
            plannedStartDay: null,
            plannedStartTime: null,
            plannedStartOpenEnded: false,
          },
          {
            id: "task-b",
            name: "Admin Cleanup",
            order: 1,
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
          {
            id: "task-c",
            name: "Meditation",
            order: 2,
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
          "task-a": Array.from({ length: 10 }, (_, index) => ({
            ts: new Date(2026, 2, 12 + index, 8, 0).getTime(),
            name: "Deep Work",
            ms: 90 * 60 * 1000,
          })),
          "task-b": Array.from({ length: 9 }, (_, index) => ({
            ts: new Date(2026, 2, 12 + index, 10, 0).getTime(),
            name: "Admin Cleanup",
            ms: 45 * 60 * 1000,
          })),
          "task-c": Array.from({ length: 12 }, (_, index) => ({
            ts: new Date(2026, 2, 12 + index, 18, 30).getTime(),
            name: "Meditation",
            ms: 30 * 60 * 1000,
          })),
        },
      }),
      "Please rebuild my schedule based on the last 30 days of activity."
    );

    expect(draft?.kind).toBe("schedule_adjustment");
    expect(draft?.summary).toContain("full schedule revamp");
    const scheduleChanges = draft?.proposedChanges.filter((change) => change.kind === "update_schedule") || [];
    expect(scheduleChanges.length).toBeGreaterThanOrEqual(3);
    scheduleChanges.forEach((change) => {
      if (change.kind !== "update_schedule") return;
      expect(change.after.plannedStartDay).toBeNull();
      expect(change.after.plannedStartTime).not.toBeNull();
    });
    expect(draft?.evidence.some((item) => item.includes("active on"))).toBe(true);
  });

  it("abstains on unsupported product questions instead of creating a workflow draft", () => {
    const response = buildArchieQueryResponse("How do I connect Slack to TaskLaunch?", createContext(), (seed) => ({
      ...seed,
      id: "draft-3",
      createdAt: Date.now(),
      status: "draft",
    }));
    expect(response.mode).toBe("fallback");
    expect(response.draftId).toBeUndefined();
    expect(response.citations).toEqual([]);
    expect(response.message.toLowerCase()).toContain("not confident enough");
  });

  it("abstains when the knowledge match is too weak", () => {
    const response = buildArchieQueryResponse("What does the assistant know about my spaceship settings?", createContext(), (seed) => ({
      ...seed,
      id: "draft-4",
      createdAt: Date.now(),
      status: "draft",
    }));
    expect(response.mode).toBe("fallback");
    expect(response.draft).toBeUndefined();
  });
});
