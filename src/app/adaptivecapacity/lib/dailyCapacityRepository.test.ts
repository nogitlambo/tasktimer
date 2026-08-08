import { describe, expect, it, vi } from "vitest";

import { createFirestoreDailyCapacityRepository } from "./dailyCapacityRepository";

describe("Firestore Daily Capacity repository", () => {
  it("loads only aggregate completion minutes for today", async () => {
    const historyGet = vi.fn().mockResolvedValue({
      docs: [
        { data: () => ({ ts: Date.parse("2026-08-07T08:00:00.000Z"), ms: 20 * 60_000, name: "Private task", note: "Private note" }) },
        { data: () => ({ ts: Date.parse("2026-08-06T08:00:00.000Z"), ms: 10 * 60_000, name: "Another task" }) },
      ],
    });
    const aggregateGet = vi.fn().mockResolvedValue({ exists: false, data: () => null });
    const aggregateSet = vi.fn().mockResolvedValue(undefined);
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          collection: vi.fn((name: string) => name === "historyEntries"
            ? { get: historyGet }
            : { doc: vi.fn(() => ({ get: aggregateGet, set: aggregateSet })) }),
        })),
      })),
    };

    const context = await createFirestoreDailyCapacityRepository(db as never).loadSourceContext({
      uid: "uid-1",
      localDate: "2026-08-07",
      timezone: "UTC",
    });

    expect(context.completedMinutesToday).toBe(20);
    expect(context.availableMinutesCeiling).toBeNull();
    expect(context.sourceVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(context.sourceVersion).not.toContain("Private task");
    expect(context.sourceVersion).not.toContain("Private note");
    expect(aggregateSet).toHaveBeenCalled();
  });

  it("derives a trusted focus-window ceiling and includes preference changes in the source version", async () => {
    const historyGet = vi.fn().mockResolvedValue({ docs: [] });
    const aggregateGet = vi.fn().mockResolvedValue({ exists: false, data: () => null });
    const aggregateSet = vi.fn().mockResolvedValue(undefined);
    const preferencesGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({ optimalProductivityStartTime: "09:00", optimalProductivityEndTime: "10:00", optimalProductivityDays: ["fri"] }) });
    const user = {
      collection: vi.fn((name: string) => {
        if (name === "historyEntries") return { get: historyGet };
        if (name === "behaviourFeatures") return { doc: vi.fn(() => ({ get: aggregateGet, set: aggregateSet })) };
        return { doc: vi.fn(() => ({ get: preferencesGet })) };
      }),
    };
    const db = { collection: vi.fn(() => ({ doc: vi.fn(() => user) })) };

    const repository = createFirestoreDailyCapacityRepository(db as never);
    const first = await repository.loadSourceContext({ uid: "uid-1", localDate: "2026-08-07", timezone: "UTC", nowMs: Date.parse("2026-08-07T09:40:00.000Z") });
    preferencesGet.mockResolvedValue({ exists: true, data: () => ({ optimalProductivityStartTime: "09:00", optimalProductivityEndTime: "11:00", optimalProductivityDays: ["fri"] }) });
    const second = await repository.loadSourceContext({ uid: "uid-1", localDate: "2026-08-07", timezone: "UTC", nowMs: Date.parse("2026-08-07T09:40:00.000Z") });

    expect(first.availableMinutesCeiling).toBe(20);
    expect(second.availableMinutesCeiling).toBe(80);
    expect(second.sourceVersion).not.toBe(first.sourceVersion);
  });
});
