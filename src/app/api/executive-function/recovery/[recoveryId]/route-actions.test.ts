import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  db: vi.fn(),
  deleted: vi.fn(),
  rateLimit: vi.fn(),
  sessionRepository: vi.fn(),
  eligibilityRepository: vi.fn(),
  loadEligibility: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.deleted }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.rateLimit }));
vi.mock("@/app/recovery/lib/recoverySessionRepository", () => ({ createFirestoreRecoverySessionRepository: mocks.sessionRepository }));
vi.mock("@/app/recovery/lib/recoveryRepository", () => ({ createFirestoreRecoveryEligibilityRepository: mocks.eligibilityRepository }));
vi.mock("@/app/recovery/lib/recoveryEligibilityService", () => ({ loadRecoveryEligibility: mocks.loadEligibility }));
vi.mock("@/app/recovery/lib/recoveryPlanningRepository", () => ({ createFirestoreRecoveryPlanningRepository: vi.fn(() => ({})) }));
vi.mock("@/app/schedulerepair/lib/scheduleRepairRepository", () => ({ createFirestoreScheduleRepairRepository: vi.fn(() => ({})) }));
vi.mock("@/app/recovery/lib/recoveryService", () => ({ generateRecoverySession: mocks.generate }));

import { POST as complete } from "./complete/route";
import { POST as dismiss } from "./dismiss/route";
import { POST as refresh } from "./refresh/route";

const context = { params: Promise.resolve({ recoveryId: "recovery-1" }) };

function request() {
  return new Request("https://tasklaunch.test/api/executive-function/recovery/recovery-1", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
}

describe("Recovery session action routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "uid-1" });
    mocks.db.mockReturnValue({});
    mocks.deleted.mockResolvedValue(false);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.sessionRepository.mockReturnValue({
      loadSession: vi.fn().mockResolvedValue({ id: "recovery-1", userId: "uid-1", status: "ACTIVE" }),
      dismissSession: vi.fn().mockResolvedValue({ id: "recovery-1", userId: "uid-1", status: "DISMISSED" }),
      completeSession: vi.fn().mockResolvedValue({ id: "recovery-1", userId: "uid-1", status: "COMPLETED" }),
    });
    mocks.eligibilityRepository.mockReturnValue({ recordDismissal: vi.fn().mockResolvedValue(undefined) });
    mocks.loadEligibility.mockResolvedValue({ eligibility: { eligible: true, triggerCodes: ["USER_REQUESTED_RECOVERY"] }, capacitySnapshot: null });
    mocks.generate.mockResolvedValue({ reused: false, session: { id: "recovery-1", userId: "uid-1", status: "ACTIVE" } });
  });

  it("refreshes only the authenticated user's active session", async () => {
    const response = await refresh(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", sessionId: "recovery-1", forceRefresh: true }));
  });

  it("dismisses the session and records server-owned suppression", async () => {
    const response = await dismiss(request(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, session: { status: "DISMISSED" } });
    expect(mocks.eligibilityRepository.mock.results[0]?.value.recordDismissal).toHaveBeenCalledWith("uid-1", expect.any(Number));
  });

  it("completes only an active session", async () => {
    const response = await complete(request(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, session: { status: "COMPLETED" } });
  });

  it("does not expose a session returned for another user", async () => {
    mocks.sessionRepository.mockReturnValue({
      loadSession: vi.fn().mockResolvedValue({ id: "recovery-1", userId: "uid-2", status: "ACTIVE" }),
    });

    for (const action of [refresh, dismiss, complete]) {
      const response = await action(request(), context);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "recovery/not-found" });
    }
  });
});
