import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provider: {
    transcribeVoice: vi.fn(),
  },
  verifyFirebaseRequestUser: vi.fn(),
  enforceUidRateLimit: vi.fn(),
  saveSession: vi.fn(),
  getSession: vi.fn(),
  getObject: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("../../shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/auth")>();
  return {
    ...actual,
    verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser,
  };
});

vi.mock("@/app/api/shared/plusEntitlement", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/shared/plusEntitlement")>();
  return { ...actual, assertExecutiveFunctionAvailableForUser: vi.fn(async () => "plus") };
});

vi.mock("@/app/brain-dump/lib/brainDumpProvider", () => ({
  getBrainDumpAiProvider: () => mocks.provider,
}));

vi.mock("@/app/api/shared/rateLimit", () => ({ enforceUidRateLimit: mocks.enforceUidRateLimit }));

vi.mock("@/app/brain-dump/lib/brainDumpSessionStore", () => ({
  createFirestoreBrainDumpSessionStore: () => ({ saveSession: mocks.saveSession, getSession: mocks.getSession }),
}));

vi.mock("@/app/brain-dump/lib/brainDumpVoiceStorage", () => ({
  createFirebaseBrainDumpVoiceSourceStorage: () => ({ getObject: mocks.getObject, deleteObject: mocks.deleteObject }),
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
      model: "gpt-4o-mini-transcribe",
    });
    mocks.getSession.mockResolvedValue(null);
    mocks.getObject.mockResolvedValue({
      bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]),
      contentType: "audio/webm",
      sizeBytes: 8,
      createdAtMs: 1_000,
    });
    mocks.saveSession.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.enforceUidRateLimit.mockResolvedValue(undefined);
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

  it("transcribes a user-owned Storage recording into a transcript-stage session", async () => {
    const response = await POST(
      transcriptionRequest({
        brainDumpId: "voice-1",
        storagePath: "users/uid-1/brain-dump-sources/voice-1/recording.webm",
        durationMs: 42_000,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.verifyFirebaseRequestUser).toHaveBeenCalled();
    expect(mocks.provider.transcribeVoice).toHaveBeenCalledWith({
      promptId: "brain-dump-voice-transcription-v1",
      audioBytes: expect.any(Uint8Array),
      mimeType: "audio/webm",
      fileName: "recording.webm",
    });
    expect(payload).toMatchObject({
      ok: true,
      brainDumpId: "voice-1",
      transcript: "Finish screenshots and call the dentist tomorrow.",
      model: "gpt-4o-mini-transcribe",
      mimeType: "audio/webm",
      durationMs: 42_000,
    });
    expect(mocks.saveSession).toHaveBeenCalledWith(expect.objectContaining({ state: "transcript", mode: "voice" }));
    expect(mocks.deleteObject).toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain("audioBytes");
  });

  it("rejects recordings over five minutes before calling the provider", async () => {
    const response = await POST(
      transcriptionRequest({
        brainDumpId: "voice-1",
        storagePath: "users/uid-1/brain-dump-sources/voice-1/recording.webm",
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

  it("rejects another user's Storage path without reading the object", async () => {
    const response = await POST(
      transcriptionRequest({
        brainDumpId: "voice-1",
        storagePath: "users/uid-2/brain-dump-sources/voice-1/recording.webm",
        durationMs: 10_000,
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.getObject).not.toHaveBeenCalled();
    expect(mocks.provider.transcribeVoice).not.toHaveBeenCalled();
  });

  it("enforces the existing entitlement and transcription rate-limit boundary", async () => {
    await POST(
      transcriptionRequest({
        brainDumpId: "voice-1",
        storagePath: "users/uid-1/brain-dump-sources/voice-1/recording.webm",
        durationMs: 10_000,
      })
    );

    expect(mocks.enforceUidRateLimit).toHaveBeenCalledWith(expect.objectContaining({
      namespace: "brain-dump-transcription",
      uid: "uid-1",
    }));
  });
});
