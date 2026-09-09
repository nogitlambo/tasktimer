import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  assertExecutiveFunctionAvailableForUser: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/shared/plusEntitlement", () => ({ assertExecutiveFunctionAvailableForUser: mocks.assertExecutiveFunctionAvailableForUser }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/trustedautomation/lib/trustedAutomationHistoryRepository", () => ({
  createFirestoreAutomationHistoryRepository: () => ({ list: mocks.list }),
}));

import { GET } from "./route";

describe("/api/automation/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "user-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({ collection: vi.fn() });
    mocks.assertExecutiveFunctionAvailableForUser.mockResolvedValue("plus");
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("returns a JSON history envelope for authenticated users", async () => {
    const response = await GET(new Request("https://tasklaunch.app/api/automation/history?limit=20", { headers: { authorization: "Bearer token" } }));
    const payload = await response.json();

    expect(response.ok).toBe(true);
    expect(mocks.list).toHaveBeenCalledWith("user-1", { limit: 20, cursor: undefined });
    expect(payload).toEqual({ success: true, data: { items: [], nextCursor: null } });
  });
});
