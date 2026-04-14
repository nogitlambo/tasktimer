import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyArchieRequestUser = vi.fn();
const getLatestOpenArchieDraft = vi.fn();
const createArchieErrorResponse = vi.fn((error: unknown) => Response.json({ error: String(error) }, { status: 500 }));

vi.mock("../../shared", () => ({
  verifyArchieRequestUser,
  getLatestOpenArchieDraft,
  createArchieErrorResponse,
}));

describe("GET /api/archie/recommendations/latest", () => {
  beforeEach(() => {
    verifyArchieRequestUser.mockReset();
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
});
