import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  enforceUidRateLimit: vi.fn(),
  loadEligibility: vi.fn(),
  createEligibilityRepository: vi.fn(),
  createSessionRepository: vi.fn(),
  createPlanningRepository: vi.fn(),
  createScheduleRepository: vi.fn(),
  generateSession: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.enforceUidRateLimit }));
vi.mock("@/app/recovery/lib/recoveryEligibilityService", () => ({ loadRecoveryEligibility: mocks.loadEligibility }));
vi.mock("@/app/recovery/lib/recoveryRepository", () => ({ createFirestoreRecoveryEligibilityRepository: mocks.createEligibilityRepository }));
vi.mock("@/app/recovery/lib/recoverySessionRepository", () => ({ createFirestoreRecoverySessionRepository: mocks.createSessionRepository }));
vi.mock("@/app/recovery/lib/recoveryPlanningRepository", () => ({ createFirestoreRecoveryPlanningRepository: mocks.createPlanningRepository }));
vi.mock("@/app/schedulerepair/lib/scheduleRepairRepository", () => ({ createFirestoreScheduleRepairRepository: mocks.createScheduleRepository }));
vi.mock("@/app/recovery/lib/recoveryService", () => ({ generateRecoverySession: mocks.generateSession }));

import { POST } from "./route";

function request(body: Record<string, unknown> = {}) {
  return new Request("https://tasklaunch.test/api/executive-function/recovery", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://tasklaunch.app" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/executive-function/recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({});
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.enforceUidRateLimit.mockResolvedValue(undefined);
    mocks.createEligibilityRepository.mockReturnValue({});
    mocks.createSessionRepository.mockReturnValue({});
    mocks.createPlanningRepository.mockReturnValue({});
    mocks.createScheduleRepository.mockReturnValue({});
    mocks.loadEligibility.mockResolvedValue({
      eligibility: { eligible: true, offered: true, triggerCodes: ["BACKLOG_THRESHOLD_EXCEEDED"] },
      capacitySnapshot: { remainingRange: { min: 15, max: 30 } },
    });
    mocks.generateSession.mockResolvedValue({ reused: false, session: { id: "recovery-1", userId: "uid-1", status: "ACTIVE" } });
  });

  it("generates an owned session from server-loaded data and authoritative eligibility", async () => {
    const response = await POST(request({ timezone: "Australia/Sydney", tasks: [{ id: "attacker-task" }] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, reused: false, session: { id: "recovery-1" } });
    expect(mocks.generateSession).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", triggerCodes: ["BACKLOG_THRESHOLD_EXCEEDED"], capacitySnapshot: { remainingRange: { min: 15, max: 30 } } }));
  });

  it("returns no session when recovery is not needed unless manually requested", async () => {
    mocks.loadEligibility.mockResolvedValueOnce({ eligibility: { eligible: false, offered: false, triggerCodes: [] }, capacitySnapshot: null });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, session: null, empty: true });
    expect(mocks.generateSession).not.toHaveBeenCalled();
  });
});
