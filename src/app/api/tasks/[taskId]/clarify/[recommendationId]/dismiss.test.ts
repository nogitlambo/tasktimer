import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  dismissRecommendation: vi.fn(),
  createFirestoreTaskClarificationRepository: vi.fn(),
}));

vi.mock("../../../../shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../shared/auth")>();
  return { ...actual, verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser };
});
vi.mock("../../../../shared/cors", async (importOriginal) => importOriginal<typeof import("../../../../shared/cors")>());
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/taskclarification/lib/taskClarificationRepository", () => ({
  createFirestoreTaskClarificationRepository: mocks.createFirestoreTaskClarificationRepository,
}));

import { POST } from "./dismiss/route";

function request() {
  return new Request("https://tasklaunch.app/api/tasks/task-1/clarify/recommendation-1/dismiss", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://localhost", "x-firebase-auth": "token" },
    body: "{}",
  });
}

describe("POST clarification dismiss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({ name: "db" });
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.dismissRecommendation.mockResolvedValue("dismissed");
    mocks.createFirestoreTaskClarificationRepository.mockReturnValue({ dismissRecommendation: mocks.dismissRecommendation });
  });

  it("dismisses an active recommendation without touching the Task", async () => {
    const result = await POST(request(), { params: Promise.resolve({ taskId: "task-1", recommendationId: "recommendation-1" }) });
    const payload = await result.json();

    expect(result.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, status: "DISMISSED" });
    expect(mocks.dismissRecommendation).toHaveBeenCalledWith("uid-1", "recommendation-1", "task-1", expect.any(Number));
  });

  it("returns an expired response without invoking any Task mutation", async () => {
    mocks.dismissRecommendation.mockResolvedValueOnce("expired");

    const result = await POST(request(), { params: Promise.resolve({ taskId: "task-1", recommendationId: "recommendation-1" }) });

    expect(result.status).toBe(409);
    expect((await result.json()).code).toBe("task-clarification/expired");
  });
});
