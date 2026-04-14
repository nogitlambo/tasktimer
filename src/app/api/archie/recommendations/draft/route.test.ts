import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyArchieRequestUser = vi.fn();
const loadArchieUserPlan = vi.fn();
const loadArchieWorkspaceContext = vi.fn();
const buildDraft = vi.fn((seed) => ({
  ...seed,
  id: "draft-1",
  createdAt: 123,
  status: "draft",
}));
const saveArchieDraft = vi.fn();
const buildRecommendationDraft = vi.fn();
const createArchieErrorResponse = vi.fn((error: unknown) => {
  const typedError = error as Error & { code?: string; status?: number };
  return Response.json({ error: typedError.message || String(error), code: typedError.code || "archie/internal" }, { status: typedError.status || 500 });
});

vi.mock("../../shared", () => ({
  verifyArchieRequestUser,
  loadArchieUserPlan,
  loadArchieWorkspaceContext,
  buildDraft,
  saveArchieDraft,
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

vi.mock("@/app/tasktimer/lib/archieEngine", () => ({
  buildRecommendationDraft,
}));

function createRequest() {
  return new Request("http://localhost/api/archie/recommendations/draft", {
    method: "POST",
    body: JSON.stringify({
      message: "Recommend a better workflow.",
      activePage: "tasks",
      focusSessionNotesByTaskId: {},
    }),
  });
}

describe("POST /api/archie/recommendations/draft", () => {
  beforeEach(() => {
    verifyArchieRequestUser.mockReset().mockResolvedValue({ uid: "user-1" });
    loadArchieUserPlan.mockReset();
    loadArchieWorkspaceContext.mockReset().mockResolvedValue({});
    buildDraft.mockClear();
    saveArchieDraft.mockReset();
    buildRecommendationDraft.mockReset().mockReturnValue({
      kind: "workflow_adjustment",
      summary: "Summary",
      reasoning: "Reasoning",
      evidence: [],
      proposedChanges: [],
    });
    createArchieErrorResponse.mockClear();
  });

  it("denies Free users before building or saving a draft", async () => {
    loadArchieUserPlan.mockResolvedValue("free");

    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.code).toBe("archie/pro-required");
    expect(loadArchieWorkspaceContext).not.toHaveBeenCalled();
    expect(buildRecommendationDraft).not.toHaveBeenCalled();
    expect(saveArchieDraft).not.toHaveBeenCalled();
  });

  it("allows Pro users to build and save a draft", async () => {
    loadArchieUserPlan.mockResolvedValue("pro");

    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.draft.id).toBe("draft-1");
    expect(loadArchieWorkspaceContext).toHaveBeenCalled();
    expect(saveArchieDraft).toHaveBeenCalledWith("user-1", expect.objectContaining({ id: "draft-1" }));
  });
});
