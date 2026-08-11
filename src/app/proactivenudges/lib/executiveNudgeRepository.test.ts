import { describe, expect, it, vi } from "vitest";

import { createFirestoreExecutiveNudgeRepository } from "./executiveNudgeRepository";

function createDb() {
  const preferenceGet = vi.fn().mockResolvedValue({ exists: false, data: () => undefined });
  const preferenceSet = vi.fn().mockResolvedValue(undefined);
  const preferenceDoc = vi.fn(() => ({ get: preferenceGet, set: preferenceSet }));
  const preferenceCollection = vi.fn(() => ({ doc: preferenceDoc }));
  const userDoc = vi.fn(() => ({ collection: preferenceCollection }));
  const db = { collection: vi.fn(() => ({ doc: userDoc })) };
  return { db, preferenceGet, preferenceSet, preferenceDoc, preferenceCollection, userDoc };
}

describe("Executive Nudge repository", () => {
  it("creates the single user-scoped preference document with quiet defaults", async () => {
    const mock = createDb();
    const repository = createFirestoreExecutiveNudgeRepository(mock.db as never, () => 0);

    const preferences = await repository.loadOrCreatePreferences("user-1");

    expect(preferences).toMatchObject({ userId: "user-1", enabled: false, maximumPushNudgesPerDay: 3 });
    expect(mock.db.collection).toHaveBeenCalledWith("users");
    expect(mock.userDoc).toHaveBeenCalledWith("user-1");
    expect(mock.preferenceCollection).toHaveBeenCalledWith("nudgePreferences");
    expect(mock.preferenceDoc).toHaveBeenCalledWith("current");
    expect(mock.preferenceSet).toHaveBeenCalledTimes(1);
  });

  it("writes delivery history only below the owning user", async () => {
    const deliverySet = vi.fn().mockResolvedValue(undefined);
    const deliveryDoc = vi.fn(() => ({ set: deliverySet }));
    const deliveryCollection = vi.fn((name: string) => {
      void name;
      return { doc: deliveryDoc };
    });
    const userDoc = vi.fn(() => ({
      collection: (name: string) => name === "nudgeDeliveries"
        ? deliveryCollection(name)
        : { doc: vi.fn() },
    }));
    const db = { collection: vi.fn(() => ({ doc: userDoc })) };
    const repository = createFirestoreExecutiveNudgeRepository(db as never, () => 0);

    await repository.saveDelivery("user-1", {
      id: "delivery-1",
      userId: "user-1",
      candidateId: "candidate-1",
      candidateType: "DEADLINE_RISK",
      sourceFeature: "DAILY_EXECUTIVE_BRIEF",
      sourceEntityId: "brief-1",
      sourceEntityVersion: "brief-v1",
      channel: "IN_APP",
      reasonCodes: ["DEADLINE_RISK"],
      status: "DELIVERED",
      action: { type: "OPEN_EXECUTIVE" },
      createdAt: "2026-08-11T00:00:00.000Z",
      deliveredAt: "2026-08-11T00:00:01.000Z",
      taskTitle: "Sensitive task title",
      notificationBody: "Sensitive notification body",
    } as never);

    expect(userDoc).toHaveBeenCalledWith("user-1");
    expect(deliveryCollection).toHaveBeenCalledWith("nudgeDeliveries");
    expect(deliveryDoc).toHaveBeenCalledWith("delivery-1");
    expect(deliverySet).toHaveBeenCalledTimes(1);
    expect(deliverySet).toHaveBeenCalledWith(expect.not.objectContaining({ taskTitle: expect.anything(), notificationBody: expect.anything() }));
  });

  it("rejects cross-user delivery writes before touching Firestore", async () => {
    const mock = createDb();
    const repository = createFirestoreExecutiveNudgeRepository(mock.db as never, () => 0);

    await expect(repository.saveDelivery("user-1", {
      id: "delivery-1",
      userId: "user-2",
      candidateId: "candidate-1",
      candidateType: "DEADLINE_RISK",
      sourceFeature: "DAILY_EXECUTIVE_BRIEF",
      channel: "IN_APP",
      reasonCodes: ["DEADLINE_RISK"],
      status: "DELIVERED",
      action: { type: "OPEN_EXECUTIVE" },
      createdAt: "2026-08-11T00:00:00.000Z",
    })).rejects.toMatchObject({ code: "executive-nudge/ownership" });

    expect(mock.db.collection).not.toHaveBeenCalled();
  });
});
