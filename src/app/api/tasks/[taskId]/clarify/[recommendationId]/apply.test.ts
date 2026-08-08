import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  createFirestoreTaskClarificationRepository: vi.fn(),
  loadRecommendation: vi.fn(),
  applyRecommendation: vi.fn(),
  expireRecommendation: vi.fn(),
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

import type { TaskClarificationRecommendation } from "@/app/taskclarification/lib/taskClarification";
import { POST } from "./apply/route";

const recommendation = {
  id: "recommendation-1",
  userId: "uid-1",
  taskId: "task-1",
  sourceTaskVersion: "version-1",
  status: "ACTIVE",
  originalTitle: "Prepare launch",
  suggestedTitle: "Prepare launch checklist",
  definitionOfDone: "The checklist is ready.",
  firstAction: "Open the checklist.",
  stoppingPoint: "Stop after the first review.",
  estimatedMinutes: 30,
  estimatedRange: { min: 20, max: 40 },
  subtasks: [],
  clarificationQuestions: [],
  warnings: [],
  reasonCodes: ["TASK_TOO_BROAD"],
  confidence: 0.9,
  ambiguityScore: 0.7,
  initiationDifficultyScore: 0.6,
  userInstruction: null,
  sourceRecommendationId: null,
  regenerationCount: 0,
  applyIdempotencyKey: "apply-1",
  applyStatus: "APPLIED",
  applyResult: "APPLIED",
  originalTaskFields: { name: "Prepare launch" },
  appliedTaskFields: { name: "Prepare launch checklist" },
  appliedTaskVersion: "version-after-apply",
  reversibleUntil: "2099-08-07T00:00:30.000Z",
  undoIdempotencyKey: null,
  undoStatus: "AVAILABLE",
  undoResult: null,
  undoConflicts: [],
  acceptedFields: ["name"],
  rejectedFields: [],
  createdSubtaskIds: [],
  createdSubtaskProvenance: [],
  createdSubtaskVersions: [],
  removedSubtaskIds: [],
  modelVersion: "gpt-evaluation",
  promptVersion: "task-clarification-v1",
  createdAt: "2026-08-07T00:00:00.000Z",
  respondedAt: "2026-08-07T00:01:00.000Z",
  expiresAt: "2099-08-08T00:00:00.000Z",
  auditExpiresAt: "2099-09-06T00:00:00.000Z",
} as TaskClarificationRecommendation;

function request(body: Record<string, unknown> = {}) {
  return new Request("https://tasklaunch.app/api/tasks/task-1/clarify/recommendation-1/apply", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://localhost", "x-firebase-auth": "token" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tasks/[taskId]/clarify/[recommendationId]/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1", email: "user@example.com", idToken: "token" });
    mocks.getFirebaseAdminDb.mockReturnValue({ name: "db" });
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.loadRecommendation.mockResolvedValue(recommendation);
    mocks.applyRecommendation.mockResolvedValue({ kind: "applied", recommendation });
    mocks.expireRecommendation.mockResolvedValue(true);
    mocks.createFirestoreTaskClarificationRepository.mockReturnValue({
      loadRecommendation: mocks.loadRecommendation,
      applyRecommendation: mocks.applyRecommendation,
      expireRecommendation: mocks.expireRecommendation,
    });
  });

  it("applies only the selected edited supported field with an idempotency key", async () => {
    const result = await POST(
      request({ acceptedFields: ["name"], values: { name: "Draft the launch checklist" }, idempotencyKey: "apply-1" }),
      { params: Promise.resolve({ taskId: "task-1", recommendationId: "recommendation-1" }) }
    );
    const payload = await result.json();

    expect(result.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, recommendation: { applyStatus: "APPLIED" } });
    expect(mocks.applyRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "uid-1",
        recommendationId: "recommendation-1",
        taskId: "task-1",
        sourceTaskVersion: "version-1",
        idempotencyKey: "apply-1",
        patch: { name: "Draft the launch checklist" },
        acceptedFields: ["name"],
      })
    );
  });

  it("rejects review-only fields before any persistence call", async () => {
    const result = await POST(
      request({ acceptedFields: ["definitionOfDone"], values: { definitionOfDone: "Done" }, idempotencyKey: "apply-2" }),
      { params: Promise.resolve({ taskId: "task-1", recommendationId: "recommendation-1" }) }
    );

    expect(result.status).toBe(400);
    expect(mocks.applyRecommendation).not.toHaveBeenCalled();
  });

  it("returns the prior result for a repeated idempotency key", async () => {
    mocks.loadRecommendation.mockResolvedValueOnce(recommendation);
    mocks.applyRecommendation.mockResolvedValueOnce({ kind: "idempotent", recommendation });

    const result = await POST(
      request({ acceptedFields: ["name"], values: { name: "Draft the launch checklist" }, idempotencyKey: "apply-1" }),
      { params: Promise.resolve({ taskId: "task-1", recommendationId: "recommendation-1" }) }
    );
    const payload = await result.json();

    expect(result.status).toBe(200);
    expect(payload.idempotent).toBe(true);
  });

  it("recognizes a replay after the recommendation status is no longer active", async () => {
    mocks.loadRecommendation.mockResolvedValueOnce({ ...recommendation, status: "ACCEPTED" });
    mocks.applyRecommendation.mockResolvedValueOnce({ kind: "idempotent", recommendation: { ...recommendation, status: "ACCEPTED" } });

    const result = await POST(
      request({ acceptedFields: ["name"], values: { name: "Draft the launch checklist" }, idempotencyKey: "apply-1" }),
      { params: Promise.resolve({ taskId: "task-1", recommendationId: "recommendation-1" }) }
    );

    expect(result.status).toBe(200);
    expect(mocks.applyRecommendation).toHaveBeenCalledTimes(1);
  });

  it("returns the approved stale response without applying a Task change", async () => {
    mocks.applyRecommendation.mockResolvedValueOnce({ kind: "stale" });

    const result = await POST(
      request({ acceptedFields: ["name"], values: { name: "Draft the launch checklist" }, idempotencyKey: "apply-2" }),
      { params: Promise.resolve({ taskId: "task-1", recommendationId: "recommendation-1" }) }
    );

    expect(result.status).toBe(409);
  });

  it("accepts selected edited recommendation subtasks as a separate apply field", async () => {
    const result = await POST(
      request({
        acceptedFields: ["subtasks"],
        values: { subtasks: [{ id: "subtask-1", title: "Open the launch checklist", estimatedMinutes: 10 }] },
        idempotencyKey: "apply-subtasks-1",
      }),
      { params: Promise.resolve({ taskId: "task-1", recommendationId: "recommendation-1" }) }
    );

    expect(result.status).toBe(200);
    expect(mocks.applyRecommendation).toHaveBeenCalledWith(expect.objectContaining({ patch: {}, subtasks: [{ id: "subtask-1", title: "Open the launch checklist", estimatedMinutes: 10 }] }));
  });
});
