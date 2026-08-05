import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provider: {
    extractTyped: vi.fn(),
  },
  store: {
    saveSession: vi.fn(),
    getSession: vi.fn(),
  },
  verifyFirebaseRequestUser: vi.fn(),
}));

vi.mock("../../shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/auth")>();
  return {
    ...actual,
    verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser,
  };
});

vi.mock("@/app/brain-dump/lib/brainDumpProvider", () => ({
  getBrainDumpAiProvider: () => mocks.provider,
}));

vi.mock("@/app/brain-dump/lib/brainDumpSessionStore", () => ({
  createFirestoreBrainDumpSessionStore: () => mocks.store,
}));

import { OPTIONS, POST } from "./route";

function brainDumpRequest(body: Record<string, unknown>, origin = "https://localhost") {
  return new Request("https://tasklaunch.app/api/brain-dump/sessions/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-firebase-auth": "token",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/brain-dump/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({
      uid: "uid-1",
      email: "user@example.com",
      idToken: "token",
    });
    mocks.provider.extractTyped.mockResolvedValue({
      items: [
        {
          itemType: "task",
          title: "Finish Play Store screenshots",
          sourceEvidence: ["finish the Play Store screenshots"],
          confidence: 0.94,
          ambiguityFlags: [],
        },
        {
          itemType: "task",
          title: "Call dentist",
          sourceEvidence: ["call the dentist before Thursday"],
          confidence: 0.88,
          ambiguityFlags: [],
        },
      ],
    });
  });

  it("allows native preflight requests with the Firebase auth header", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/brain-dump/sessions/", {
        method: "OPTIONS",
        headers: {
          origin: "https://localhost",
          "access-control-request-headers": "content-type,x-firebase-auth",
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Firebase-Auth");
  });

  it("creates a user-scoped review session without returning raw typed input", async () => {
    const response = await POST(
      brainDumpRequest({
        text: "Finish the Play Store screenshots and call the dentist before Thursday.",
        timezone: "Australia/Sydney",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(mocks.verifyFirebaseRequestUser).toHaveBeenCalled();
    expect(mocks.store.saveSession).toHaveBeenCalledWith(expect.objectContaining({ ownerUid: "uid-1", state: "review" }));
    expect(payload).toMatchObject({
      ok: true,
      session: {
        mode: "typed",
        state: "review",
        promptId: "brain-dump-v1",
        review: {
          selectedCount: 2,
          items: [
            { title: "Finish Play Store screenshots", selected: true, supported: true },
            { title: "Call dentist", selected: true, supported: true },
          ],
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("Finish the Play Store screenshots and call the dentist");
  });

  it("returns only the minimum public review item fields", async () => {
    const response = await POST(brainDumpRequest({ text: "Call dentist" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(payload.session.review.items[0]).sort()).toEqual([
      "ambiguityFlags",
      "confidence",
      "date",
      "enrichment",
      "id",
      "itemType",
      "selected",
      "sourceEvidence",
      "supported",
      "title",
      "validationErrors",
    ]);
    expect(payload.session.review.items[0].date).toMatchObject({
      dateSource: "none",
      resolvedDate: null,
      originalDateText: null,
    });
    expect(payload.session.review.items[0].enrichment).toEqual({
      notes: null,
      estimatedDurationMinutes: null,
      priority: null,
      firstAction: null,
    });
    expect(payload.session.review.items[0].validationErrors).toEqual([]);
    expect(payload.session).not.toHaveProperty("ownerUid");
    expect(payload.session).not.toHaveProperty("source");
  });

  it("rejects unauthenticated processing before calling the provider", async () => {
    mocks.verifyFirebaseRequestUser.mockRejectedValueOnce(
      Object.assign(new Error("You must be signed in to continue."), {
        status: 401,
        code: "auth/unauthenticated",
      })
    );

    const response = await POST(brainDumpRequest({ text: "Call dentist" }));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(payload).toEqual({
      error: "You must be signed in to continue.",
      code: "auth/unauthenticated",
    });
    expect(mocks.provider.extractTyped).not.toHaveBeenCalled();
    expect(mocks.store.saveSession).not.toHaveBeenCalled();
  });
});
