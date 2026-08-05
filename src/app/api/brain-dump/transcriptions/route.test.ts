import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provider: {
    transcribeVoice: vi.fn(),
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

import { OPTIONS, POST } from "./route";

function transcriptionRequest(body: Record<string, unknown>, origin = "https://localhost") {
  return new Request("https://tasklaunch.app/api/brain-dump/transcriptions/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-firebase-auth": "token",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/brain-dump/transcriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({
      uid: "uid-1",
      email: "user@example.com",
      idToken: "token",
    });
    mocks.provider.transcribeVoice.mockResolvedValue({
      transcript: "Finish screenshots and call the dentist tomorrow.",
    });
  });

  it("allows native preflight requests with microphone transcription auth headers", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/brain-dump/transcriptions/", {
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

  it("transcribes a user-owned audio recording without creating a review session", async () => {
    const response = await POST(
      transcriptionRequest({
        audioBase64: "UklGRmQAAABXQVZF",
        mimeType: "audio/webm",
        durationMs: 42_000,
        timezone: "Australia/Sydney",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.verifyFirebaseRequestUser).toHaveBeenCalled();
    expect(mocks.provider.transcribeVoice).toHaveBeenCalledWith({
      promptId: "brain-dump-voice-transcription-v1",
      audioBase64: "UklGRmQAAABXQVZF",
      mimeType: "audio/webm",
      timezone: "Australia/Sydney",
      uid: "uid-1",
    });
    expect(payload).toEqual({
      ok: true,
      transcript: "Finish screenshots and call the dentist tomorrow.",
      mimeType: "audio/webm",
      durationMs: 42_000,
    });
    expect(JSON.stringify(payload)).not.toContain("UklGRmQ");
  });

  it("rejects recordings over five minutes before calling the provider", async () => {
    const response = await POST(
      transcriptionRequest({
        audioBase64: "UklGRmQAAABXQVZF",
        mimeType: "audio/webm",
        durationMs: 300_001,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: "Brain Dump voice recordings must be five minutes or shorter.",
      code: "brain-dump/invalid-input",
    });
    expect(mocks.provider.transcribeVoice).not.toHaveBeenCalled();
  });
});
