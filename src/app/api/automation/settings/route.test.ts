import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  db: vi.fn(),
  repositoryFactory: vi.fn(),
  loadOrCreate: vi.fn(),
  save: vi.fn(),
  accountActive: vi.fn(),
  rateLimit: vi.fn(),
  getUserDoc: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationSettingsRepository", () => ({
  createFirestoreAutomationSettingsRepository: mocks.repositoryFactory,
}));
vi.mock("@/app/trustedautomation/lib/trustedAutomationSecurity", () => ({ assertTrustedAutomationAccountActive: mocks.accountActive }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.rateLimit }));

import { createDefaultAutomationSettings } from "@/app/trustedautomation/lib/trustedAutomationPolicy";
import { GET, PUT } from "./route";

function request(method = "GET", body?: unknown) {
  return new Request("https://tasklaunch.test/api/automation/settings", {
    method,
    headers: { origin: "https://tasklaunch.app", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("/api/automation/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "user-1" });
    mocks.accountActive.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.getUserDoc.mockResolvedValue({ exists: true, get: (field: string) => (field === "plan" ? "plus" : undefined) });
    mocks.db.mockReturnValue({
      collection: vi.fn((name: string) => ({
        doc: vi.fn((id: string) => (name === "users" && id === "user-1" ? { get: mocks.getUserDoc } : { get: vi.fn() })),
      })),
    });
    mocks.repositoryFactory.mockReturnValue({ loadOrCreate: mocks.loadOrCreate, save: mocks.save });
    mocks.loadOrCreate.mockResolvedValue(createDefaultAutomationSettings("user-1", 0));
    mocks.save.mockResolvedValue(undefined);
  });

  it("returns the authenticated user's versioned settings envelope", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { settings: { userId: "user-1", automationEnabled: false } } });
    expect(mocks.loadOrCreate).toHaveBeenCalledWith("user-1");
  });

  it("updates only validated policy fields and never accepts a client user id", async () => {
    const response = await PUT(request("PUT", { consentGranted: true, automationEnabled: true, userId: "other-user" }));

    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
