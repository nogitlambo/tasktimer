import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), db: vi.fn(), deleted: vi.fn(), rateLimit: vi.fn(), createRepository: vi.fn(), undo: vi.fn() }));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verify }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.db }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.deleted }));
vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.rateLimit }));
vi.mock("@/app/recovery/lib/recoveryApplyRepository", () => ({ createFirestoreRecoveryApplyRepository: mocks.createRepository }));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://tasklaunch.test/api/executive-function/recovery/recovery-1/undo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/executive-function/recovery/:recoveryId/undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "uid-1" });
    mocks.db.mockReturnValue({});
    mocks.deleted.mockResolvedValue(false);
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.createRepository.mockReturnValue({ undoSession: mocks.undo });
    mocks.undo.mockResolvedValue({ kind: "undone", session: { id: "recovery-1", status: "PARTIALLY_APPLIED" }, results: [{ actionId: "defer:task-1", taskId: "task-1", outcome: "APPLIED", reason: "restored" }] });
  });

  it("uses the authenticated owner and idempotent undo key", async () => {
    const response = await POST(request({ idempotencyKey: "undo-1" }), { params: Promise.resolve({ recoveryId: "recovery-1" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, idempotent: false, results: [{ outcome: "APPLIED" }] });
    expect(mocks.undo).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", recoveryId: "recovery-1", idempotencyKey: "undo-1" }));
  });

  it("rejects an expired undo window", async () => {
    mocks.undo.mockResolvedValueOnce({ kind: "expired", session: { id: "recovery-1" }, results: [] });

    const response = await POST(request({ idempotencyKey: "undo-1" }), { params: Promise.resolve({ recoveryId: "recovery-1" }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "recovery/undo-expired" });
  });

  it("surfaces a later-edit conflict without overwriting the task", async () => {
    mocks.undo.mockResolvedValueOnce({ kind: "undone", session: { id: "recovery-1" }, results: [{ actionId: "defer:task-1", taskId: "task-1", outcome: "STALE", reason: "changed" }] });

    const response = await POST(request({ idempotencyKey: "undo-1" }), { params: Promise.resolve({ recoveryId: "recovery-1" }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "recovery/undo-conflict" });
  });
});
