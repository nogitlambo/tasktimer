import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), db: vi.fn(), executionFactory: vi.fn(), get: vi.fn(), retry: vi.fn(), accountActive: vi.fn(), rateLimit: vi.fn() }));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationExecutionRepository", () => ({ createFirestoreAutomationExecutionRepository: mocks.executionFactory }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationApiService", () => ({ retryAutomationRequest: mocks.retry }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationSecurity", () => ({ assertTrustedAutomationAccountActive: mocks.accountActive }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.rateLimit }));

import { POST } from "./route";

const retryRequest = {
  executionId: "execution-1",
  idempotencyKey: "00000000-0000-4000-8000-000000000002",
};

function request(body: unknown) {
  return new Request("https://tasklaunch.test/api/automation/retry", {
    method: "POST",
    headers: { origin: "https://tasklaunch.app", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/automation/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "user-1" });
    mocks.accountActive.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.db.mockReturnValue({});
    mocks.executionFactory.mockReturnValue({ get: mocks.get });
    mocks.get.mockResolvedValue({ state: "FAILED", error: { category: "TRANSIENT" } });
    mocks.retry.mockResolvedValue({ kind: "SKIPPED", reason: "FEATURE_UNAVAILABLE" });
  });

  it("rejects permanent failures without invoking the retry handler", async () => {
    mocks.get.mockResolvedValueOnce({ state: "FAILED", error: { category: "VALIDATION" } });

    const response = await POST(request(retryRequest));

    expect(response.status).toBe(409);
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("delegates only eligible transient failures", async () => {
    const response = await POST(request(retryRequest));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { result: { kind: "SKIPPED" } } });
    expect(mocks.retry).toHaveBeenCalledWith({ uid: "user-1", request: retryRequest });
  });
});
