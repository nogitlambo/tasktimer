import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  enforceUidRateLimit: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  loadTaskClarificationPlan: vi.fn(),
  getTaskClarificationQuota: vi.fn(),
  getTaskClarificationAIProvider: vi.fn(),
  configuredTaskClarificationOpenAiModel: vi.fn(),
  createFirestoreTaskClarificationRepository: vi.fn(),
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
  return {
    ...actual,
    getTaskClarificationQuota: mocks.getTaskClarificationQuota,
    loadTaskClarificationPlan: mocks.loadTaskClarificationPlan,
  };
});
vi.mock("@/app/taskclarification/lib/taskClarificationProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/taskclarification/lib/taskClarificationProvider")>();
  return {
    ...actual,
    configuredTaskClarificationOpenAiModel: mocks.configuredTaskClarificationOpenAiModel,
    getTaskClarificationAIProvider: mocks.getTaskClarificationAIProvider,
  };
});
vi.mock("@/app/taskclarification/lib/taskClarificationRepository", () => ({
  createFirestoreTaskClarificationRepository: mocks.createFirestoreTaskClarificationRepository,
}));

import { ApiRateLimitError } from "../../../shared/rateLimit";
import type { TaskClarificationResponse } from "@/app/taskclarification/lib/taskClarification";
import { TaskClarificationProviderError } from "@/app/taskclarification/lib/taskClarificationProvider";
import { OPTIONS, POST } from "./route";

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

const task = {
  taskId: "task-1",
  title: "Prepare launch",
  taskType: "once-off" as const,
  dueDate: "2026-08-10",
  sourceTaskVersion: "version-1",
};

function request(body: Record<string, unknown> = {}) {
  return new Request("https://tasklaunch.app/api/tasks/task-1/clarify", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://localhost", "x-firebase-auth": "token" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tasks/[taskId]/clarify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1", email: "user@example.com", idToken: "token" });
    mocks.getFirebaseAdminDb.mockReturnValue({ name: "db" });
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.loadTask.mockResolvedValue(task);
    mocks.saveRecommendation.mockResolvedValue(undefined);
    mocks.createFirestoreTaskClarificationRepository.mockReturnValue({
      loadTask: mocks.loadTask,
      saveRecommendation: mocks.saveRecommendation,
    });
    mocks.loadTaskClarificationPlan.mockResolvedValue("free");
    mocks.getTaskClarificationQuota.mockReturnValue(5);
    mocks.enforceUidRateLimit.mockResolvedValue(undefined);
    mocks.configuredTaskClarificationOpenAiModel.mockReturnValue("gpt-evaluation");
    mocks.clarifyTask.mockReset();
    mocks.clarifyTask.mockResolvedValue(response);
    mocks.getTaskClarificationAIProvider.mockReturnValue({ clarifyTask: mocks.clarifyTask });
  });

  it("returns a validated recommendation without mutating the source Task", async () => {
    const result = await POST(request({ timezone: "Australia/Sydney" }), { params: Promise.resolve({ taskId: "task-1" }) });
    const payload = await result.json();

    expect(result.status).toBe(200);
    expect(result.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(payload).toMatchObject({ ok: true, recommendation: { originalTitle: "Prepare launch", status: "ACTIVE" } });
    expect(payload.recommendation).not.toHaveProperty("userId");
    expect(mocks.enforceUidRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "task-clarification-generation", uid: "uid-1", maxEvents: 5 })
    );
    expect(mocks.clarifyTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-1",
        title: "Prepare launch",
        taskType: "once-off",
        dueDate: "2026-08-10",
        timezone: "Australia/Sydney",
        currentDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      })
    );
    expect(mocks.saveRecommendation).toHaveBeenCalledTimes(1);
    expect(mocks.saveRecommendation.mock.calls[0]?.[0]).toBe("uid-1");
    expect(mocks.saveRecommendation.mock.calls[0]?.[1]).toMatchObject({
      sourceTaskVersion: "version-1",
      modelVersion: "gpt-evaluation",
      promptVersion: "task-clarification-v1",
    });
  });

  it("passes a bounded user instruction as a provider constraint", async () => {
    const result = await POST(
      request({ timezone: "Australia/Sydney", instruction: "Keep the first step under 20 minutes." }),
      { params: Promise.resolve({ taskId: "task-1" }) }
    );

    expect(result.status).toBe(200);
    expect(mocks.clarifyTask).toHaveBeenCalledWith(
      expect.objectContaining({ userInstruction: "Keep the first step under 20 minutes." })
    );
    expect(mocks.saveRecommendation.mock.calls[0]?.[1]).toMatchObject({
      userInstruction: "Keep the first step under 20 minutes.",
    });
  });

  it("automatically retries one provider failure before saving the recommendation", async () => {
    mocks.clarifyTask
      .mockRejectedValueOnce(new TaskClarificationProviderError("provider details must stay private"))
      .mockResolvedValueOnce(response);

    const result = await POST(request(), { params: Promise.resolve({ taskId: "task-1" }) });

    expect(result.status).toBe(200);
    expect(mocks.clarifyTask).toHaveBeenCalledTimes(2);
    expect(mocks.saveRecommendation).toHaveBeenCalledTimes(1);
  });

  it("automatically retries one invalid provider response", async () => {
    mocks.clarifyTask
      .mockResolvedValueOnce({ ...response, estimatedRange: { min: 60, max: 20 } })
      .mockResolvedValueOnce(response);

    const result = await POST(request(), { params: Promise.resolve({ taskId: "task-1" }) });

    expect(result.status).toBe(200);
    expect(mocks.clarifyTask).toHaveBeenCalledTimes(2);
    expect(mocks.saveRecommendation).toHaveBeenCalledTimes(1);
  });

  it("rejects an over-limit instruction before invoking the provider", async () => {
    const result = await POST(
      request({ instruction: "x".repeat(281) }),
      { params: Promise.resolve({ taskId: "task-1" }) }
    );
    const payload = await result.json();

    expect(result.status).toBe(400);
    expect(payload).toEqual({
      error: "Task clarification instructions are too long.",
      code: "task-clarification/invalid-instruction",
    });
    expect(mocks.clarifyTask).not.toHaveBeenCalled();
  });

  it("rejects a missing owned Task before invoking the provider", async () => {
    mocks.loadTask.mockResolvedValue(null);

    const result = await POST(request(), { params: Promise.resolve({ taskId: "missing" }) });
    const payload = await result.json();

    expect(result.status).toBe(404);
    expect(payload).toEqual({ error: "Task not found.", code: "task/not-found" });
    expect(mocks.clarifyTask).not.toHaveBeenCalled();
    expect(mocks.saveRecommendation).not.toHaveBeenCalled();
  });

  it("does not persist invalid provider output or expose provider details", async () => {
    mocks.clarifyTask.mockResolvedValue({ ...response, estimatedRange: { min: 60, max: 20 } });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await POST(request(), { params: Promise.resolve({ taskId: "task-1" }) });
    const payload = await result.json();

    expect(result.status).toBe(502);
    expect(mocks.clarifyTask).toHaveBeenCalledTimes(2);
    expect(payload).toEqual({
      error: "TaskLaunch could not prepare a reliable breakdown. Your task has not been changed.",
      code: "task-clarification/provider-invalid",
    });
    expect(mocks.saveRecommendation).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("Prepare launch"));
    consoleError.mockRestore();
  });

  it("returns rate-limit errors before invoking the provider", async () => {
    mocks.enforceUidRateLimit.mockRejectedValueOnce(new ApiRateLimitError("task-clarification/rate-limited", "Slow down."));

    const result = await POST(request(), { params: Promise.resolve({ taskId: "task-1" }) });
    const payload = await result.json();

    expect(result.status).toBe(429);
    expect(payload).toEqual({ error: "Slow down.", code: "task-clarification/rate-limited" });
    expect(mocks.clarifyTask).not.toHaveBeenCalled();
    expect(mocks.saveRecommendation).not.toHaveBeenCalled();
  });

  it("supports authenticated preflight", () => {
    const result = OPTIONS(new Request("https://tasklaunch.app/api/tasks/task-1/clarify", { method: "OPTIONS", headers: { origin: "https://localhost" } }));
    expect(result.status).toBe(204);
    expect(result.headers.get("access-control-allow-origin")).toBe("https://localhost");
  });
});
