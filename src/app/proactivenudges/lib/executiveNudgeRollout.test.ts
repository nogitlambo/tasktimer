import { describe, expect, it } from "vitest";

import { evaluateExecutiveNudgeRollout, loadExecutiveNudgeRolloutPolicy } from "./executiveNudgeRollout";

describe("Proactive Executive Nudge rollout controls", () => {
  it("fails closed by default and enables only a configured internal cohort", () => {
    const disabled = loadExecutiveNudgeRolloutPolicy({});
    expect(evaluateExecutiveNudgeRollout({ uid: "internal-1", type: "DEADLINE_RISK", policy: disabled })).toMatchObject({
      enabled: false,
      reason: "GLOBAL_DISABLED",
    });

    const policy = loadExecutiveNudgeRolloutPolicy({
      PROACTIVE_EXECUTIVE_NUDGES_ENABLED: "true",
      PROACTIVE_EXECUTIVE_NUDGES_INTERNAL_UIDS: "internal-1",
      PROACTIVE_EXECUTIVE_NUDGES_TYPE_FLAGS: JSON.stringify({
        DEADLINE_RISK: { enabled: true, cohort: "INTERNAL" },
      }),
    });

    expect(evaluateExecutiveNudgeRollout({ uid: "internal-1", type: "DEADLINE_RISK", policy })).toMatchObject({
      enabled: true,
      cohort: "INTERNAL",
    });
    expect(evaluateExecutiveNudgeRollout({ uid: "other-1", type: "DEADLINE_RISK", policy })).toMatchObject({
      enabled: false,
      reason: "COHORT_NOT_ELIGIBLE",
    });
  });

  it("lets a kill switch override malformed or otherwise enabled rollout configuration", () => {
    const policy = loadExecutiveNudgeRolloutPolicy({
      PROACTIVE_EXECUTIVE_NUDGES_ENABLED: "true",
      PROACTIVE_EXECUTIVE_NUDGES_KILL_SWITCH: "true",
      PROACTIVE_EXECUTIVE_NUDGES_TYPE_FLAGS: "not-json",
    });

    expect(evaluateExecutiveNudgeRollout({ uid: "internal-1", type: "DEADLINE_RISK", policy })).toMatchObject({
      enabled: false,
      reason: "KILL_SWITCH",
    });
    expect(policy.types.DEADLINE_RISK.enabled).toBe(false);
  });
});
