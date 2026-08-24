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
      bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]),
      contentType: "audio/wav",
      sizeBytes: 12,
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
        storagePath: "users/uid-1/brain-dump-sources/voice-1/recording.wav",
        durationMs: 42_000,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.verifyFirebaseRequestUser).toHaveBeenCalled();
    expect(mocks.provider.transcribeVoice).toHaveBeenCalledWith({
      promptId: "brain-dump-voice-transcription-v1",
      audioBytes: expect.any(Uint8Array),
      mimeType: "audio/wav",
      fileName: "recording.wav",
    });
    expect(payload).toMatchObject({
      ok: true,
      diagnosticId: expect.any(String),
      brainDumpId: "voice-1",
      transcript: "Finish screenshots and call the dentist tomorrow.",
      model: "gpt-4o-mini-transcribe",
      mimeType: "audio/wav",
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
      diagnosticId: expect.any(String),
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

  it("returns and safely logs categorized provider failures with their processing stage", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.provider.transcribeVoice.mockRejectedValueOnce(Object.assign(new Error("safe provider message"), {
      status: 422,
      code: "brain-dump/invalid-audio",
      providerStatus: 400,
      providerCode: "invalid_value",
      providerType: "invalid_request_error",
      providerParam: "file",
      providerRequestId: "req_provider_123",
      model: "gpt-4o-mini-transcribe",
    }));

    const response = await POST(
      transcriptionRequest({
        brainDumpId: "voice-1",
        storagePath: "users/uid-1/brain-dump-sources/voice-1/recording.wav",
        durationMs: 42_000,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      error: "safe provider message",
      code: "brain-dump/invalid-audio",
      diagnosticId: expect.any(String),
    });
    expect(logSpy).toHaveBeenCalledWith(
      "[api/brain-dump/transcriptions] Request failed",
      expect.objectContaining({
        diagnosticId: payload.diagnosticId,
        stage: "provider-transcription",
        status: 422,
        code: "brain-dump/invalid-audio",
        model: "gpt-4o-mini-transcribe",
        mimeType: "audio/wav",
        durationBucket: "31-60s",
        fileSizeBucket: "0-1mb",
        providerStatus: 400,
        providerRequestId: "req_provider_123",
      })
    );
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain("uid-1");
    logSpy.mockRestore();
  });

  it("logs the storage stage without exposing raw storage errors", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getObject.mockRejectedValueOnce(new Error("sensitive bucket detail"));

    const response = await POST(
      transcriptionRequest({
        brainDumpId: "voice-1",
        storagePath: "users/uid-1/brain-dump-sources/voice-1/recording.wav",
        durationMs: 10_000,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: "Could not transcribe Brain Dump recording.",
      code: "internal",
      diagnosticId: expect.any(String),
    });
    expect(logSpy).toHaveBeenCalledWith(
      "[api/brain-dump/transcriptions] Request failed",
      expect.objectContaining({ stage: "storage-read", code: "internal" })
    );
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain("sensitive bucket detail");
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain("uid-1");
    logSpy.mockRestore();
  });

  it("keeps a successful transcript when source cleanup is deferred and logs only safe metadata", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.deleteObject.mockRejectedValueOnce(new Error("sensitive deletion detail"));

    const response = await POST(
      transcriptionRequest({
        brainDumpId: "voice-1",
        storagePath: "users/uid-1/brain-dump-sources/voice-1/recording.wav",
        durationMs: 10_000,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.transcript).toBe("Finish screenshots and call the dentist tomorrow.");
    expect(warnSpy).toHaveBeenCalledWith(
      "[api/brain-dump/transcriptions] Recovery action deferred",
      expect.objectContaining({
        diagnosticId: payload.diagnosticId,
        stage: "source-cleanup-failed",
        mimeType: "audio/wav",
        durationBucket: "0-30s",
        fileSizeBucket: "0-1mb",
      })
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("sensitive deletion detail");
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("uid-1");
    warnSpy.mockRestore();
  });
});
