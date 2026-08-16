import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  releaseSuppressionsForCompletedTask: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", async () => ({ ...(await vi.importActual<typeof import("@/app/api/shared/auth")>("@/app/api/shared/auth")), verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/nextbestaction/lib/nextBestActionRepository", () => ({ createFirestoreNextBestActionRepository: vi.fn(() => ({ releaseSuppressionsForCompletedTask: mocks.releaseSuppressionsForCompletedTask })) }));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://tasklaunch.app/api/recommendations/next-best-action/suppressions/release", { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": "token" }, body: JSON.stringify(body) });
}

describe("POST /api/recommendations/next-best-action/suppressions/release", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({});
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.releaseSuppressionsForCompletedTask.mockResolvedValue(2);
  });

  it("releases every other active suppression after a task completes", async () => {
    const response = await POST(request({ completedTaskId: "task-completed" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, releasedCount: 2 });
    expect(mocks.releaseSuppressionsForCompletedTask).toHaveBeenCalledWith(expect.objectContaining({
      uid: "uid-1",
      completedTaskId: "task-completed",
    }));
  });

  it("requires a completed task id", async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(400);
    expect(mocks.releaseSuppressionsForCompletedTask).not.toHaveBeenCalled();
  });
});
