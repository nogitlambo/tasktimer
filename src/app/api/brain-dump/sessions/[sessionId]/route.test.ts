import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BrainDumpReviewDate, BrainDumpReviewSession } from "@/app/brain-dump/lib/brainDumpProcessing";

const mocks = vi.hoisted(() => ({
  store: {
    saveSession: vi.fn(),
    getSession: vi.fn(),
  },
  verifyFirebaseRequestUser: vi.fn(),
}));

vi.mock("../../../shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/auth")>();
  return {
    ...actual,
    verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser,
  };
});

vi.mock("@/app/brain-dump/lib/brainDumpSessionStore", () => ({
  createFirestoreBrainDumpSessionStore: () => mocks.store,
}));

import { GET, PATCH } from "./route";

function reviewDate(overrides: Partial<BrainDumpReviewDate> = {}): BrainDumpReviewDate {
  return {
    originalDateText: null,
    dateSource: "none",
    timezone: "Australia/Sydney",
    resolvedDate: null,
    dateConfidence: 0,
    ambiguity: "none",
    ambiguityFlags: [],
    userConfirmedDate: false,
    recurrenceText: null,
    dependencyTimingText: null,
    ...overrides,
  };
}

function reviewSession(): BrainDumpReviewSession {
  return {
    id: "session-1",
    ownerUid: "uid-2",
    mode: "typed",
    state: "review",
    promptId: "brain-dump-v1",
    createdAtMs: 1,
    expiresAtMs: 4_102_444_800_000,
    source: { kind: "typed", rawText: "Prepare investor update" },
    review: {
      selectedCount: 1,
      items: [
        {
          id: "item-1",
          itemType: "task",
          title: "Prepare investor update",
          selected: true,
          sourceEvidence: ["prepare investor update"],
          confidence: 0.88,
          ambiguityFlags: [],
          supported: true,
          date: reviewDate(),
          enrichment: {
            notes: null,
            estimatedDurationMinutes: null,
            priority: null,
            firstAction: null,
          },
          validationErrors: [],
          duplicateWarnings: [],
          duplicateDecision: "undecided",
        },
      ],
    },
  };
}

describe("GET /api/brain-dump/sessions/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({
      uid: "uid-2",
      email: "other@example.com",
      idToken: "token",
    });
  });

  it("does not return another user's review session", async () => {
    mocks.store.getSession.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1", {
        headers: { origin: "https://localhost", "x-firebase-auth": "token" },
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(mocks.store.getSession).toHaveBeenCalledWith("uid-2", "session-1");
    expect(payload).toEqual({ error: "Brain Dump session was not found.", code: "brain-dump/not-found" });
  });

  it("edits optional enrichment and reloads it through the public review interface", async () => {
    let savedSession = reviewSession();
    mocks.store.getSession.mockImplementation(async () => savedSession);
    mocks.store.saveSession.mockImplementation(async (session: BrainDumpReviewSession) => {
      savedSession = session;
    });

    const patchResponse = await PATCH(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "https://localhost",
          "x-firebase-auth": "token",
        },
        body: JSON.stringify({
          itemUpdates: [
            {
              itemId: "item-1",
              enrichment: {
                notes: "Mention onboarding metrics.",
                estimatedDurationMinutes: 45,
                priority: "high",
                firstAction: "Open the draft deck",
              },
            },
          ],
        }),
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const getResponse = await GET(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1", {
        headers: { origin: "https://localhost", "x-firebase-auth": "token" },
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const payload = await getResponse.json();

    expect(patchResponse.status).toBe(200);
    expect(mocks.store.saveSession).toHaveBeenCalled();
    expect(payload.session.review.items[0].enrichment).toEqual({
      notes: "Mention onboarding metrics.",
      estimatedDurationMinutes: 45,
      priority: "high",
      firstAction: "Open the draft deck",
    });
  });

  it("clears optional enrichment values without dropping the review item", async () => {
    let savedSession = reviewSession();
    savedSession.review.items[0].enrichment = {
      notes: "Mention onboarding metrics.",
      estimatedDurationMinutes: 45,
      priority: "high",
      firstAction: "Open the draft deck",
    };
    mocks.store.getSession.mockImplementation(async () => savedSession);
    mocks.store.saveSession.mockImplementation(async (session: BrainDumpReviewSession) => {
      savedSession = session;
    });

    const response = await PATCH(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "https://localhost",
          "x-firebase-auth": "token",
        },
        body: JSON.stringify({
          itemUpdates: [
            {
              itemId: "item-1",
              enrichment: {
                notes: null,
                estimatedDurationMinutes: null,
                priority: null,
                firstAction: null,
              },
            },
          ],
        }),
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.review.items[0]).toMatchObject({
      id: "item-1",
      enrichment: {
        notes: null,
        estimatedDurationMinutes: null,
        priority: null,
        firstAction: null,
      },
    });
  });

  it("attaches validation errors to the affected item without blocking unrelated review items", async () => {
    let savedSession = reviewSession();
    savedSession.review.items.push({
      ...savedSession.review.items[0],
      id: "item-2",
      title: "Send update email",
      sourceEvidence: ["send update email"],
    });
    savedSession.review.selectedCount = 2;
    mocks.store.getSession.mockImplementation(async () => savedSession);
    mocks.store.saveSession.mockImplementation(async (session: BrainDumpReviewSession) => {
      savedSession = session;
    });

    const response = await PATCH(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "https://localhost",
          "x-firebase-auth": "token",
        },
        body: JSON.stringify({
          itemUpdates: [
            { itemId: "item-1", title: "", selected: true },
            { itemId: "item-2", title: "Send update email", selected: true },
          ],
        }),
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.review.items[0].validationErrors).toEqual([
      { field: "title", message: "Enter a task title before creating this item." },
    ]);
    expect(payload.session.review.items[1].validationErrors).toEqual([]);
  });

  it("denies reading an expired review session and redacts raw source", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(10_000));
    mocks.store.getSession.mockResolvedValueOnce({
      ...reviewSession(),
      expiresAtMs: 9_999,
      source: { kind: "typed", rawText: "private stale source" },
    });

    const response = await GET(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1", {
        headers: { origin: "https://localhost", "x-firebase-auth": "token" },
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const payload = await response.json();
    const expiredSession = mocks.store.saveSession.mock.calls[0]?.[0] as BrainDumpReviewSession;

    expect(response.status).toBe(410);
    expect(payload).toEqual({
      error: "Brain Dump session expired. Start a fresh Brain Dump to continue.",
      code: "brain-dump/expired",
    });
    expect(expiredSession).toMatchObject({
      state: "expired",
      source: { kind: "typed", rawText: "" },
    });
    expect(expiredSession.review.items[0].sourceEvidence).toEqual([]);
  });

  it("denies editing an expired review session without reviving stale client state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(10_000));
    mocks.store.getSession.mockResolvedValueOnce({
      ...reviewSession(),
      expiresAtMs: 9_999,
      source: { kind: "typed", rawText: "private stale source" },
    });

    const response = await PATCH(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/session-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "https://localhost",
          "x-firebase-auth": "token",
        },
        body: JSON.stringify({
          itemUpdates: [{ itemId: "item-1", title: "Revived task", selected: true }],
        }),
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const payload = await response.json();
    const expiredSession = mocks.store.saveSession.mock.calls[0]?.[0] as BrainDumpReviewSession;

    expect(response.status).toBe(410);
    expect(payload).toEqual({
      error: "Brain Dump session expired. Start a fresh Brain Dump to continue.",
      code: "brain-dump/expired",
    });
    expect(expiredSession.state).toBe("expired");
    expect(expiredSession.review.items[0]).toMatchObject({
      title: "Prepare investor update",
      selected: false,
      sourceEvidence: [],
    });
  });
});
