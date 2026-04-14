import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyArchieRequestUser = vi.fn();
const loadArchieUserPlan = vi.fn();
const getLatestOpenArchieDraft = vi.fn();
const createArchieErrorResponse = vi.fn((error: unknown) => {
  const typedError = error as Error & { code?: string; status?: number };
  return Response.json({ error: typedError.message || String(error), code: typedError.code || "archie/internal" }, { status: typedError.status || 500 });
});

vi.mock("../../shared", () => ({
  verifyArchieRequestUser,
  loadArchieUserPlan,
  assertCanUseArchieAi: (plan: string) => {
    if (plan === "pro") return;
    const error = new Error(
      "I can answer product questions on Free. Workflow recommendations, draft changes, and AI-refined responses are included with Pro."
    ) as Error & { code: string; status: number };
    error.code = "archie/pro-required";
    error.status = 403;
    throw error;
  },
  getLatestOpenArchieDraft,
  createArchieErrorResponse,
}));

describe("GET /api/archie/recommendations/latest", () => {
  beforeEach(() => {
    verifyArchieRequestUser.mockReset();
    loadArchieUserPlan.mockReset().mockResolvedValue("pro");
    getLatestOpenArchieDraft.mockReset();
    createArchieErrorResponse.mockClear();
  });

  it("returns the latest open draft with a review action", async () => {
    verifyArchieRequestUser.mockResolvedValue({ uid: "user-1" });
    getLatestOpenArchieDraft.mockResolvedValue({
      id: "draft-1",
      kind: "workflow_adjustment",
      summary: "Summary",
      reasoning: "Reasoning",
      evidence: [],
      proposedChanges: [],
      createdAt: 123,
      status: "draft",
      sessionId: "session-1",
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/archie/recommendations/latest"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.draft?.id).toBe("draft-1");
    expect(json.sessionId).toBe("session-1");
    expect(json.suggestedAction).toEqual({
      kind: "reviewDraft",
      label: "Reopen Last Draft",
      draftId: "draft-1",
    });
  });

  it("returns null when no open draft exists", async () => {
    verifyArchieRequestUser.mockResolvedValue({ uid: "user-1" });
    getLatestOpenArchieDraft.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/archie/recommendations/latest"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ draft: null });
  });

  it("denies Free users before loading drafts", async () => {
    verifyArchieRequestUser.mockResolvedValue({ uid: "user-1" });
    loadArchieUserPlan.mockResolvedValue("free");

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/archie/recommendations/latest"));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.code).toBe("archie/pro-required");
    expect(getLatestOpenArchieDraft).not.toHaveBeenCalled();
  });
});
