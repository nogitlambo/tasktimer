import { describe, expect, it } from "vitest";

import { createDefaultExecutiveNudgePreferences, type ExecutiveNudgeCandidate } from "./executiveNudgeContract";
import {
  arbitrateExecutiveNudges,
  createDefaultExecutiveNudgeArbitrationConfig,
  type ExecutiveNudgeArbitrationInput,
} from "./executiveNudgeArbitration";

const now = "2026-08-11T09:00:00.000Z";

function candidate(overrides: Partial<ExecutiveNudgeCandidate> = {}): ExecutiveNudgeCandidate {
  return {
    id: "candidate-1",
    userId: "user-1",
    type: "START_OPPORTUNITY",
    sourceFeature: "NEXT_BEST_ACTION",
    sourceEntityId: "nba-1",
    sourceEntityVersion: "version-1",
    priority: "NORMAL",
    urgency: 50,
    usefulness: 50,
    interruptionCost: 20,
    reasonCodes: ["CAPACITY_AVAILABLE"],
    action: { type: "START_TASK", taskId: "task-1" },
    createdAt: "2026-08-11T08:55:00.000Z",
    expiresAt: "2026-08-11T09:30:00.000Z",
    ...overrides,
  };
}

function input(overrides: Partial<ExecutiveNudgeArbitrationInput> = {}): ExecutiveNudgeArbitrationInput {
  return {
    userId: "user-1",
    candidates: [candidate()],
    preferences: { ...createDefaultExecutiveNudgePreferences("user-1", Date.parse(now)), enabled: true },
    now,
    localTime: "09:00",
    activeTaskSession: false,
    recentDeliveries: [],
    config: createDefaultExecutiveNudgeArbitrationConfig(),
    ...overrides,
  };
}

describe("Executive Nudge arbitration", () => {
  it("selects exactly one highest-value eligible candidate with deterministic tie breaking", () => {
    const result = arbitrateExecutiveNudges(input({
      candidates: [
        candidate({ id: "candidate-b", priority: "HIGH", urgency: 80 }),
        candidate({ id: "candidate-a", priority: "HIGH", urgency: 80 }),
        candidate({ id: "candidate-low", priority: "LOW", urgency: 100 }),
      ],
    }));

    expect(result.selected).toMatchObject({ id: "candidate-a", type: "START_OPPORTUNITY" });
    expect(result.selectedCount).toBe(1);
    expect(result.suppressions).toContainEqual(expect.objectContaining({ candidateId: "candidate-b", code: "HIGHER_PRIORITY_SELECTED" }));
  });

  it("chooses send nothing during quiet hours or an active task session", () => {
    const quiet = arbitrateExecutiveNudges(input({ localTime: "23:00" }));
    expect(quiet).toMatchObject({ selected: null, selectedCount: 0 });
    expect(quiet.suppressions).toContainEqual(expect.objectContaining({ code: "QUIET_HOURS" }));

    const activeSession = arbitrateExecutiveNudges(input({ activeTaskSession: true }));
    expect(activeSession).toMatchObject({ selected: null, selectedCount: 0 });
    expect(activeSession.suppressions).toContainEqual(expect.objectContaining({ code: "ACTIVE_TASK_SESSION" }));
  });

  it("fails quiet when preferences, freshness, cooldown, duplicate, or push-limit guards exclude a candidate", () => {
    const preferences = { ...createDefaultExecutiveNudgePreferences("user-1", Date.parse(now)), enabled: true, paused: true };
    expect(arbitrateExecutiveNudges(input({ preferences }))).toMatchObject({ selected: null });

    const stale = arbitrateExecutiveNudges(input({ sourceFreshnessByCandidateId: { "candidate-1": "STALE" } }));
    expect(stale.suppressions).toContainEqual(expect.objectContaining({ code: "SOURCE_STALE" }));

    const duplicate = arbitrateExecutiveNudges(input({
      recentDeliveries: [{
        id: "delivery-1", userId: "user-1", candidateId: "previous-candidate", candidateType: "START_OPPORTUNITY",
        sourceFeature: "NEXT_BEST_ACTION", sourceEntityId: "nba-1", channel: "IN_APP", reasonCodes: ["CAPACITY_AVAILABLE"],
        status: "DELIVERED", action: { type: "START_TASK", taskId: "task-1" }, createdAt: "2026-08-11T08:59:00.000Z", deliveredAt: "2026-08-11T08:59:00.000Z",
      }],
    }));
    expect(duplicate.suppressions).toContainEqual(expect.objectContaining({ code: "DUPLICATE" }));

    const pushLimitedPreferences = { ...createDefaultExecutiveNudgePreferences("user-1", Date.parse(now)), enabled: true, maximumPushNudgesPerDay: 0 };
    const pushLimited = arbitrateExecutiveNudges(input({ preferences: pushLimitedPreferences, deliveryChannel: "ANDROID_PUSH" }));
    expect(pushLimited.suppressions).toContainEqual(expect.objectContaining({ code: "DAILY_LIMIT_REACHED" }));
  });
});
