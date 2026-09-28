// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNativePlusUpsell } from "./useNativePlusUpsell";

const mocks = vi.hoisted(() => ({
  finished: null as null | (() => void),
  remove: vi.fn(async () => {}),
  open: vi.fn(),
  user: { uid: "user-1", getIdToken: vi.fn(async () => "token") },
}));
vi.mock("@capacitor/browser", () => ({ Browser: {
  open: mocks.open,
  addListener: vi.fn(async (_name: string, callback: () => void) => {
    mocks.finished = callback;
    return { remove: mocks.remove };
  }),
} }));
vi.mock("@/lib/firebaseClient", () => ({ getFirebaseAuthClient: () => ({ currentUser: mocks.user }) }));
vi.mock("@/lib/firebaseTelemetry", () => ({ recordNonFatal: vi.fn() }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn(() => vi.fn()) }));
vi.mock("@/app/tasktimer/lib/apiClient", () => ({ getApiUrl: (path: string) => path }));

let state: ReturnType<typeof useNativePlusUpsell>;
function Harness() {
  const value = useNativePlusUpsell({ returnPath: "/account", sourcePage: "account" });
  useEffect(() => { state = value; });
  return <button disabled={value.busy} onClick={value.close}>{value.open ? "Open" : "Closed"}</button>;
}
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.finished = null;
  mocks.user.uid = "user-1";
  window.history.replaceState({}, "", "/account");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ url: "https://checkout.example/session" }), { headers: { "Content-Type": "application/json" } })));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("checkout browser return", () => {
  it("consumes success once, closes pricing, and ignores a late browser dismissal", async () => {
    await act(async () => state.show());
    await act(async () => state.startCheckout("plus_monthly"));
    const lateDismissal = mocks.finished;
    await act(async () => {
      window.history.replaceState({}, "", "/account?keep=yes&checkout=success&session_id=cs_1#profile");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(state.open).toBe(false);
    expect(state.checkoutSuccess).toBe(1);
    expect(window.location.search).toBe("?keep=yes");
    expect(window.location.hash).toBe("#profile");
    await act(async () => { lateDismissal?.(); window.dispatchEvent(new Event("pageshow")); });
    expect(state.checkoutSuccess).toBe(1);
    expect(state.open).toBe(false);
  });

  it.each(["success", "cancelled"])("handles a cold %s return", async (outcome) => {
    await act(async () => root.unmount());
    window.history.replaceState({}, "", `/account?checkout=${outcome}`);
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
    expect(state.open).toBe(outcome === "cancelled");
    expect(state.busy).toBe(false);
    expect(state.checkoutSuccess).toBe(outcome === "success" ? 1 : 0);
  });

  it("prevents simultaneous launches and removes its listener on unmount", async () => {
    mocks.open.mockImplementationOnce(async () => { expect(mocks.finished).not.toBeNull(); });
    await act(async () => { await Promise.all([state.startCheckout("plus_monthly"), state.startCheckout("plus_monthly")]); });
    expect(mocks.open).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    expect(mocks.remove).toHaveBeenCalledOnce();
    root = createRoot(container);
  });

  it("clears a checkout launch error and permits a new attempt", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await act(async () => state.show());
    await act(async () => state.startCheckout("plus_monthly"));
    expect(state.busy).toBe(false);
    expect(state.error).toBe("offline");
    await act(async () => state.startCheckout("plus_monthly"));
    expect(mocks.open).toHaveBeenCalledOnce();
    expect(state.error).toBe("");
  });

  it("restores Close and retry after Android browser dismissal, preserving the offer", async () => {
    await act(async () => { state.show(); state.setSelectedOffer("plus_yearly"); });
    await act(async () => state.startCheckout("plus_yearly"));
    expect(mocks.open).toHaveBeenCalledOnce();
    await act(async () => mocks.finished?.());
    expect(state.busy).toBe(false);
    expect(state.open).toBe(true);
    expect(state.selectedOffer).toBe("plus_yearly");
    expect(container.querySelector("button")?.disabled).toBe(false);
    await act(async () => state.startCheckout("plus_yearly"));
    expect(mocks.open).toHaveBeenCalledTimes(2);
    await act(async () => mocks.finished?.());
    await act(async () => container.querySelector("button")?.click());
    expect(state.open).toBe(false);
  });
});
