import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provider: {
    interpretImage: vi.fn(),
    extractTyped: vi.fn(),
  },
  store: {
    saveSession: vi.fn(),
    getSession: vi.fn(),
  },
  workspace: {
    loadTasks: vi.fn(),
    loadTaskStatusMeta: vi.fn(),
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

vi.mock("@/app/brain-dump/lib/brainDumpWorkspaceStore", () => ({
  createFirestoreBrainDumpWorkspaceRepository: () => mocks.workspace,
}));

import { OPTIONS, POST } from "./route";

function imageRequest(body: Record<string, unknown>, origin = "https://localhost") {
  return new Request("https://tasklaunch.app/api/brain-dump/images/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-firebase-auth": "token",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/brain-dump/images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({
      uid: "uid-1",
      email: "user@example.com",
      idToken: "token",
    });
    mocks.provider.interpretImage.mockResolvedValue({
      text: "Whiteboard says renew passport and book a dentist appointment.",
    });
    mocks.provider.extractTyped.mockResolvedValue({
      items: [
        {
          itemType: "task",
          title: "Renew passport",
          sourceEvidence: ["renew passport"],
          confidence: 0.92,
          ambiguityFlags: [],
        },
      ],
    });
    mocks.workspace.loadTasks.mockResolvedValue([]);
    mocks.workspace.loadTaskStatusMeta.mockResolvedValue({});
  });

  it("allows native preflight requests with authenticated image processing headers", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/brain-dump/images/", {
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

  it("turns one user-owned image and instruction into a normal review session", async () => {
    const response = await POST(
      imageRequest({
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        mimeType: "image/png",
        sizeBytes: 512_000,
        instruction: "Ignore the grocery list.",
        timezone: "Australia/Sydney",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.verifyFirebaseRequestUser).toHaveBeenCalled();
    expect(mocks.provider.interpretImage).toHaveBeenCalledWith({
      promptId: "brain-dump-image-interpretation-v1",
      imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
      mimeType: "image/png",
      instruction: "Ignore the grocery list.",
      timezone: "Australia/Sydney",
      uid: "uid-1",
    });
    expect(mocks.provider.extractTyped).toHaveBeenCalledWith({
      promptId: "brain-dump-v1",
      text: "Whiteboard says renew passport and book a dentist appointment.",
      timezone: "Australia/Sydney",
    });
    expect(mocks.store.saveSession).toHaveBeenCalledWith(expect.objectContaining({ ownerUid: "uid-1", state: "review" }));
    expect(payload).toMatchObject({
      ok: true,
      session: {
        mode: "typed",
        state: "review",
        review: {
          selectedCount: 1,
          items: [{ title: "Renew passport", selected: true, supported: true }],
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("iVBORw0K");
  });

  it("rejects unsupported image types before calling the provider", async () => {
    const response = await POST(
      imageRequest({
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        mimeType: "image/gif",
        sizeBytes: 12_000,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: "Brain Dump images must be JPEG, PNG, or WebP.",
      code: "brain-dump/invalid-input",
    });
    expect(mocks.provider.interpretImage).not.toHaveBeenCalled();
    expect(mocks.provider.extractTyped).not.toHaveBeenCalled();
  });

  it("rejects oversized images before calling the provider", async () => {
    const response = await POST(
      imageRequest({
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        mimeType: "image/png",
        sizeBytes: 10 * 1024 * 1024 + 1,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: "Brain Dump images must be 10 MB or smaller.",
      code: "brain-dump/invalid-input",
    });
    expect(mocks.provider.interpretImage).not.toHaveBeenCalled();
  });

  it("rejects empty or unreadable image data before creating a session", async () => {
    const response = await POST(
      imageRequest({
        imageBase64: "",
        mimeType: "image/png",
        sizeBytes: 0,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: "Choose an image before processing.",
      code: "brain-dump/invalid-input",
    });
    expect(mocks.store.saveSession).not.toHaveBeenCalled();
  });

  it("returns actionable unclear-image feedback without creating tasks or sessions", async () => {
    mocks.provider.interpretImage.mockResolvedValueOnce({
      unclear: true,
      feedback: "The image is too blurry. Try a sharper close-up.",
    });

    const response = await POST(
      imageRequest({
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        mimeType: "image/png",
        sizeBytes: 12_000,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      error: "The image is too blurry. Try a sharper close-up.",
      code: "brain-dump/image-unclear",
    });
    expect(mocks.provider.extractTyped).not.toHaveBeenCalled();
    expect(mocks.store.saveSession).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated image processing before provider access", async () => {
    mocks.verifyFirebaseRequestUser.mockRejectedValueOnce(
      Object.assign(new Error("You must be signed in to continue."), {
        status: 401,
        code: "auth/unauthenticated",
      })
    );

    const response = await POST(
      imageRequest({
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        mimeType: "image/png",
        sizeBytes: 12_000,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "You must be signed in to continue.",
      code: "auth/unauthenticated",
    });
    expect(mocks.provider.interpretImage).not.toHaveBeenCalled();
    expect(mocks.store.saveSession).not.toHaveBeenCalled();
  });
});
