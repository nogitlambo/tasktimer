import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), db: vi.fn(), deleted: vi.fn(), rateLimit: vi.fn(), createRepository: vi.fn(), createCapacityRepository: vi.fn(), getCapacity: vi.fn(), generate: vi.fn(),
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
  return new Request("https://tasklaunch.app/api/executive-function/schedule-repair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/executive-function/schedule-repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "uid-1" });
    mocks.db.mockReturnValue({});
    mocks.deleted.mockResolvedValue(false);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.createRepository.mockReturnValue({});
    mocks.createCapacityRepository.mockReturnValue({});
    mocks.getCapacity.mockResolvedValue({ snapshot: { id: "capacity-1" } });
    mocks.generate.mockResolvedValue({ reused: false, outcome: { evaluation: { outcome: "NO_REPAIR_NEEDED" } }, proposal: null });
  });

  it("authenticates and generates from server-owned state", async () => {
    const response = await POST(request({ tasks: [{ id: "attacker-task", estimatedMinutes: 999 }], timezone: "UTC" }));
    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", localDate: "2026-08-07", forceRefresh: false }));
    expect(mocks.generate.mock.calls[0][0]).not.toHaveProperty("tasks");
  });

  it("blocks deleted accounts before generation", async () => {
    mocks.deleted.mockResolvedValueOnce(true);
    const response = await POST(request());
    expect(response.status).toBe(410);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("returns a generic safe failure for generation errors", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("private task content"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "TaskLaunch could not prepare a schedule repair right now.", code: "schedule-repair/internal" });
  });
});
