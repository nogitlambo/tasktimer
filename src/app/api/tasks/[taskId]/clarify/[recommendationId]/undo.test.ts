import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  undoRecommendation: vi.fn(),
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

import { POST } from "./undo/route";

const recommendation = { id: "recommendation-1", userId: "uid-1", status: "REVERSED", taskId: "task-1" };

function request(body: Record<string, unknown> = { idempotencyKey: "undo-1" }) {
  return new Request("https://tasklaunch.app/api/tasks/task-1/clarify/recommendation-1/undo", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://localhost", "x-firebase-auth": "token" },
    body: JSON.stringify(body),
  });
}

describe("POST clarification undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({ name: "db" });
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.undoRecommendation.mockResolvedValue({ kind: "reversed", recommendation });
    mocks.createFirestoreTaskClarificationRepository.mockReturnValue({ undoRecommendation: mocks.undoRecommendation });
  });

  it("returns the reversible recommendation after an undo", async () => {
    const result = await POST(request(), { params: Promise.resolve({ taskId: "task-1", recommendationId: "recommendation-1" }) });
    const payload = await result.json();

    expect(result.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, partial: false, recommendation: { status: "REVERSED" } });
    expect(mocks.undoRecommendation).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", idempotencyKey: "undo-1" }));
  });

  it("rejects an undo request without an idempotency key", async () => {
    const result = await POST(request({}), { params: Promise.resolve({ taskId: "task-1", recommendationId: "recommendation-1" }) });

    expect(result.status).toBe(400);
    expect(mocks.undoRecommendation).not.toHaveBeenCalled();
  });

  it("reports a partial recovery without hiding the surviving user-edited task", async () => {
    mocks.undoRecommendation.mockResolvedValueOnce({ kind: "partially-reversed", recommendation: { ...recommendation, status: "PARTIALLY_ACCEPTED" } });

    const result = await POST(request(), { params: Promise.resolve({ taskId: "task-1", recommendationId: "recommendation-1" }) });
    const payload = await result.json();

    expect(result.status).toBe(200);
    expect(payload.partial).toBe(true);
  });
});
