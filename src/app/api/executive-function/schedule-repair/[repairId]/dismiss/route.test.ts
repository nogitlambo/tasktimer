import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), db: vi.fn(), deleted: vi.fn(), rateLimit: vi.fn(), createRepository: vi.fn(), loadProposal: vi.fn(), saveProposal: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/app/api/shared/auth")>()), verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.deleted }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.rateLimit }));
vi.mock("@/app/schedulerepair/lib/scheduleRepairRepository", () => ({ createFirestoreScheduleRepairRepository: mocks.createRepository }));

import { POST } from "./route";

function request() {
  return new Request("https://tasklaunch.app/api/executive-function/schedule-repair/repair-1/dismiss", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
}

describe("POST /api/executive-function/schedule-repair/:repairId/dismiss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "uid-1" });
    mocks.db.mockReturnValue({});
    mocks.deleted.mockResolvedValue(false);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.createRepository.mockReturnValue({ loadProposal: mocks.loadProposal, saveProposal: mocks.saveProposal });
    mocks.loadProposal.mockResolvedValue({
      id: "repair-1",
      userId: "uid-1",
      status: "ACTIVE",
      actions: [{ id: "action-1", status: "PROPOSED", selected: true }],
    });
  });

  it("dismisses an owned proposal and rejects its pending actions", async () => {
    const response = await POST(request(), { params: Promise.resolve({ repairId: "repair-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.saveProposal).toHaveBeenCalledWith("uid-1", expect.objectContaining({ status: "DISMISSED", actions: [{ id: "action-1", status: "REJECTED", selected: false }] }));
  });

  it("does not dismiss an applied proposal", async () => {
    mocks.loadProposal.mockResolvedValueOnce({ id: "repair-1", userId: "uid-1", status: "APPLIED", actions: [] });
    const response = await POST(request(), { params: Promise.resolve({ repairId: "repair-1" }) });
    expect(response.status).toBe(409);
    expect(mocks.saveProposal).not.toHaveBeenCalled();
  });
});
