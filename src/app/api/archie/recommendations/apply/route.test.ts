import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyArchieRequestUser = vi.fn();
const loadArchieUserPlan = vi.fn();
const applyArchieDraft = vi.fn();
const enforceUidRateLimit = vi.fn();
const assertArchieEnabled = vi.fn();
const createArchieErrorResponse = vi.fn((error: unknown) => {
  const typedError = error as Error & { code?: string; status?: number };
  return Response.json({ error: typedError.message || String(error), code: typedError.code || "archie/internal" }, { status: typedError.status || 500 });
});

vi.mock("../../shared", () => ({
  assertArchieEnabled,
  verifyArchieRequestUser,
  loadArchieUserPlan,
  applyArchieDraft,
  createArchieErrorResponse,
  assertCanUseArchieAi: (plan: string) => {
    if (plan === "pro") return;
    const error = new Error(
      "I can answer product questions on Free. Workflow recommendations, draft changes, and AI-refined responses are included with Pro."
    ) as Error & { code: string; status: number };
    error.code = "archie/pro-required";
    error.status = 403;
    throw error;
  },
}));

vi.mock("../../../shared/rateLimit", () => ({
  enforceUidRateLimit,
}));

function createRequest() {
  return new Request("http://localhost/api/archie/recommendations/apply", {
    method: "POST",
    body: JSON.stringify({
      draftId: "draft-1",
      decision: "apply",
      sessionId: "session-1",
    }),
  });
}

describe("POST /api/archie/recommendations/apply", () => {
  beforeEach(() => {
    assertArchieEnabled.mockReset();
    verifyArchieRequestUser.mockReset().mockResolvedValue({ uid: "user-1" });
    loadArchieUserPlan.mockReset();
    applyArchieDraft.mockReset().mockResolvedValue({ ok: true, decision: "apply", appliedCount: 1 });
    createArchieErrorResponse.mockClear();
    enforceUidRateLimit.mockReset().mockResolvedValue(undefined);
  });

  it("denies Free users before applying a draft", async () => {
    loadArchieUserPlan.mockResolvedValue("free");

    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.code).toBe("archie/pro-required");
    expect(applyArchieDraft).not.toHaveBeenCalled();
  });

  it("allows Pro users to apply a draft", async () => {
    loadArchieUserPlan.mockResolvedValue("pro");

    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, decision: "apply", appliedCount: 1 });
    expect(applyArchieDraft).toHaveBeenCalledWith("user-1", {
      draftId: "draft-1",
      decision: "apply",
      sessionId: "session-1",
    });
  });
});
