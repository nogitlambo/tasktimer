import { beforeEach, describe, expect, it, vi } from "vitest";
import { signOut } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  authState: {
    currentUser: null as { isAnonymous?: boolean } | null,
  },
  workspaceRepository: {
    waitForPendingTaskSync: vi.fn(() => Promise.resolve()),
    clearScopedState: vi.fn(),
  },
}));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: vi.fn(),
  deleteUser: vi.fn(),
  getRedirectResult: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  reauthenticateWithRedirect: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/firebaseClient", () => ({
  getFirebaseAuthClient: () => mocks.authState,
  isNativeOrFileRuntime: () => false,
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

import { handleSignOutFlow } from "./settingsAccountService";

describe("handleSignOutFlow", () => {
  beforeEach(() => {
    mocks.authState.currentUser = null;
    mocks.workspaceRepository.waitForPendingTaskSync.mockClear();
    mocks.workspaceRepository.clearScopedState.mockClear();
    vi.mocked(signOut).mockClear();
    vi.stubGlobal("window", {
      location: { assign: vi.fn() },
      sessionStorage: { setItem: vi.fn() },
    });
  });

  it("blocks anonymous guest sign-out so the guest account stays recoverable", async () => {
    mocks.authState.currentUser = { isAnonymous: true };

    await expect(handleSignOutFlow()).rejects.toThrow("Sign in with email or Google before signing out");

    expect(signOut).not.toHaveBeenCalled();
    expect(mocks.workspaceRepository.clearScopedState).not.toHaveBeenCalled();
  });

  it("keeps normal account sign-out behavior", async () => {
    mocks.authState.currentUser = { isAnonymous: false };

    await handleSignOutFlow();

    expect(mocks.workspaceRepository.waitForPendingTaskSync).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(mocks.workspaceRepository.clearScopedState).toHaveBeenCalledTimes(1);
    expect(window.location.assign).toHaveBeenCalledWith("/?signedOut=1");
  });
});
