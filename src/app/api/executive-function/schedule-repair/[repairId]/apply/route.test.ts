import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), db: vi.fn(), deleted: vi.fn(), rateLimit: vi.fn(), createRepository: vi.fn(), apply: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/app/api/shared/auth")>()), verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.deleted }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.rateLimit }));
vi.mock("@/app/schedulerepair/lib/scheduleRepairRepository", () => ({ createFirestoreScheduleRepairRepository: mocks.createRepository }));
vi.mock("@/app/schedulerepair/lib/scheduleRepairService", () => ({ applyScheduleRepairProposal: mocks.apply }));

import { POST } from "./route";

function request(body: Record<string, unknown> = {}) {
  return new Request("https://tasklaunch.app/api/executive-function/schedule-repair/repair-1/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/executive-function/schedule-repair/:repairId/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "uid-1" });
    mocks.db.mockReturnValue({});
    mocks.deleted.mockResolvedValue(false);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.createRepository.mockReturnValue({});
    mocks.apply.mockResolvedValue({ kind: "applied", proposal: { id: "repair-1" }, results: [{ actionId: "action-1", taskId: "task-1", outcome: "APPLIED", reason: "fresh" }] });
  });

  it("applies only the structured selected-action payload", async () => {
    const response = await POST(request({ timezone: "UTC", idempotencyKey: "key-1", actions: [{ id: "action-1", selected: true, toDate: "2026-08-09", toMinutes: null }], tasks: [{ id: "attacker-task" }] }), { params: Promise.resolve({ repairId: "repair-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", repairId: "repair-1", idempotencyKey: "key-1", actions: [{ id: "action-1", selected: true, toDate: "2026-08-09", toMinutes: null }] }));
    expect(mocks.apply.mock.calls[0][0]).not.toHaveProperty("tasks");
  });

  it("rejects missing idempotency or actions before touching persistence", async () => {
    const response = await POST(request({}), { params: Promise.resolve({ repairId: "repair-1" }) });
    expect(response.status).toBe(400);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
