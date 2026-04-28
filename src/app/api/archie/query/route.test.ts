import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArchieQueryResponse, ArchieRecommendationDraft } from "@/app/tasktimer/lib/archieAssistant";

const verifyArchieRequestUser = vi.fn();
const loadArchieWorkspaceContext = vi.fn();
const loadArchieUserPlan = vi.fn();
const saveArchieDraft = vi.fn();
const writeArchieSession = vi.fn();
const attachArchieDraftSession = vi.fn();
const buildDraft = vi.fn((seed: Omit<ArchieRecommendationDraft, "id" | "createdAt" | "status">) => ({
  ...seed,
  id: "draft-built",
  createdAt: 123,
  status: "draft" as const,
}));
const buildArchieQueryResponse = vi.fn();
const maybeRefineArchieResponse = vi.fn();
const maybeGenerateArchieDraftSeed = vi.fn();
const enforceUidRateLimit = vi.fn();

vi.mock("../shared", () => ({
  verifyArchieRequestUser,
  loadArchieWorkspaceContext,
  loadArchieUserPlan,
  saveArchieDraft,
  writeArchieSession,
  attachArchieDraftSession,
  buildDraft,
  canUseArchieAi: (plan: string) => plan === "pro",
  buildArchieUpgradeResponse: () => ({
    mode: "fallback",
    message:
      "I can answer product questions on Free. Workflow recommendations, draft changes, and AI-refined responses are included with Pro.",
    citations: [],
    confidence: "high",
    suggestedAction: { kind: "navigate", label: "Upgrade to Pro", href: "/pricing" },
  }),
  createArchieErrorResponse: (error: unknown) => {
    const typedError = error as Error & { code?: string; status?: number };
    return Response.json({ error: typedError.message || String(error), code: typedError.code || "archie/internal" }, { status: typedError.status || 500 });
  },
}));

vi.mock("@/app/tasktimer/lib/archieEngine", () => ({
  buildArchieQueryResponse,
}));

vi.mock("@/app/tasktimer/lib/archieModel", () => ({
  maybeRefineArchieResponse,
  maybeGenerateArchieDraftSeed,
}));

vi.mock("../../shared/rateLimit", () => ({
  enforceUidRateLimit,
}));

function createDraft(): ArchieRecommendationDraft {
  return {
    id: "draft-1",
    kind: "workflow_adjustment",
    summary: "Draft summary",
    reasoning: "Draft reasoning",
    evidence: [],
    proposedChanges: [],
    createdAt: 123,
    status: "draft",
  };
}

function createProductResponse(): ArchieQueryResponse {
  return {
    mode: "product_answer",
    message: "Open Settings, then Appearance.",
    citations: [
      {
        id: "faq-settings-appearance-theme",
        title: "Settings > Appearance",
        section: "Where do I change the theme?",
        route: "/settings",
        settingsPane: "appearance",
        sourceKind: "settings",
      },
    ],
    confidence: "high",
  };
}

function createWorkflowResponse(): ArchieQueryResponse {
  const draft = createDraft();
  return {
    mode: "workflow_advice",
    message: draft.summary,
    citations: [],
    confidence: "medium",
    suggestedAction: { kind: "reviewDraft", label: "Review Draft", draftId: draft.id },
    draftId: draft.id,
    draft,
  };
}

function createRequest(message = "Where do I change the theme?") {
  return new Request("http://localhost/api/archie/query", {
    method: "POST",
    body: JSON.stringify({
      message,
      activePage: "settings",
      focusSessionNotesByTaskId: {},
    }),
  });
}

describe("POST /api/archie/query", () => {
  beforeEach(() => {
    verifyArchieRequestUser.mockReset().mockResolvedValue({ uid: "user-1" });
    loadArchieWorkspaceContext.mockReset().mockResolvedValue({});
    loadArchieUserPlan.mockReset();
    saveArchieDraft.mockReset();
    writeArchieSession.mockReset().mockResolvedValue("session-1");
    attachArchieDraftSession.mockReset();
    buildDraft.mockClear();
    buildArchieQueryResponse.mockReset();
    maybeRefineArchieResponse.mockReset();
    maybeGenerateArchieDraftSeed.mockReset();
    enforceUidRateLimit.mockReset().mockResolvedValue(undefined);
  });

  it("returns deterministic product answers for Free users without Genkit refinement", async () => {
    const baseResponse = createProductResponse();
    loadArchieUserPlan.mockResolvedValue("free");
    buildArchieQueryResponse.mockReturnValue(baseResponse);

    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(baseResponse);
    expect(maybeRefineArchieResponse).not.toHaveBeenCalled();
    expect(saveArchieDraft).not.toHaveBeenCalled();
    expect(writeArchieSession).not.toHaveBeenCalled();
  });

  it("returns deterministic fallback answers for Free users without Genkit refinement", async () => {
    const baseResponse: ArchieQueryResponse = {
      mode: "fallback",
      message: "I am not confident enough to answer that from current TaskLaunch documentation.",
      citations: [],
      confidence: "low",
    };
    loadArchieUserPlan.mockResolvedValue("free");
    buildArchieQueryResponse.mockReturnValue(baseResponse);

    const { POST } = await import("./route");
    const response = await POST(createRequest("Can TaskLaunch connect Slack?"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(baseResponse);
    expect(maybeRefineArchieResponse).not.toHaveBeenCalled();
    expect(saveArchieDraft).not.toHaveBeenCalled();
  });

  it("returns an upgrade response for Free workflow advice and does not save a draft", async () => {
    loadArchieUserPlan.mockResolvedValue("free");
    buildArchieQueryResponse.mockReturnValue(createWorkflowResponse());

    const { POST } = await import("./route");
    const response = await POST(createRequest("What should I work on next?"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.suggestedAction).toEqual({ kind: "navigate", label: "Upgrade to Pro", href: "/pricing" });
    expect(json.message).toContain("included with Pro");
    expect(json.draft).toBeUndefined();
    expect(maybeRefineArchieResponse).not.toHaveBeenCalled();
    expect(saveArchieDraft).not.toHaveBeenCalled();
    expect(writeArchieSession).not.toHaveBeenCalled();
  });

  it("allows Pro users to save drafts and use Genkit refinement", async () => {
    const baseResponse = createWorkflowResponse();
    const generatedSeed = {
      kind: "schedule_adjustment" as const,
      summary: "AI-planned draft summary",
      reasoning: "AI draft reasoning",
      evidence: ["AI evidence"],
      proposedChanges: [],
    };
    const generatedDraft = {
      ...generatedSeed,
      id: "draft-built",
      createdAt: 123,
      status: "draft" as const,
    };
    loadArchieUserPlan.mockResolvedValue("pro");
    buildArchieQueryResponse.mockReturnValue(baseResponse);
    maybeGenerateArchieDraftSeed.mockResolvedValue(generatedSeed);
    maybeRefineArchieResponse.mockResolvedValue({ ...generatedDraft, mode: "workflow_advice" } as unknown as ArchieQueryResponse);

    const { POST } = await import("./route");
    const response = await POST(createRequest("What should I work on next?"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(maybeGenerateArchieDraftSeed).toHaveBeenCalledWith({
      userMessage: "What should I work on next?",
      context: {},
      fallbackSeed: {
        kind: baseResponse.draft!.kind,
        summary: baseResponse.draft!.summary,
        reasoning: baseResponse.draft!.reasoning,
        evidence: baseResponse.draft!.evidence,
        proposedChanges: baseResponse.draft!.proposedChanges,
        sessionId: baseResponse.draft!.sessionId,
      },
    });
    expect(saveArchieDraft).toHaveBeenCalledWith("user-1", expect.objectContaining({ id: "draft-built" }));
    expect(maybeRefineArchieResponse).toHaveBeenCalledWith({
      userMessage: "What should I work on next?",
      baseResponse: expect.objectContaining({
        draftId: "draft-built",
        draft: expect.objectContaining({ id: "draft-built", summary: "AI-planned draft summary" }),
      }),
      draft: expect.objectContaining({ id: "draft-built", summary: "AI-planned draft summary" }),
    });
    expect(writeArchieSession).toHaveBeenCalled();
    expect(attachArchieDraftSession).toHaveBeenCalledWith("user-1", "draft-built", "session-1");
    expect(json.sessionId).toBe("session-1");
  });

  it("returns 429 when the Archie query limit is exceeded", async () => {
    const error = new Error("Too many Archie requests recently. Please wait before trying again.") as Error & {
      code: string;
      status: number;
    };
    error.code = "archie/query-rate-limited";
    error.status = 429;
    enforceUidRateLimit.mockRejectedValueOnce(error);

    const { POST } = await import("./route");
    const response = await POST(createRequest("What should I work on next?"));
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.code).toBe("archie/query-rate-limited");
    expect(loadArchieWorkspaceContext).not.toHaveBeenCalled();
  });
});
