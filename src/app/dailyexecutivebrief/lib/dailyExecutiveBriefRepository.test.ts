import { describe, expect, it, vi } from "vitest";

import { createFirestoreDailyExecutiveBriefRepository } from "./dailyExecutiveBriefRepository";

const row = {
  schemaVersion: 1,
  date: "2026-08-07",
  status: "READY",
  plan: {
    version: "daily-executive-brief-planning-v1",
    todayDate: "2026-08-07",
    plannedMinutes: 100,
    completedMinutes: 0,
    remainingMinutes: 100,
    realisticWorkloadRange: { minMinutes: 45, maxMinutes: 60 },
    capacityMinutes: 60,
    capacitySource: "PRODUCT_DEFAULT",
    planHealth: "SIGNIFICANTLY_OVERLOADED",
    deadlineRisk: "NONE",
    reasonCodes: [],
    unknownDurationTaskCount: 0,
    activeTaskCount: 1,
    adjustments: [{ adjustmentId: "MOVE%3Atask-1", taskId: "task-1", type: "MOVE", status: "ACTIVE", reasonCodes: ["FLEXIBLE_WORK_AVAILABLE"], explanation: "Move it later." }],
  },
  nextBestAction: null,
  clarificationTaskIds: [],
  summary: "Review the plan.",
  sourceVersion: "a".repeat(64),
  generatedAt: "2026-08-07T09:00:00.000Z",
  expiresAt: "2026-08-07T15:00:00.000Z",
};

describe("Firestore Daily Executive Brief repository", () => {
  it("dismisses an owned active adjustment idempotently without touching task state", async () => {
    const set = vi.fn();
    const ref = { get: vi.fn(), set };
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => ({ collection: vi.fn(() => ({ doc: vi.fn(() => ref) })) })) })),
      runTransaction: vi.fn(async (callback: (transaction: { get: typeof ref.get; set: typeof set }) => Promise<unknown>) => callback({ get: ref.get, set })),
    };
    ref.get.mockResolvedValue({ exists: true, data: () => row });
    const repository = createFirestoreDailyExecutiveBriefRepository(db as never);
    const result = await repository.dismissAdjustment({ uid: "uid-1", date: "2026-08-07", adjustmentId: "MOVE%3Atask-1", nowMs: Date.parse("2026-08-07T10:00:00Z") });
    expect(result).toBe("dismissed");
    expect(set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ plan: expect.objectContaining({ adjustments: [expect.objectContaining({ status: "DISMISSED" })] }) }));

    ref.get.mockResolvedValue({ exists: true, data: () => ({ ...row, plan: { ...row.plan, adjustments: [{ ...row.plan.adjustments[0], status: "DISMISSED" }] } }) });
    expect(await repository.dismissAdjustment({ uid: "uid-1", date: "2026-08-07", adjustmentId: "MOVE%3Atask-1", nowMs: Date.parse("2026-08-07T10:00:00Z") })).toBe("idempotent");
  });

  it("rejects expired adjustments without writing", async () => {
    const set = vi.fn();
    const ref = { get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ ...row, expiresAt: "2026-08-07T09:00:00.000Z" }) }), set };
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => ({ collection: vi.fn(() => ({ doc: vi.fn(() => ref) })) })) })),
      runTransaction: vi.fn(async (callback: (transaction: { get: typeof ref.get; set: typeof set }) => Promise<unknown>) => callback({ get: ref.get, set })),
    };
    const result = await createFirestoreDailyExecutiveBriefRepository(db as never).dismissAdjustment({ uid: "uid-1", date: "2026-08-07", adjustmentId: "MOVE%3Atask-1", nowMs: Date.parse("2026-08-07T10:00:00Z") });
    expect(result).toBe("expired");
    expect(set).not.toHaveBeenCalled();
  });
});
