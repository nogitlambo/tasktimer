import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  db: vi.fn(),
  active: vi.fn(),
  rateLimit: vi.fn(),
  settingsFactory: vi.fn(),
  historyFactory: vi.fn(),
  settings: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.rateLimit }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationSecurity", () => ({ assertTrustedAutomationAccountActive: mocks.active }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationSettingsRepository", () => ({ createFirestoreAutomationSettingsRepository: mocks.settingsFactory }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationHistoryRepository", () => ({ createFirestoreAutomationHistoryRepository: mocks.historyFactory }));

import { createDefaultAutomationSettings, applyAutomationSettingsPatch } from "@/app/trustedautomation/lib/trustedAutomationPolicy";
import { GET } from "./route";

function request() {
  return new Request("https://tasklaunch.test/api/automation/trust", { headers: { origin: "https://tasklaunch.app" } });
}

function history(id: string, createdAt: string) {
  return {
    schemaVersion: 1 as const,
    id,
    userId: "user-1",
    executionId: `execution-${id}`,
    ruleId: "REFRESH_DAILY_BRIEF" as const,
    trigger: "USER_REQUESTED",
    outcome: "SUCCESS" as const,
    reasonCodes: ["SUCCESS" as const],
    entity: { entityType: "DAILY_BRIEF" as const, entityId: "brief-1", entityVersion: "v1" },
    durationMs: 100,
    createdAt,
    retentionExpiresAt: "2026-11-07T00:00:00.000Z",
  };
}

describe("GET /api/automation/trust", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "user-1" });
    mocks.active.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.db.mockReturnValue({});
    mocks.settingsFactory.mockReturnValue({ loadOrCreate: mocks.settings });
    mocks.historyFactory.mockReturnValue({ list: mocks.list });
    mocks.settings.mockResolvedValue(applyAutomationSettingsPatch(createDefaultAutomationSettings("user-1", 0), {
      consentGranted: true,
      automationEnabled: true,
      rules: [{ ruleId: "REFRESH_DAILY_BRIEF", enabled: true, trustLevel: "ASSISTED" }],
    }, 1));
    mocks.list.mockResolvedValue({ items: [
      history("1", "2026-08-08T00:00:00.000Z"),
      history("2", "2026-08-07T00:00:00.000Z"),
      history("3", "2026-08-06T00:00:00.000Z"),
    ], nextCursor: null });
  });

  it("returns an advisory promotion without changing server policy", async () => {
    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "PROMOTE", suggestedTrustLevel: "TRUSTED", advisoryOnly: true }),
    ]));
    expect(payload.data.recommendations[0]).not.toHaveProperty("taskTitle");
    expect(mocks.settings).toHaveBeenCalledWith("user-1");
  });
});
