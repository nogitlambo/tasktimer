import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), db: vi.fn(), deleted: vi.fn(), rateLimit: vi.fn(), createRepository: vi.fn(), undo: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/app/api/shared/auth")>()), verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.deleted }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.rateLimit }));
vi.mock("@/app/schedulerepair/lib/scheduleRepairRepository", () => ({ createFirestoreScheduleRepairRepository: mocks.createRepository }));

import { POST } from "./route";

function request(body: Record<string, unknown> = {}) {
  return new Request("https://tasklaunch.app/api/executive-function/schedule-repair/repair-1/undo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/executive-function/schedule-repair/:repairId/undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "uid-1" });
    mocks.db.mockReturnValue({});
    mocks.deleted.mockResolvedValue(false);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.createRepository.mockReturnValue({ undoProposal: mocks.undo });
    mocks.undo.mockResolvedValue({ kind: "undone", proposal: { id: "repair-1", status: "REVERSED" }, results: [{ actionId: "action-1", taskId: "task-1", outcome: "APPLIED", reason: "restored" }] });
  });

  it("passes ownership and idempotency through to the server transaction", async () => {
    const response = await POST(request({ idempotencyKey: "undo-key-1" }), { params: Promise.resolve({ repairId: "repair-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.undo).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", repairId: "repair-1", idempotencyKey: "undo-key-1" }));
  });

  it("rejects an undo without an idempotency key", async () => {
    const response = await POST(request(), { params: Promise.resolve({ repairId: "repair-1" }) });
    expect(response.status).toBe(400);
    expect(mocks.undo).not.toHaveBeenCalled();
  });
});
