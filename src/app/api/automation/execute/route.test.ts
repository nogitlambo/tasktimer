import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  db: vi.fn(),
  settingsFactory: vi.fn(),
  loadOrCreate: vi.fn(),
  execute: vi.fn(),
  accountActive: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationSettingsRepository", () => ({ createFirestoreAutomationSettingsRepository: mocks.settingsFactory }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationApiService", () => ({ executeAutomationRequest: mocks.execute }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationSecurity", () => ({ assertTrustedAutomationAccountActive: mocks.accountActive }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.rateLimit }));

import { createDefaultAutomationSettings } from "@/app/trustedautomation/lib/trustedAutomationPolicy";
import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://tasklaunch.test/api/automation/execute", {
    method: "POST",
    headers: { origin: "https://tasklaunch.app", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/automation/execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "user-1" });
    mocks.accountActive.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.db.mockReturnValue({});
    mocks.settingsFactory.mockReturnValue({ loadOrCreate: mocks.loadOrCreate });
    mocks.loadOrCreate.mockResolvedValue(createDefaultAutomationSettings("user-1", 0));
    mocks.execute.mockResolvedValue({ kind: "SKIPPED", reason: "FEATURE_UNAVAILABLE" });
  });

  it("validates the required execution fields before delegating", async () => {
    const response = await POST(request({ ruleId: "REFRESH_DAILY_BRIEF", entityId: "brief-1" }));

    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("delegates an authenticated valid request and returns a stable envelope", async () => {
    const body = {
      ruleId: "REFRESH_DAILY_BRIEF",
      entityId: "brief-1",
      entityVersion: "v1",
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
    };
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { result: { kind: "SKIPPED" } } });
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ uid: "user-1", request: body }));
  });
});
