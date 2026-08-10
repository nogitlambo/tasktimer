import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), db: vi.fn(), factory: vi.fn(), list: vi.fn(), accountActive: vi.fn() }));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationHistoryRepository", () => ({ createFirestoreAutomationHistoryRepository: mocks.factory }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationSecurity", () => ({ assertTrustedAutomationAccountActive: mocks.accountActive }));

import { GET } from "./route";

function request(query = "") {
  return new Request(`https://tasklaunch.test/api/automation/history${query}`, { headers: { origin: "https://tasklaunch.app" } });
}

describe("GET /api/automation/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "user-1" });
    mocks.accountActive.mockResolvedValue(undefined);
    mocks.db.mockReturnValue({});
    mocks.factory.mockReturnValue({ list: mocks.list });
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("supports bounded pagination and outcome filtering", async () => {
    const response = await GET(request("?limit=10&cursor=history-9&outcome=FAILED"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { items: [], nextCursor: null } });
    expect(mocks.list).toHaveBeenCalledWith("user-1", { limit: 10, cursor: "history-9", outcome: "FAILED" });
  });

  it("rejects unsafe page sizes before querying history", async () => {
    const response = await GET(request("?limit=1000"));

    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
