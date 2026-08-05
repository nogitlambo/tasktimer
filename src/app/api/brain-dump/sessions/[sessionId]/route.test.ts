import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { GET } from "./route";

describe("GET /api/brain-dump/sessions/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
