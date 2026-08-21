import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getFirebaseAdminDb: vi.fn() }));

vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));

import {
  ExecutiveFunctionDisabledError,
  PLUS_REQUIRED_CODE,
  PlusPlanRequiredError,
  assertExecutiveFunctionAvailableForUser,
  assertPlusPlanForExecutiveFunction,
  createPlusPlanRequiredResponse,
  normalizeServerTaskTimerPlan,
} from "./plusEntitlement";
import { EXECUTIVE_FUNCTION_DISABLED_CODE } from "@/app/tasktimer/lib/executiveFunctionAvailability";

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

function dbWithPlanAndExecutivePreference(plan: unknown, executiveFunctionEnabled: boolean | undefined) {
  return {
    collection: vi.fn((collectionName: string) => ({
      doc: vi.fn((docId: string) => {
        if (collectionName !== "users" || docId !== "uid-1") return { get: vi.fn() };
        return {
          get: vi.fn(async () => ({
            exists: true,
            get: vi.fn(() => plan),
          })),
          collection: vi.fn((subcollectionName: string) => ({
            doc: vi.fn((subDocId: string) => ({
              get: vi.fn(async () => ({
                exists: subcollectionName === "preferences" && subDocId === "v1" && executiveFunctionEnabled !== undefined,
                get: vi.fn((field: string) => (field === "executiveFunctionEnabled" ? executiveFunctionEnabled : undefined)),
              })),
            })),
          })),
        };
      }),
    })),
  };
}

describe("PLUS executive-function entitlement", () => {
  it("normalizes the allowed PLUS plan family", () => {
    expect(normalizeServerTaskTimerPlan("plus")).toBe("plus");
    expect(normalizeServerTaskTimerPlan("plus_monthly")).toBe("plus_monthly");
    expect(normalizeServerTaskTimerPlan("plus_yearly")).toBe("plus_yearly");
    expect(normalizeServerTaskTimerPlan("plus_lifetime")).toBe("plus_lifetime");
    expect(normalizeServerTaskTimerPlan("pro")).toBe("plus");
  });

  it("normalizes missing and unsupported plans to free", () => {
    expect(normalizeServerTaskTimerPlan(null)).toBe("free");
    expect(normalizeServerTaskTimerPlan("enterprise")).toBe("free");
    expect(normalizeServerTaskTimerPlan("free")).toBe("free");
  });

  it("allows PLUS, monthly, yearly, lifetime, and legacy pro users", async () => {
    await expect(assertPlusPlanForExecutiveFunction("uid-1", dbWithPlan("plus") as never)).resolves.toBe("plus");
    await expect(assertPlusPlanForExecutiveFunction("uid-1", dbWithPlan("plus_monthly") as never)).resolves.toBe("plus_monthly");
    await expect(assertPlusPlanForExecutiveFunction("uid-1", dbWithPlan("plus_yearly") as never)).resolves.toBe("plus_yearly");
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

  it("allows PLUS users when the Executive Function preference is missing or enabled", async () => {
    await expect(assertExecutiveFunctionAvailableForUser("uid-1", dbWithPlanAndExecutivePreference("plus", undefined) as never)).resolves.toBe("plus");
    await expect(assertExecutiveFunctionAvailableForUser("uid-1", dbWithPlanAndExecutivePreference("plus", true) as never)).resolves.toBe("plus");
  });

  it("blocks PLUS users when Executive Function is disabled in preferences", async () => {
    await expect(assertExecutiveFunctionAvailableForUser("uid-1", dbWithPlanAndExecutivePreference("plus", false) as never)).rejects.toMatchObject({
      code: EXECUTIVE_FUNCTION_DISABLED_CODE,
      status: 403,
    });
    await expect(assertExecutiveFunctionAvailableForUser("uid-1", dbWithPlanAndExecutivePreference("plus", false) as never)).rejects.toBeInstanceOf(ExecutiveFunctionDisabledError);
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
