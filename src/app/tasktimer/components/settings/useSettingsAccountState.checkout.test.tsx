// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSettingsAccountState } from "./useSettingsAccountState";
import CheckoutPlanStatus from "./CheckoutPlanStatus";
import { getErrorMessage, handleDeleteAccountFlow } from "./settingsAccountService";
import { readTaskTimerPlanFromStorage, TASKTIMER_PLAN_CHANGED_EVENT } from "../../lib/entitlements";

const mocks = vi.hoisted(() => ({
  user: { uid: "user-1", email: "test@example.com", providerData: [] },
  authListeners: new Set<(user: unknown) => void>(),
  loadPlan: vi.fn(),
  renewal: vi.fn(async () => 1800000000000),
  syncPlan: vi.fn(async () => "free"),
}));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, callback: (user: unknown) => void) => {
  mocks.authListeners.add(callback);
  callback(mocks.user);
  return () => mocks.authListeners.delete(callback);
} }));
vi.mock("@/lib/firebaseClient", () => ({ getFirebaseAuthClient: () => ({ currentUser: mocks.user }) }));
vi.mock("@/lib/firebaseTelemetry", () => ({ recordNonFatal: vi.fn() }));
vi.mock("@/app/tasktimer/lib/cloudStore", () => ({ loadUserRootPlan: mocks.loadPlan, loadUserSubscriptionRenewalAtMs: mocks.renewal }));
vi.mock("@/app/tasktimer/lib/planFunctions", () => ({ syncCurrentUserPlanCache: mocks.syncPlan }));
vi.mock("@/app/tasktimer/lib/friendsStore", () => ({ syncOwnFriendshipProfile: vi.fn() }));
vi.mock("@/app/tasktimer/lib/accountProfileStorage", () => ({ notifyAccountProfileUpdated: vi.fn() }));
vi.mock("@/app/tasktimer/lib/apiClient", () => ({ getApiUrl: (path: string) => path }));
vi.mock("./settingsAccountService", () => ({
  loadClaimedUsername: vi.fn(async () => "tester"), saveUserDocPatch: vi.fn(async () => {}),
  getErrorMessage: vi.fn(), handleDeleteAccountFlow: vi.fn(), updateAliasFlow: vi.fn(),
}));
vi.mock("./useSharedProfileSessionActions", () => ({ useSharedProfileSessionActions: () => ({}) }));

let account: ReturnType<typeof useSettingsAccountState>["account"];
function Harness() {
  const value = useSettingsAccountState({ nativeCheckoutReturnPath: "/account" }).account;
  useEffect(() => { account = value; });
  return <><span>{value.authPlan}</span><CheckoutPlanStatus account={value} /></>;
}
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.user.uid = "user-1";
  mocks.authListeners.clear();
  mocks.loadPlan.mockResolvedValue("free");
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  window.history.replaceState({}, "", "/account");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function success() {
  await act(async () => {
    window.history.replaceState({}, "", "/account?checkout=success&session_id=cs_1");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

it("dismisses the deletion confirmation so a failed request's error is visible", async () => {
  const error = new Error("Could not delete your cloud data.");
  vi.mocked(handleDeleteAccountFlow).mockRejectedValueOnce(error);
  vi.mocked(getErrorMessage).mockReturnValueOnce(error.message);
  await act(async () => root.render(<Harness />));
  await act(async () => account.setShowDeleteAccountConfirm(true));
  await act(async () => account.onDeleteAccount());
  expect(handleDeleteAccountFlow).toHaveBeenCalledWith(mocks.user);
  expect(account.showDeleteAccountConfirm).toBe(false);
  expect(account.authError).toBe(error.message);
  expect(account.authBusy).toBe(false);
  expect(account.authStatus).toBe("");
});

it.each(["plus_monthly", "plus_yearly"])("refreshes a delayed %s Plan and shared entitlement cache without blocking the profile", async (plan) => {
  await act(async () => root.render(<Harness />));
  const changed = vi.fn();
  window.addEventListener(TASKTIMER_PLAN_CHANGED_EVENT, changed);
  await success();
  expect(account.checkoutPlanStatus).toBe("updating");
  expect(account.authPlanStatus).toBe("confirmed");
  expect(container.textContent).toContain("Updating plan...");
  expect(mocks.loadPlan).toHaveBeenLastCalledWith("user-1", { serverOnly: true });
  const syncCalls = mocks.syncPlan.mock.calls.length;
  mocks.loadPlan.mockResolvedValue(plan);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(account.authPlan).toBe(plan);
  expect(account.authPlanRenewalAtMs).toBe(1800000000000);
  expect(account.checkoutPlanStatus).toBe("idle");
  expect(readTaskTimerPlanFromStorage()).toBe(plan);
  expect(changed).toHaveBeenCalled();
  expect(mocks.syncPlan).toHaveBeenCalledTimes(syncCalls);
  window.removeEventListener(TASKTIMER_PLAN_CHANGED_EVENT, changed);
});

it("handles a cold success return, times out offline, and retries from the Plan row", async () => {
  window.history.replaceState({}, "", "/account?checkout=success");
  await act(async () => root.render(<Harness />));
  expect(account.checkoutPlanStatus).toBe("updating");
  mocks.loadPlan.mockRejectedValue(new Error("offline"));
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(account.authPlan).toBe("free");
  expect(account.checkoutPlanStatus).toBe("pending");
  expect(container.textContent).toContain("Plan update pending.");
  mocks.loadPlan.mockResolvedValue("plus_monthly");
  await act(async () => container.querySelector("button")?.click());
  expect(account.authPlan).toBe("plus_monthly");
  expect(account.checkoutPlanStatus).toBe("idle");
});

it("does not refresh checkout for a different account or accept the old account's late result", async () => {
  await act(async () => root.render(<Harness />));
  let resolve!: (plan: string) => void;
  mocks.loadPlan.mockImplementation((_uid, options) => options?.serverOnly
    ? new Promise((done) => { resolve = done; }) : Promise.resolve("free"));
  await success();
  await act(async () => {
    mocks.user = { ...mocks.user, uid: "user-2" };
    for (const callback of mocks.authListeners) callback(mocks.user);
  });
  await act(async () => { resolve("plus_yearly"); await vi.advanceTimersByTimeAsync(30000); });
  expect(account.authPlan).toBe("free");
  expect(account.checkoutPlanStatus).toBe("idle");
  expect(mocks.loadPlan).not.toHaveBeenCalledWith("user-2", { serverOnly: true });
});
