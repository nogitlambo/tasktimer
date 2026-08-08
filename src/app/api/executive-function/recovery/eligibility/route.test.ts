import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  createRepository: vi.fn(),
  loadSource: vi.fn(),
  recordDismissal: vi.fn(),
  getCapacity: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/recovery/lib/recoveryRepository", () => ({ createFirestoreRecoveryEligibilityRepository: mocks.createRepository }));
vi.mock("@/app/adaptivecapacity/lib/dailyCapacityRepository", () => ({ createFirestoreDailyCapacityRepository: vi.fn(() => ({})) }));
vi.mock("@/app/adaptivecapacity/lib/dailyCapacityService", () => ({ getDailyCapacity: mocks.getCapacity }));

import { GET, POST } from "./route";

function request(query = "") {
  return new Request(`https://tasklaunch.test/api/executive-function/recovery/eligibility${query}`, {
    headers: { origin: "https://tasklaunch.app" },
  });
}

describe("GET /api/executive-function/recovery/eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({});
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.createRepository.mockReturnValue({ loadSource: mocks.loadSource, recordDismissal: mocks.recordDismissal });
    mocks.loadSource.mockResolvedValue({
      inactiveLocalDays: 0,
      actionableBacklogCount: 8,
      overdueCount: 0,
      missedScheduledDays: 0,
      repeatedPlanOverloadCount: 0,
      repeatedRepairDismissalCount: 0,
      backlogEstimatedMinutes: 120,
      lastDismissedAtMs: null,
    });
    mocks.getCapacity.mockResolvedValue({ snapshot: { remainingRange: { min: 30, max: 60 } }, reused: false });
  });

  it("returns deterministic owned eligibility without trusting client task data", async () => {
    const response = await GET(request("?timezone=Australia%2FSydney&tasks=attacker-data"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, eligibility: { eligible: true, offered: true, manualAvailable: true } });
    expect(mocks.loadSource).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", timezone: "Australia/Sydney" }));
  });

  it("lets an explicit manual request bypass dismissal suppression", async () => {
    mocks.loadSource.mockResolvedValueOnce({
      inactiveLocalDays: 0,
      actionableBacklogCount: 8,
      overdueCount: 0,
      missedScheduledDays: 0,
      repeatedPlanOverloadCount: 0,
      repeatedRepairDismissalCount: 0,
      backlogEstimatedMinutes: 120,
      lastDismissedAtMs: Date.now(),
    });

    const response = await GET(request("?userRequested=true"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, eligibility: { eligible: true, offered: true, suppressed: false } });
  });

  it("still evaluates non-capacity triggers when the capacity signal is unavailable", async () => {
    mocks.getCapacity.mockRejectedValueOnce(new Error("capacity unavailable"));

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, eligibility: { eligible: true, offered: true } });
  });

  it("rejects deleted accounts before loading recovery data", async () => {
    mocks.isDeletedAccountUid.mockResolvedValueOnce(true);

    const response = await GET(request());

    expect(response.status).toBe(410);
    expect(mocks.createRepository).not.toHaveBeenCalled();
    expect(mocks.getCapacity).not.toHaveBeenCalled();
  });

  it("records dismissal server-side without accepting a client timestamp", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: "DISMISSED" });
    expect(mocks.recordDismissal).toHaveBeenCalledWith("uid-1", expect.any(Number));
  });
});
