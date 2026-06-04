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
  clearPendingEmailLinkOnboardingHint,
  consumePendingEmailLinkOnboardingHint,
  clearLocalTaskTimerOnboardingNewUserHint,
  hasIncompleteTaskTimerOnboardingPreferences,
  normalizeTaskTimerOnboardingState,
  readLocalTaskTimerOnboardingNewUserHint,
  saveTaskTimerOnboardingState,
  shouldAutoOpenTaskTimerOnboarding,
  taskTimerOnboardingPendingEmailLinkStorageKey,
  taskTimerOnboardingNewUserHintStorageKey,
  taskTimerOnboardingStorageKey,
  writePendingEmailLinkOnboardingHint,
  writeLocalTaskTimerOnboardingNewUserHint,
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

  it("auto-opens for a new email-link user hint even when preference presence is not ready", () => {
    expect(
      shouldAutoOpenTaskTimerOnboarding({
        uid: "uid-1",
        username: "user_1",
        state: null,
        preferencePresence: null,
        newUserHint: true,
      })
    ).toBe(true);
  });

  it("does not auto-open from a new-user hint after onboarding is completed", () => {
    expect(
      shouldAutoOpenTaskTimerOnboarding({
        uid: "uid-1",
        username: "user_1",
        state: { onboardingVersion: 1, onboardingStatus: "completed", onboardingCompletedAtMs: 1000 },
        preferencePresence: null,
        newUserHint: true,
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
      optimalProductivityDays: [],
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
  it("clears the email-link new-user hint after saving onboarding state", async () => {
    writeLocalTaskTimerOnboardingNewUserHint("uid-1");
    writePendingEmailLinkOnboardingHint();

    await saveTaskTimerOnboardingState("uid-1", {
      onboardingStatus: "dismissed",
    });

    expect(readLocalTaskTimerOnboardingNewUserHint("uid-1")).toBe(false);
    expect(window.localStorage.getItem(taskTimerOnboardingNewUserHintStorageKey("uid-1"))).toBeNull();
    expect(window.localStorage.getItem(taskTimerOnboardingPendingEmailLinkStorageKey())).toBeNull();
  });

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

describe("TaskTimer onboarding new-user hint storage", () => {
  it("stores and clears the per-user new-user hint", () => {
    expect(readLocalTaskTimerOnboardingNewUserHint("uid-1")).toBe(false);

    writeLocalTaskTimerOnboardingNewUserHint("uid-1");

    expect(readLocalTaskTimerOnboardingNewUserHint("uid-1")).toBe(true);
    expect(window.localStorage.getItem(taskTimerOnboardingNewUserHintStorageKey("uid-1"))).toBe("true");

    clearLocalTaskTimerOnboardingNewUserHint("uid-1");

    expect(readLocalTaskTimerOnboardingNewUserHint("uid-1")).toBe(false);
  });

  it("promotes a pending email-link hint to the signed-in user", () => {
    writePendingEmailLinkOnboardingHint();

    expect(consumePendingEmailLinkOnboardingHint("uid-1")).toBe(true);

    expect(readLocalTaskTimerOnboardingNewUserHint("uid-1")).toBe(true);
    expect(window.localStorage.getItem(taskTimerOnboardingPendingEmailLinkStorageKey())).toBeNull();
  });

  it("clears a pending email-link hint without a signed-in user", () => {
    writePendingEmailLinkOnboardingHint();

    clearPendingEmailLinkOnboardingHint();

    expect(window.localStorage.getItem(taskTimerOnboardingPendingEmailLinkStorageKey())).toBeNull();
  });
});
