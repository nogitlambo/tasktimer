import { describe, expect, it, vi } from "vitest";

import { createDefaultAutomationSettings } from "./trustedAutomationPolicy";
import { createFirestoreAutomationSettingsRepository } from "./trustedAutomationSettingsRepository";

function createDb() {
  const settingsGet = vi.fn().mockResolvedValue({ exists: false, data: () => undefined });
  const settingsSet = vi.fn().mockResolvedValue(undefined);
  const settingsDoc = vi.fn(() => ({ get: settingsGet, set: settingsSet }));
  const settingsCollection = vi.fn(() => ({ doc: settingsDoc }));
  const userDoc = vi.fn(() => ({ collection: settingsCollection }));
  const db = { collection: vi.fn(() => ({ doc: userDoc })) };
  return { db, settingsGet, settingsSet, settingsDoc, settingsCollection, userDoc };
}

describe("Trusted Automation settings repository", () => {
  it("creates the single user-scoped settings document with safe defaults", async () => {
    const mock = createDb();
    const repository = createFirestoreAutomationSettingsRepository(mock.db as never, () => 0);

    const settings = await repository.loadOrCreate("user-1");

    expect(settings).toMatchObject({ userId: "user-1", automationEnabled: false, consentGranted: false });
    expect(mock.db.collection).toHaveBeenCalledWith("users");
    expect(mock.userDoc).toHaveBeenCalledWith("user-1");
    expect(mock.settingsCollection).toHaveBeenCalledWith("automationSettings");
    expect(mock.settingsDoc).toHaveBeenCalledWith("settings");
    expect(mock.settingsSet).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-user settings writes before touching Firestore", async () => {
    const mock = createDb();
    const repository = createFirestoreAutomationSettingsRepository(mock.db as never, () => 0);
    const settings = createDefaultAutomationSettings("another-user", 0);

    await expect(repository.save("user-1", settings)).rejects.toMatchObject({ code: "automation/ownership" });
    expect(mock.settingsSet).not.toHaveBeenCalled();
  });
});
