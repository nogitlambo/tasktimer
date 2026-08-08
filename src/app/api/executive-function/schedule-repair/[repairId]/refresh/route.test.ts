import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), db: vi.fn(), deleted: vi.fn(), rateLimit: vi.fn(), createRepository: vi.fn(), createCapacityRepository: vi.fn(), getCapacity: vi.fn(), generate: vi.fn(), loadProposal: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/app/api/shared/auth")>()), verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.deleted }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.rateLimit }));
vi.mock("@/app/schedulerepair/lib/scheduleRepairRepository", () => ({ createFirestoreScheduleRepairRepository: mocks.createRepository }));
vi.mock("@/app/adaptivecapacity/lib/dailyCapacityRepository", () => ({ createFirestoreDailyCapacityRepository: mocks.createCapacityRepository }));
vi.mock("@/app/adaptivecapacity/lib/dailyCapacityService", () => ({ getDailyCapacity: mocks.getCapacity }));
vi.mock("@/app/schedulerepair/lib/scheduleRepairService", () => ({ generateScheduleRepairProposal: mocks.generate }));

import { POST } from "./route";

function request(body: Record<string, unknown> = {}) {
  return new Request("https://tasklaunch.app/api/executive-function/schedule-repair/repair-1/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/executive-function/schedule-repair/:repairId/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "uid-1" });
    mocks.db.mockReturnValue({});
    mocks.deleted.mockResolvedValue(false);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.createCapacityRepository.mockReturnValue({});
    mocks.createRepository.mockReturnValue({ loadProposal: mocks.loadProposal });
    mocks.loadProposal.mockResolvedValue({ id: "repair-1", userId: "uid-1", localDate: "2026-08-07" });
    mocks.getCapacity.mockResolvedValue({ snapshot: { id: "capacity-2" } });
    mocks.generate.mockResolvedValue({ reused: false, outcome: { evaluation: { outcome: "REPAIR_REQUIRED" } }, proposal: { id: "repair-1" } });
  });

  it("refreshes a user-owned proposal without accepting client task state", async () => {
    const response = await POST(request({ tasks: [{ id: "attacker-task" }] }), { params: Promise.resolve({ repairId: "repair-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", proposalId: "repair-1", forceRefresh: true }));
    expect(mocks.generate.mock.calls[0][0]).not.toHaveProperty("tasks");
  });

  it("does not refresh a missing or cross-user proposal", async () => {
    mocks.loadProposal.mockResolvedValueOnce(null);
    const response = await POST(request(), { params: Promise.resolve({ repairId: "repair-1" }) });
    expect(response.status).toBe(404);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
