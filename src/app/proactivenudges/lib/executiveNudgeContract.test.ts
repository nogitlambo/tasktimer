import { describe, expect, it } from "vitest";

import {
  ExecutiveNudgeCandidateSchema,
  ExecutiveNudgeDeliverySchema,
  createDefaultExecutiveNudgePreferences,
} from "./executiveNudgeContract";

describe("Executive Nudge contract", () => {
  it("accepts a bounded actionable candidate without retaining task content", () => {
    const candidate = ExecutiveNudgeCandidateSchema.parse({
      id: "candidate-1",
      userId: "user-1",
      type: "START_OPPORTUNITY",
      sourceFeature: "NEXT_BEST_ACTION",
      sourceEntityId: "recommendation-1",
      sourceEntityVersion: "version-1",
      priority: "HIGH",
      urgency: 80,
      usefulness: 70,
      interruptionCost: 20,
      reasonCodes: ["CAPACITY_AVAILABLE"],
      action: { type: "START_TASK", taskId: "task-1" },
      createdAt: "2026-08-11T00:00:00.000Z",
      expiresAt: "2026-08-11T00:15:00.000Z",
      taskTitle: "Sensitive task title",
    });

    expect(candidate).toMatchObject({
      type: "START_OPPORTUNITY",
      action: { type: "START_TASK", taskId: "task-1" },
    });
    expect(candidate).not.toHaveProperty("taskTitle");
  });

  it("creates quiet-by-default preferences with explicit nudge-type controls", () => {
    expect(createDefaultExecutiveNudgePreferences("user-1", 0)).toMatchObject({
      userId: "user-1",
      enabled: false,
      paused: false,
      quietHours: { startTime: "22:00", endTime: "08:00" },
      maximumPushNudgesPerDay: 3,
      typeEnabled: {
        START_OPPORTUNITY: true,
        FOCUS_WINDOW_START: true,
        DEADLINE_RISK: true,
        PLAN_OVERLOAD: true,
        RECOVERY_SUGGESTED: true,
        FIRST_ACTION_AVAILABLE: true,
        RESUME_TASK: true,
        PLAN_CHANGED: true,
      },
    });
  });

  it("records delivery lifecycle metadata without retaining notification content", () => {
    const delivery = ExecutiveNudgeDeliverySchema.parse({
      id: "delivery-1",
      userId: "user-1",
      candidateId: "candidate-1",
      candidateType: "DEADLINE_RISK",
      sourceFeature: "DAILY_EXECUTIVE_BRIEF",
      sourceEntityId: "brief-1",
      sourceEntityVersion: "brief-v1",
      channel: "ANDROID_PUSH",
      reasonCodes: ["DEADLINE_RISK"],
      status: "DELIVERED",
      action: { type: "OPEN_EXECUTIVE" },
      createdAt: "2026-08-11T00:00:00.000Z",
      deliveredAt: "2026-08-11T00:00:01.000Z",
      taskTitle: "Sensitive task title",
      notificationBody: "Sensitive notification body",
    });

    expect(delivery).toMatchObject({
      candidateType: "DEADLINE_RISK",
      channel: "ANDROID_PUSH",
      status: "DELIVERED",
    });
    expect(delivery).not.toHaveProperty("taskTitle");
    expect(delivery).not.toHaveProperty("notificationBody");
  });
});
