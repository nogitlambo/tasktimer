import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleAuthProvider, deleteUser, reauthenticateWithPopup, reauthenticateWithRedirect, signOut } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  authState: {
    currentUser: null as { isAnonymous?: boolean } | null,
  },
  workspaceRepository: {
    waitForPendingTaskSync: vi.fn(() => Promise.resolve()),
    flushPendingCloudWrites: vi.fn(() => Promise.resolve()),
    hasPendingTaskOrHistorySync: vi.fn(() => false),
    hasPendingPreferenceSync: vi.fn(() => false),
    clearScopedState: vi.fn(),
  },
}));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: vi.fn(),
  deleteUser: vi.fn(() => Promise.resolve()),
  getRedirectResult: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  reauthenticateWithRedirect: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/firebaseClient", () => ({
  getFirebaseAuthClient: () => mocks.authState,
}));

vi.mock("@/lib/firebaseFirestoreClient", () => ({
  getFirebaseFirestoreClient: () => null,
}));

vi.mock("@/app/tasktimer/lib/cloudStore", () => ({
  saveUserRootPatch: vi.fn(),
}));

vi.mock("@/app/tasktimer/lib/workspaceRepository", () => ({
  createTaskTimerWorkspaceRepository: () => mocks.workspaceRepository,
}));

vi.mock("@/app/tasktimer/lib/usernameClaim", () => ({
  claimUsernameClient: vi.fn(),
}));

vi.mock("@/app/tasktimer/lib/routeHref", () => ({
  resolveTaskTimerRouteHref: (path: string) => path,
}));

vi.mock("@/app/tasktimer/lib/apiClient", () => ({
  getApiUrl: (path: string) => `https://tasklaunch.app${path}`,
}));

import { handleDeleteAccountFlow, handleSignOutFlow, syncLocalProfileDataToCloud } from "./settingsAccountService";
import { ACCOUNT_DELETION_REDIRECT_INTENT_KEY } from "../../lib/accountDeletionRedirectIntent";

function resetWorkspaceRepositoryMocks() {
  mocks.workspaceRepository.waitForPendingTaskSync.mockClear();
  mocks.workspaceRepository.flushPendingCloudWrites.mockClear();
  mocks.workspaceRepository.hasPendingTaskOrHistorySync.mockClear();
  mocks.workspaceRepository.hasPendingTaskOrHistorySync.mockReturnValue(false);
  mocks.workspaceRepository.hasPendingPreferenceSync.mockClear();
  mocks.workspaceRepository.hasPendingPreferenceSync.mockReturnValue(false);
  mocks.workspaceRepository.clearScopedState.mockClear();
}

describe("handleSignOutFlow", () => {
  beforeEach(() => {
    const sessionValues = new Map<string, string>();
    mocks.authState.currentUser = null;
    resetWorkspaceRepositoryMocks();
    vi.mocked(GoogleAuthProvider).mockClear();
    vi.mocked(deleteUser).mockClear();
    vi.mocked(reauthenticateWithPopup).mockClear();
    vi.mocked(reauthenticateWithRedirect).mockClear();
    vi.mocked(signOut).mockClear();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
    vi.stubGlobal("window", {
      location: { assign: vi.fn() },
      sessionStorage: {
        getItem: vi.fn((key: string) => sessionValues.get(key) || null),
        removeItem: vi.fn((key: string) => {
          sessionValues.delete(key);
        }),
        setItem: vi.fn((key: string, value: string) => {
          sessionValues.set(key, value);
        }),
      },
    });
  });

  it("signs out anonymous sessions and clears local workspace state", async () => {
    mocks.authState.currentUser = { isAnonymous: true };

    await handleSignOutFlow();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(mocks.workspaceRepository.clearScopedState).toHaveBeenCalledTimes(1);
    expect(window.location.assign).toHaveBeenCalledWith("/login");
  });

  it("keeps normal account sign-out behavior", async () => {
    mocks.authState.currentUser = { isAnonymous: false };

    await handleSignOutFlow();

    expect(mocks.workspaceRepository.waitForPendingTaskSync).toHaveBeenCalledTimes(1);
    expect(mocks.workspaceRepository.flushPendingCloudWrites).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(mocks.workspaceRepository.clearScopedState).toHaveBeenCalledTimes(1);
    expect(window.location.assign).toHaveBeenCalledWith("/login");
  });

  it("flushes pending cloud writes before signing out so preference changes survive re-auth", async () => {
    mocks.authState.currentUser = { isAnonymous: false };
    const callOrder: string[] = [];
    mocks.workspaceRepository.waitForPendingTaskSync.mockImplementationOnce(async () => {
      callOrder.push("waitForPendingTaskSync");
    });
    mocks.workspaceRepository.flushPendingCloudWrites.mockImplementationOnce(async () => {
      callOrder.push("flushPendingCloudWrites");
    });
    vi.mocked(signOut).mockImplementationOnce(async () => {
      callOrder.push("signOut");
    });

    await handleSignOutFlow();

    expect(callOrder).toEqual(["waitForPendingTaskSync", "flushPendingCloudWrites", "signOut"]);
  });

  it("blocks sign-out when preference sync is still pending after flush", async () => {
    mocks.authState.currentUser = { isAnonymous: false };
    mocks.workspaceRepository.hasPendingPreferenceSync.mockReturnValue(true);

    await expect(handleSignOutFlow()).rejects.toThrow(
      "Could not sign out because your latest local data could not sync to the cloud. Please try Sync again."
    );

    expect(signOut).not.toHaveBeenCalled();
    expect(mocks.workspaceRepository.clearScopedState).not.toHaveBeenCalled();
  });

  it("blocks sign-out when task or history sync is still pending after flush", async () => {
    mocks.authState.currentUser = { isAnonymous: false };
    mocks.workspaceRepository.hasPendingTaskOrHistorySync.mockReturnValue(true);

    await expect(handleSignOutFlow()).rejects.toThrow(
      "Could not sign out because your latest local data could not sync to the cloud. Please try Sync again."
    );

    expect(signOut).not.toHaveBeenCalled();
  });

  it("blocks sign-out with a timeout-specific message when sync does not finish", async () => {
    mocks.authState.currentUser = { isAnonymous: false };
    vi.useFakeTimers();
    mocks.workspaceRepository.flushPendingCloudWrites.mockImplementationOnce(() => new Promise(() => {}));

    const pending = handleSignOutFlow();
    const rejection = expect(pending).rejects.toThrow(
      "Could not sign out because your latest local data could not sync to the cloud before the request timed out. Please try Sync again."
    );
    await vi.advanceTimersByTimeAsync(15000);
    await rejection;
    vi.useRealTimers();
  });

  it("requests server-side account deletion, signs out, clears local workspace state, and returns to landing", async () => {
    const user = {
      uid: "user-123",
      getIdToken: vi.fn(() => Promise.resolve("token-123")),
      providerData: [],
    };

    await handleDeleteAccountFlow(user as never);

    expect(fetch).toHaveBeenCalledWith("https://tasklaunch.app/api/account/retain-subscription-before-delete/", expect.any(Object));
    expect(fetch).toHaveBeenCalledWith("https://tasklaunch.app/api/account/delete-user-data/", expect.any(Object));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(GoogleAuthProvider).not.toHaveBeenCalled();
    expect(reauthenticateWithPopup).not.toHaveBeenCalled();
    expect(reauthenticateWithRedirect).not.toHaveBeenCalled();
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(ACCOUNT_DELETION_REDIRECT_INTENT_KEY, "1");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(mocks.workspaceRepository.clearScopedState).toHaveBeenCalledTimes(1);
    expect(window.location.assign).toHaveBeenCalledWith("/");
  });
});

describe("syncLocalProfileDataToCloud", () => {
  beforeEach(() => {
    mocks.authState.currentUser = { isAnonymous: false };
    resetWorkspaceRepositoryMocks();
  });

  it("waits for pending task sync and flushes cloud writes", async () => {
    const callOrder: string[] = [];
    mocks.workspaceRepository.waitForPendingTaskSync.mockImplementationOnce(async () => {
      callOrder.push("waitForPendingTaskSync");
    });
    mocks.workspaceRepository.flushPendingCloudWrites.mockImplementationOnce(async () => {
      callOrder.push("flushPendingCloudWrites");
    });

    const result = await syncLocalProfileDataToCloud();

    expect(result.checkedAtMs).toBeTypeOf("number");
    expect(callOrder).toEqual(["waitForPendingTaskSync", "flushPendingCloudWrites"]);
  });

  it("reports whether data was pending before the manual sync", async () => {
    mocks.workspaceRepository.hasPendingTaskOrHistorySync.mockImplementationOnce(() => true).mockReturnValue(false);

    const result = await syncLocalProfileDataToCloud();

    expect(result.hadPendingBefore).toBe(true);
  });

  it("succeeds when there was nothing pending before the manual sync", async () => {
    const result = await syncLocalProfileDataToCloud();

    expect(result.hadPendingBefore).toBe(false);
  });

  it("fails when pending local sync state remains after flush", async () => {
    mocks.workspaceRepository.hasPendingPreferenceSync.mockImplementationOnce(() => false).mockReturnValue(true);

    await expect(syncLocalProfileDataToCloud()).rejects.toThrow(
      "Could not sync your latest local data to the cloud. Please try again."
    );
  });

  it("fails with a timeout-specific error when cloud sync does not finish", async () => {
    vi.useFakeTimers();
    mocks.workspaceRepository.flushPendingCloudWrites.mockImplementationOnce(() => new Promise(() => {}));

    const pending = syncLocalProfileDataToCloud();
    const rejection = expect(pending).rejects.toThrow(
      "Could not sync your latest local data to the cloud because the sync timed out. Please try again."
    );
    await vi.advanceTimersByTimeAsync(15000);
    await rejection;
    vi.useRealTimers();
  });
});
