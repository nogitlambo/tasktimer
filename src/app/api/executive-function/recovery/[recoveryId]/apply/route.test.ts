import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  db: vi.fn(),
  deleted: vi.fn(),
  rateLimit: vi.fn(),
  createRepository: vi.fn(),
  createCapacityRepository: vi.fn(),
  getCapacity: vi.fn(),
  apply: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.deleted }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.rateLimit }));
vi.mock("@/app/recovery/lib/recoveryApplyRepository", () => ({ createFirestoreRecoveryApplyRepository: mocks.createRepository }));
vi.mock("@/app/adaptivecapacity/lib/dailyCapacityRepository", () => ({ createFirestoreDailyCapacityRepository: mocks.createCapacityRepository }));
vi.mock("@/app/adaptivecapacity/lib/dailyCapacityService", () => ({ getDailyCapacity: mocks.getCapacity }));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://tasklaunch.test/api/executive-function/recovery/recovery-1/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/executive-function/recovery/:recoveryId/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "uid-1" });
    mocks.db.mockReturnValue({});
    mocks.deleted.mockResolvedValue(false);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.createCapacityRepository.mockReturnValue({});
    mocks.getCapacity.mockResolvedValue({ snapshot: { remainingRange: { min: 15, max: 30 }, fullDayRange: { min: 30, max: 60 } } });
    mocks.createRepository.mockReturnValue({ applySession: mocks.apply });
    mocks.apply.mockResolvedValue({ kind: "applied", session: { id: "recovery-1", status: "PARTIALLY_APPLIED" }, results: [{ actionId: "defer:task-1", taskId: "task-1", outcome: "APPLIED", reason: "fresh" }] });
  });

  it("passes only action choices and server identity to the apply repository", async () => {
    const response = await POST(request({ timezone: "UTC", idempotencyKey: "apply-1", actions: [{ id: "defer:task-1", selected: true, toDate: "2026-08-10" }], tasks: [{ id: "attacker-task" }] }), { params: Promise.resolve({ recoveryId: "recovery-1" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, idempotent: false, session: { id: "recovery-1" } });
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", recoveryId: "recovery-1", idempotencyKey: "apply-1", targetDayCapacityMax: 60, actions: [{ id: "defer:task-1", selected: true, toDate: "2026-08-10" }] }));
    expect(mocks.apply.mock.calls[0][0]).not.toHaveProperty("tasks");
  });

  it("rejects missing idempotency or actions before persistence", async () => {
    const response = await POST(request({}), { params: Promise.resolve({ recoveryId: "recovery-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
