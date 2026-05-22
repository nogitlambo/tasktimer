import { beforeEach, describe, expect, it, vi } from "vitest";

const firebaseMocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  doc: vi.fn((db: unknown, ...path: string[]) => ({ db, path })),
}));

vi.mock("firebase/firestore", () => ({
  doc: firebaseMocks.doc,
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  setDoc: firebaseMocks.setDoc,
}));

vi.mock("@/lib/firebaseFirestoreClient", () => ({
  getFirebaseFirestoreClient: vi.fn(() => ({ app: "mock-firestore" })),
}));

import {
  buildTaskTimerOnboardingPreferenceDraft,
  hasIncompleteTaskTimerOnboardingPreferences,
  normalizeTaskTimerOnboardingState,
  saveTaskTimerOnboardingState,
  shouldAutoOpenTaskTimerOnboarding,
  taskTimerOnboardingStorageKey,
} from "./onboarding";

const completePresence = {
  weekStarting: true,
  optimalProductivityStartTime: true,
  optimalProductivityEndTime: true,
  optimalProductivityDays: true,
};

beforeEach(() => {
  firebaseMocks.setDoc.mockReset();
  firebaseMocks.doc.mockClear();
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
    },
  });
});

describe("TaskTimer onboarding gating", () => {
  it("does not auto-open for completed onboarding", () => {
    expect(
      shouldAutoOpenTaskTimerOnboarding({
        uid: "uid-1",
        username: "",
        state: { onboardingVersion: 1, onboardingStatus: "completed", onboardingCompletedAtMs: 1000 },
        preferencePresence: {
          weekStarting: false,
          optimalProductivityStartTime: false,
          optimalProductivityEndTime: false,
          optimalProductivityDays: false,
        },
      })
    ).toBe(false);
  });

  it("does not auto-open for dismissed onboarding", () => {
    expect(
      shouldAutoOpenTaskTimerOnboarding({
        uid: "uid-1",
        username: "",
        state: { onboardingVersion: 1, onboardingStatus: "dismissed", onboardingDismissedAtMs: 1000 },
        preferencePresence: completePresence,
      })
    ).toBe(false);
  });

  it("auto-opens when the username is missing", () => {
    expect(
      shouldAutoOpenTaskTimerOnboarding({
        uid: "uid-1",
        username: "",
        state: null,
        preferencePresence: completePresence,
      })
    ).toBe(true);
  });

  it("auto-opens when productivity preference fields are missing", () => {
    expect(
      shouldAutoOpenTaskTimerOnboarding({
        uid: "uid-1",
        username: "user_1",
        state: null,
        preferencePresence: {
          ...completePresence,
          optimalProductivityDays: false,
        },
      })
    ).toBe(true);
  });

  it("does not auto-open for a complete profile", () => {
    expect(
      shouldAutoOpenTaskTimerOnboarding({
        uid: "uid-1",
        username: "user_1",
        state: null,
        preferencePresence: completePresence,
      })
    ).toBe(false);
  });

  it("treats null preference presence as not ready instead of incomplete", () => {
    expect(hasIncompleteTaskTimerOnboardingPreferences(null)).toBe(false);
    expect(
      shouldAutoOpenTaskTimerOnboarding({
        uid: "uid-1",
        username: "user_1",
        state: null,
        preferencePresence: null,
      })
    ).toBe(false);
  });
});

describe("normalizeTaskTimerOnboardingState", () => {
  it("normalizes valid local or remote state", () => {
    expect(
      normalizeTaskTimerOnboardingState({
        onboardingVersion: 99,
        onboardingStatus: "completed",
        onboardingCompletedAtMs: 1234.8,
        onboardingDismissedAtMs: -1,
      })
    ).toEqual({
      onboardingVersion: 1,
      onboardingStatus: "completed",
      onboardingCompletedAtMs: 1234,
      onboardingDismissedAtMs: undefined,
      onboardingUsernameConfirmedAtMs: undefined,
    });
  });

  it("rejects unknown statuses", () => {
    expect(normalizeTaskTimerOnboardingState({ onboardingStatus: "later" })).toBeNull();
  });
});

describe("buildTaskTimerOnboardingPreferenceDraft", () => {
  it("seeds onboarding defaults for missing preference fields", () => {
    expect(
      buildTaskTimerOnboardingPreferenceDraft(
        {
          weekStarting: "sun",
          optimalProductivityStartTime: "00:00",
          optimalProductivityEndTime: "23:59",
          optimalProductivityDays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
        },
        {
          weekStarting: false,
          optimalProductivityStartTime: false,
          optimalProductivityEndTime: false,
          optimalProductivityDays: false,
        }
      )
    ).toEqual({
      weekStarting: "mon",
      optimalProductivityStartTime: "09:00",
      optimalProductivityEndTime: "17:00",
      optimalProductivityDays: ["mon", "tue", "wed", "thu", "fri"],
    });
  });

  it("preserves present preference fields", () => {
    expect(
      buildTaskTimerOnboardingPreferenceDraft(
        {
          weekStarting: "sun",
          optimalProductivityStartTime: "07:30",
          optimalProductivityEndTime: "15:45",
          optimalProductivityDays: ["sun", "sat"],
        },
        completePresence
      )
    ).toEqual({
      weekStarting: "sun",
      optimalProductivityStartTime: "07:30",
      optimalProductivityEndTime: "15:45",
      optimalProductivityDays: ["sun", "sat"],
    });
  });
});

describe("saveTaskTimerOnboardingState", () => {
  it("does not block completion when the account-state cloud write is denied", async () => {
    firebaseMocks.setDoc.mockRejectedValueOnce({ code: "permission-denied" });

    const result = await saveTaskTimerOnboardingState("uid-1", {
      onboardingStatus: "completed",
      onboardingUsernameConfirmedAtMs: 1234,
    });

    expect(result.onboardingStatus).toBe("completed");
    expect(result.onboardingCompletedAtMs).toBeGreaterThan(0);
    expect(window.localStorage.getItem(taskTimerOnboardingStorageKey("uid-1"))).toContain('"onboardingStatus":"completed"');
    expect(firebaseMocks.setDoc).toHaveBeenCalledOnce();
  });
});
