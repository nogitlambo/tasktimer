import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebaseClient", () => ({
  getFirebaseAuthClient: () => null,
}));

import {
  TASKTIMER_PLAN_STORAGE_KEY,
  getTaskTimerEntitlements,
  hasTaskTimerEntitlement,
  readTaskTimerPlanCacheFromStorage,
  readTaskTimerPlanFromStorage,
  type TaskTimerEntitlement,
} from "./entitlements";

type StorageMap = Map<string, string>;

function createLocalStorageMock(store: StorageMap) {
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe("task timer entitlements", () => {
  let store: StorageMap;

  beforeEach(() => {
    store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: createLocalStorageMock(store),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the stored free plan intact while reading back an effective pro plan", () => {
    store.set(
      TASKTIMER_PLAN_STORAGE_KEY,
      JSON.stringify({
        uid: "user-1",
        plan: "free",
      })
    );

    expect(readTaskTimerPlanCacheFromStorage()).toEqual({
      uid: "user-1",
      plan: "free",
    });
    expect(readTaskTimerPlanFromStorage()).toBe("pro");
  });

  it("continues to read a stored pro plan as pro", () => {
    store.set(
      TASKTIMER_PLAN_STORAGE_KEY,
      JSON.stringify({
        uid: "user-1",
        plan: "pro",
      })
    );

    expect(readTaskTimerPlanFromStorage()).toBe("pro");
  });

  it("grants all app entitlements to free users during the temporary override", () => {
    const entitlements: TaskTimerEntitlement[] = [
      "advancedHistory",
      "advancedInsights",
      "advancedTaskConfig",
      "advancedBackup",
      "socialFeatures",
      "archieAi",
    ];

    const freeEntitlements = getTaskTimerEntitlements("free");
    expect(Object.values(freeEntitlements).every(Boolean)).toBe(true);
    entitlements.forEach((entitlement) => {
      expect(hasTaskTimerEntitlement("free", entitlement)).toBe(true);
    });
  });
});
