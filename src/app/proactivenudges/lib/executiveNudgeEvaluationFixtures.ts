import {
  createDefaultExecutiveNudgePreferences,
  type ExecutiveNudgeCandidate,
  type ExecutiveNudgeDeliveryInput,
} from "./executiveNudgeContract";
import {
  arbitrateExecutiveNudges,
  createDefaultExecutiveNudgeArbitrationConfig,
  type ExecutiveNudgeArbitrationInput,
  type ExecutiveNudgeArbitrationResult,
} from "./executiveNudgeArbitration";

const NOW = "2026-08-11T09:00:00.000Z";

function candidate(overrides: Partial<ExecutiveNudgeCandidate> = {}): ExecutiveNudgeCandidate {
  return {
    id: "candidate-1", userId: "user-1", type: "START_OPPORTUNITY", sourceFeature: "NEXT_BEST_ACTION",
    sourceEntityId: "nba-1", sourceEntityVersion: "version-1", priority: "NORMAL", urgency: 50, usefulness: 50,
    interruptionCost: 20, reasonCodes: ["CAPACITY_AVAILABLE"], action: { type: "START_TASK", taskId: "task-1" },
    createdAt: "2026-08-11T08:55:00.000Z", expiresAt: "2026-08-11T09:30:00.000Z", ...overrides,
  };
}

function base(overrides: Partial<ExecutiveNudgeArbitrationInput> = {}): ExecutiveNudgeArbitrationInput {
  return {
    userId: "user-1", candidates: [candidate()], preferences: { ...createDefaultExecutiveNudgePreferences("user-1", Date.parse(NOW)), enabled: true },
    now: NOW, localTime: "09:00", activeTaskSession: false, recentDeliveries: [], config: createDefaultExecutiveNudgeArbitrationConfig(), ...overrides,
  };
}

type Expected = { selectedCandidateId: string | null; suppressionCodes: string[] };
export type ExecutiveNudgeEvaluationFixtureResult = { name: string; expected: Expected; actual: ExecutiveNudgeArbitrationResult };

export function runExecutiveNudgeEvaluationFixtures(): ExecutiveNudgeEvaluationFixtureResult[] {
  const delivered: ExecutiveNudgeDeliveryInput = {
    id: "delivery-1", userId: "user-1", candidateId: "old", candidateType: "START_OPPORTUNITY", sourceFeature: "NEXT_BEST_ACTION",
    sourceEntityId: "nba-1", channel: "IN_APP", reasonCodes: ["CAPACITY_AVAILABLE"], status: "DELIVERED",
    action: { type: "START_TASK", taskId: "task-1" }, createdAt: "2026-08-11T08:59:00.000Z", deliveredAt: "2026-08-11T08:59:00.000Z",
  };
  const paused = { ...createDefaultExecutiveNudgePreferences("user-1", Date.parse(NOW)), enabled: true, paused: true };
  const disabledType = { ...createDefaultExecutiveNudgePreferences("user-1", Date.parse(NOW)), enabled: true, typeEnabled: { ...createDefaultExecutiveNudgePreferences("user-1", Date.parse(NOW)).typeEnabled, START_OPPORTUNITY: false } };
  const zeroPushCap = { ...createDefaultExecutiveNudgePreferences("user-1", Date.parse(NOW)), enabled: true, maximumPushNudgesPerDay: 0 };
  const cases: Array<{ name: string; input: ExecutiveNudgeArbitrationInput; expected: Expected }> = [
    { name: "eligible default", input: base(), expected: { selectedCandidateId: "candidate-1", suppressionCodes: [] } },
    { name: "paused", input: base({ preferences: paused }), expected: { selectedCandidateId: null, suppressionCodes: ["NUDGES_PAUSED"] } },
    { name: "type disabled", input: base({ preferences: disabledType }), expected: { selectedCandidateId: null, suppressionCodes: ["NUDGE_TYPE_DISABLED"] } },
    { name: "quiet hours", input: base({ localTime: "23:00" }), expected: { selectedCandidateId: null, suppressionCodes: ["QUIET_HOURS"] } },
    { name: "active task session", input: base({ activeTaskSession: true }), expected: { selectedCandidateId: null, suppressionCodes: ["ACTIVE_TASK_SESSION"] } },
    { name: "stale source", input: base({ sourceFreshnessByCandidateId: { "candidate-1": "STALE" } }), expected: { selectedCandidateId: null, suppressionCodes: ["SOURCE_STALE"] } },
    { name: "duplicate", input: base({ recentDeliveries: [delivered] }), expected: { selectedCandidateId: null, suppressionCodes: ["DUPLICATE"] } },
    { name: "push cap", input: base({ preferences: zeroPushCap, deliveryChannel: "ANDROID_PUSH" }), expected: { selectedCandidateId: null, suppressionCodes: ["DAILY_LIMIT_REACHED"] } },
  ];
  return cases.map((fixture) => ({ ...fixture, actual: arbitrateExecutiveNudges(fixture.input) }));
}
