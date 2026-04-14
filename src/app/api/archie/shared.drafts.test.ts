import { describe, expect, it, vi, beforeEach } from "vitest";

const getFirebaseAdminDb = vi.fn();

vi.mock("@/lib/firebaseAdmin", () => ({
  getFirebaseAdminDb,
  getFirebaseAdminAuth: vi.fn(),
  hasFirebaseAdminCredentialConfig: vi.fn(() => true),
  canUseFirebaseAdminDefaultCredentials: vi.fn(() => true),
}));

function createDbWithDrafts(
  docs: Array<{
    id: string;
    summary: string;
    createdAt: number;
    status?: "draft" | "applied" | "discarded";
    sessionId?: string | null;
    proposedChanges?: Array<Record<string, unknown>>;
  }>
) {
  return {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            get: vi.fn(async () => ({
              docs: docs.map((entry) => ({
                id: entry.id,
                data: () => ({
                  id: entry.id,
                  kind: "workflow_adjustment",
                  summary: entry.summary,
                  reasoning: "Reasoning",
                  evidence: [],
                  proposedChanges: entry.proposedChanges ?? [],
                  createdAt: entry.createdAt,
                  status: entry.status ?? "draft",
                  sessionId: entry.sessionId ?? null,
                }),
              })),
            })),
          })),
          doc: vi.fn((draftId: string) => ({
            get: vi.fn(async () => {
              const match = docs.find((entry) => entry.id === draftId);
              return {
                exists: !!match,
                data: () =>
                  match
                    ? {
                        id: match.id,
                        kind: "workflow_adjustment",
                        summary: match.summary,
                        reasoning: "Reasoning",
                        evidence: [],
                        proposedChanges: match.proposedChanges ?? [],
                        createdAt: match.createdAt,
                        status: match.status ?? "draft",
                        sessionId: match.sessionId ?? null,
                      }
                    : undefined,
              };
            }),
          })),
        })),
      })),
    })),
  };
}

describe("Archie draft retrieval", () => {
  beforeEach(() => {
    getFirebaseAdminDb.mockReset();
  });

  it("returns the newest open draft", async () => {
    getFirebaseAdminDb.mockReturnValue(
      createDbWithDrafts([
        { id: "draft-applied", summary: "Applied", createdAt: 300, status: "applied" },
        { id: "draft-open", summary: "Open", createdAt: 200, status: "draft", sessionId: "session-1" },
        { id: "draft-older", summary: "Older", createdAt: 100, status: "draft" },
      ])
    );

    const { getLatestOpenArchieDraft } = await import("./shared");
    const draft = await getLatestOpenArchieDraft("user-1");

    expect(draft?.id).toBe("draft-open");
    expect(draft?.sessionId).toBe("session-1");
  });

  it("ignores applied and discarded drafts", async () => {
    getFirebaseAdminDb.mockReturnValue(
      createDbWithDrafts([
        { id: "draft-applied", summary: "Applied", createdAt: 300, status: "applied" },
        { id: "draft-discarded", summary: "Discarded", createdAt: 200, status: "discarded" },
      ])
    );

    const { getLatestOpenArchieDraft } = await import("./shared");
    const draft = await getLatestOpenArchieDraft("user-1");

    expect(draft).toBeNull();
  });

  it("ignores legacy reorder-only drafts", async () => {
    getFirebaseAdminDb.mockReturnValue(
      createDbWithDrafts([
        {
          id: "draft-reorder",
          summary: "Reorder",
          createdAt: 300,
          status: "draft",
          proposedChanges: [{ kind: "reorder_task", taskId: "task-a", beforeOrder: 4, afterOrder: 1 }],
        },
        { id: "draft-schedule", summary: "Schedule", createdAt: 200, status: "draft" },
      ])
    );

    const { getLatestOpenArchieDraft } = await import("./shared");
    const draft = await getLatestOpenArchieDraft("user-1");

    expect(draft?.id).toBe("draft-schedule");
  });
});
