import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  assertExecutiveFunctionAvailableForUser: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  loadOrCreate: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/shared/plusEntitlement", () => ({ assertExecutiveFunctionAvailableForUser: mocks.assertExecutiveFunctionAvailableForUser }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationSettingsRepository", () => ({
  createFirestoreAutomationSettingsRepository: () => ({ loadOrCreate: mocks.loadOrCreate, save: mocks.save }),
}));

import { GET, PUT } from "./route";
import { createDefaultAutomationSettings } from "@/app/trustedautomation/lib/trustedAutomationPolicy";

describe("/api/automation/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "user-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({ collection: vi.fn() });
    mocks.assertExecutiveFunctionAvailableForUser.mockResolvedValue("plus");
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.loadOrCreate.mockResolvedValue(createDefaultAutomationSettings("user-1", 0));
  });

  it("returns a JSON settings envelope for authenticated users", async () => {
    const response = await GET(new Request("https://tasklaunch.app/api/automation/settings", { headers: { authorization: "Bearer token" } }));
    const payload = await response.json();

    expect(response.ok).toBe(true);
    expect(payload).toMatchObject({ success: true, data: { settings: { userId: "user-1" } } });
  });

  it("applies settings patches and returns the updated settings envelope", async () => {
    const response = await PUT(new Request("https://tasklaunch.app/api/automation/settings", {
      method: "PUT",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ consentGranted: true }),
    }));
    const payload = await response.json();

    expect(response.ok).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith("user-1", expect.objectContaining({ consentGranted: true }));
    expect(payload).toMatchObject({ success: true, data: { settings: { consentGranted: true } } });
  });

  it("returns JSON error envelopes instead of route-miss HTML", async () => {
    mocks.verifyFirebaseRequestUser.mockRejectedValueOnce(Object.assign(new Error("No session."), { status: 401, code: "auth/unauthenticated" }));

    const response = await GET(new Request("https://tasklaunch.app/api/automation/settings"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toMatchObject({ success: false, error: { code: "auth/unauthenticated" } });
  });
});
