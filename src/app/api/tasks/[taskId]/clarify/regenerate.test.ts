import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  loadTaskClarificationPlan: vi.fn(),
  getTaskClarificationQuota: vi.fn(),
  enforceUidRateLimit: vi.fn(),
  getTaskClarificationAIProvider: vi.fn(),
  configuredTaskClarificationOpenAiModel: vi.fn(),
  createFirestoreTaskClarificationRepository: vi.fn(),
  loadRecommendation: vi.fn(),
  claimRecommendationRegeneration: vi.fn(),
  expireRecommendation: vi.fn(),
  loadTask: vi.fn(),
  saveRecommendation: vi.fn(),
  clarifyTask: vi.fn(),
}));

vi.mock("../../../shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/auth")>();
  return { ...actual, verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser };
});
vi.mock("../../../shared/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/rateLimit")>();
  return { ...actual, enforceUidRateLimit: mocks.enforceUidRateLimit };
});
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/taskclarification/lib/taskClarificationEntitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/taskclarification/lib/taskClarificationEntitlements")>();
  return { ...actual, getTaskClarificationQuota: mocks.getTaskClarificationQuota, loadTaskClarificationPlan: mocks.loadTaskClarificationPlan };
});
vi.mock("@/app/taskclarification/lib/taskClarificationProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/taskclarification/lib/taskClarificationProvider")>();
  return { ...actual, configuredTaskClarificationOpenAiModel: mocks.configuredTaskClarificationOpenAiModel, getTaskClarificationAIProvider: mocks.getTaskClarificationAIProvider };
});
vi.mock("@/app/taskclarification/lib/taskClarificationRepository", () => ({
  createFirestoreTaskClarificationRepository: mocks.createFirestoreTaskClarificationRepository,
}));

import type { TaskClarificationRecommendation, TaskClarificationResponse, TaskClarificationTaskContext } from "@/app/taskclarification/lib/taskClarification";
import { POST } from "./regenerate/route";

const response: TaskClarificationResponse = {
  suggestedTitle: "Prepare launch checklist",
  definitionOfDone: "The checklist is ready.",
  firstAction: "Open the checklist.",
  stoppingPoint: "Stop after the first review.",
  estimatedMinutes: 30,
  estimatedRange: { min: 20, max: 40 },
  subtasks: [{ title: "Open the checklist", estimatedMinutes: 5 }],
  clarificationQuestions: [],
  warnings: [],
  reasonCodes: ["TASK_TOO_BROAD"],
  confidence: 0.9,
  ambiguityScore: 0.7,
  initiationDifficultyScore: 0.6,
};

const sourceTask: TaskClarificationTaskContext = {
  taskId: "task-1",
  title: "Prepare launch",
  taskType: "once-off",
  dueDate: "2026-08-10",
  sourceTaskVersion: "version-1",
};

const sourceRecommendation: TaskClarificationRecommendation = {
  id: "recommendation-1",
  userId: "uid-1",
  taskId: "task-1",
  sourceTaskVersion: "version-1",
  status: "ACTIVE",
  originalTitle: "Prepare launch",
  userInstruction: null,
  sourceRecommendationId: null,
  regenerationCount: 0,
  applyIdempotencyKey: null,
  applyStatus: "NOT_APPLIED",
  applyResult: null,
  originalTaskFields: null,
  appliedTaskFields: null,
  appliedTaskVersion: null,
  reversibleUntil: null,
  undoIdempotencyKey: null,
  undoStatus: "NOT_AVAILABLE",
  undoResult: null,
  undoConflicts: [],
  ...response,
  subtasks: response.subtasks.map((subtask, index) => ({ ...subtask, id: `subtask-${index + 1}` })),
  acceptedFields: [],
  rejectedFields: [],
  createdSubtaskIds: [],
  createdSubtaskProvenance: [],
  createdSubtaskVersions: [],
  removedSubtaskIds: [],
  modelVersion: "gpt-evaluation",
  promptVersion: "task-clarification-v1",
  createdAt: "2026-08-07T00:00:00.000Z",
  respondedAt: null,
  expiresAt: "2099-08-08T00:00:00.000Z",
  auditExpiresAt: "2099-09-06T00:00:00.000Z",
};

function request(body: Record<string, unknown> = {}) {
  return new Request("https://tasklaunch.app/api/tasks/task-1/clarify/regenerate", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://localhost", "x-firebase-auth": "token" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tasks/[taskId]/clarify/regenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1", email: "user@example.com", idToken: "token" });
    mocks.getFirebaseAdminDb.mockReturnValue({ name: "db" });
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.loadTaskClarificationPlan.mockResolvedValue("free");
    mocks.getTaskClarificationQuota.mockReturnValue(5);
    mocks.enforceUidRateLimit.mockResolvedValue(undefined);
    mocks.configuredTaskClarificationOpenAiModel.mockReturnValue("gpt-evaluation");
    mocks.loadRecommendation.mockResolvedValue(sourceRecommendation);
    mocks.claimRecommendationRegeneration.mockResolvedValue(sourceRecommendation);
    mocks.expireRecommendation.mockResolvedValue(true);
    mocks.loadTask.mockResolvedValue(sourceTask);
    mocks.saveRecommendation.mockResolvedValue(undefined);
    mocks.clarifyTask.mockResolvedValue(response);
    mocks.getTaskClarificationAIProvider.mockReturnValue({ clarifyTask: mocks.clarifyTask });
    mocks.createFirestoreTaskClarificationRepository.mockReturnValue({
      loadRecommendation: mocks.loadRecommendation,
      claimRecommendationRegeneration: mocks.claimRecommendationRegeneration,
      expireRecommendation: mocks.expireRecommendation,
      loadTask: mocks.loadTask,
      saveRecommendation: mocks.saveRecommendation,
    });
  });

  it("creates one linked recommendation with revised instructions", async () => {
    const result = await POST(
      request({ recommendationId: "recommendation-1", instruction: "Use a 15-minute first step.", timezone: "Australia/Sydney" }),
      { params: Promise.resolve({ taskId: "task-1" }) }
    );
    const payload = await result.json();

    expect(result.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, recommendation: { sourceRecommendationId: "recommendation-1" } });
    expect(mocks.claimRecommendationRegeneration).toHaveBeenCalledWith("uid-1", "recommendation-1");
    expect(mocks.clarifyTask).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "task-1", userInstruction: "Use a 15-minute first step." })
    );
    expect(mocks.saveRecommendation).toHaveBeenCalledWith(
      "uid-1",
      expect.objectContaining({ sourceRecommendationId: "recommendation-1", regenerationCount: 1, userInstruction: "Use a 15-minute first step." })
    );
  });

  it("rejects a second regeneration before invoking the provider", async () => {
    mocks.claimRecommendationRegeneration.mockResolvedValueOnce(null);

    const result = await POST(request({ recommendationId: "recommendation-1" }), { params: Promise.resolve({ taskId: "task-1" }) });

    expect(result.status).toBe(409);
    expect(mocks.clarifyTask).not.toHaveBeenCalled();
    expect(mocks.saveRecommendation).not.toHaveBeenCalled();
  });

  it("rejects an expired recommendation before claiming regeneration", async () => {
    mocks.loadRecommendation.mockResolvedValueOnce({ ...sourceRecommendation, expiresAt: "2020-01-01T00:00:00.000Z" });

    const result = await POST(request({ recommendationId: "recommendation-1" }), { params: Promise.resolve({ taskId: "task-1" }) });

    expect(result.status).toBe(409);
    expect(mocks.expireRecommendation).toHaveBeenCalledWith("uid-1", "recommendation-1", expect.any(Number));
    expect(mocks.claimRecommendationRegeneration).not.toHaveBeenCalled();
    expect(mocks.clarifyTask).not.toHaveBeenCalled();
  });

  it("rejects regeneration when the source Task version is stale", async () => {
    mocks.loadTask.mockResolvedValueOnce({ ...sourceTask, sourceTaskVersion: "version-2" });

    const result = await POST(request({ recommendationId: "recommendation-1" }), { params: Promise.resolve({ taskId: "task-1" }) });

    expect(result.status).toBe(409);
    expect(mocks.claimRecommendationRegeneration).not.toHaveBeenCalled();
    expect(mocks.clarifyTask).not.toHaveBeenCalled();
  });

  it("rejects a recommendation owned by another user", async () => {
    mocks.loadRecommendation.mockResolvedValueOnce({ ...sourceRecommendation, userId: "other-user" });

    const result = await POST(request({ recommendationId: "recommendation-1" }), { params: Promise.resolve({ taskId: "task-1" }) });

    expect(result.status).toBe(404);
    expect(mocks.clarifyTask).not.toHaveBeenCalled();
  });
});
