import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getFirebaseAdminDb: vi.fn() }));

vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));

import {
  PLUS_REQUIRED_CODE,
  PlusPlanRequiredError,
  assertPlusPlanForExecutiveFunction,
  createPlusPlanRequiredResponse,
  normalizeServerTaskTimerPlan,
} from "./plusEntitlement";

function dbWithPlan(plan: unknown, exists = true) {
  return {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({
          exists,
          get: vi.fn(() => plan),
        })),
      })),
    })),
  };
}

describe("PLUS executive-function entitlement", () => {
  it("normalizes the allowed PLUS plan family", () => {
    expect(normalizeServerTaskTimerPlan("plus")).toBe("plus");
    expect(normalizeServerTaskTimerPlan("plus_lifetime")).toBe("plus_lifetime");
    expect(normalizeServerTaskTimerPlan("pro")).toBe("plus");
  });

  it("normalizes missing and unsupported plans to free", () => {
    expect(normalizeServerTaskTimerPlan(null)).toBe("free");
    expect(normalizeServerTaskTimerPlan("enterprise")).toBe("free");
    expect(normalizeServerTaskTimerPlan("free")).toBe("free");
  });

  it("allows PLUS, lifetime, and legacy pro users", async () => {
    await expect(assertPlusPlanForExecutiveFunction("uid-1", dbWithPlan("plus") as never)).resolves.toBe("plus");
    await expect(assertPlusPlanForExecutiveFunction("uid-1", dbWithPlan("plus_lifetime") as never)).resolves.toBe("plus_lifetime");
    await expect(assertPlusPlanForExecutiveFunction("uid-1", dbWithPlan("pro") as never)).resolves.toBe("plus");
  });

  it("blocks free and missing-plan users", async () => {
    await expect(assertPlusPlanForExecutiveFunction("uid-1", dbWithPlan("free") as never)).rejects.toMatchObject({
      code: PLUS_REQUIRED_CODE,
      status: 402,
    });
    await expect(assertPlusPlanForExecutiveFunction("uid-1", dbWithPlan(null, false) as never)).rejects.toBeInstanceOf(PlusPlanRequiredError);
  });

  it("builds the stable PLUS-required response", async () => {
    const response = createPlusPlanRequiredResponse();
    await expect(response.json()).resolves.toEqual({
      error: "Upgrade to PLUS to use executive function features.",
      code: PLUS_REQUIRED_CODE,
    });
    expect(response.status).toBe(402);
  });
});
