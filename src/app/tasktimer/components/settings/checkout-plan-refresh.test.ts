import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startCheckoutPlanRefresh } from "./checkout-plan-refresh";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it.each(["plus_monthly", "plus_yearly"] as const)("waits for backend confirmation of %s", async (paid) => {
  const loadPlan = vi.fn().mockResolvedValueOnce("free").mockResolvedValueOnce("free").mockResolvedValue(paid);
  const onConfirmed = vi.fn();
  const onPending = vi.fn();
  startCheckoutPlanRefresh({ loadPlan, onConfirmed, onPending });
  await vi.advanceTimersByTimeAsync(0);
  expect(onConfirmed).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(4000);
  expect(onConfirmed).toHaveBeenCalledExactlyOnceWith(paid);
  await vi.advanceTimersByTimeAsync(30000);
  expect(loadPlan).toHaveBeenCalledTimes(3);
  expect(onPending).not.toHaveBeenCalled();
});

it.each(["free", "offline", "hung"])("stops after 30 seconds when %s and supports a new retry", async (mode) => {
  const loadPlan = vi.fn(() => mode === "hung" ? new Promise<"free">(() => {})
    : mode === "offline" ? Promise.reject(new Error("offline")) : Promise.resolve("free" as const));
  const onConfirmed = vi.fn();
  const onPending = vi.fn();
  startCheckoutPlanRefresh({ loadPlan, onConfirmed, onPending });
  await vi.advanceTimersByTimeAsync(30000);
  expect(onPending).toHaveBeenCalledOnce();
  expect(onConfirmed).not.toHaveBeenCalled();
  const count = loadPlan.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(loadPlan).toHaveBeenCalledTimes(count);
  startCheckoutPlanRefresh({ loadPlan: async () => "plus_monthly", onConfirmed, onPending });
  await vi.advanceTimersByTimeAsync(0);
  expect(onConfirmed).toHaveBeenCalledExactlyOnceWith("plus_monthly");
});

it("ignores an in-flight response after account change or unmount", async () => {
  let resolve!: (plan: "plus_yearly") => void;
  const onConfirmed = vi.fn();
  const onPending = vi.fn();
  const stop = startCheckoutPlanRefresh({ loadPlan: () => new Promise((done) => { resolve = done; }), onConfirmed, onPending });
  stop();
  resolve("plus_yearly");
  await vi.advanceTimersByTimeAsync(30000);
  expect(onConfirmed).not.toHaveBeenCalled();
  expect(onPending).not.toHaveBeenCalled();
});
