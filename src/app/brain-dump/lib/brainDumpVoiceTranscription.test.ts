import { describe, expect, it, vi } from "vitest";

import {
  BrainDumpProviderValidationError,
  processVoiceTranscriptBrainDump,
  transcribeVoiceBrainDump,
  type BrainDumpAiProvider,
  type BrainDumpReviewSession,
  type BrainDumpSessionStore,
  type BrainDumpVoiceSourceStorage,
} from "./brainDumpProcessing";

function validWebmBytes(size = 8) {
  const bytes = new Uint8Array(Math.max(4, size));
  bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
  return bytes;
}

function validWavBytes(size = 48) {
  const bytes = new Uint8Array(Math.max(12, size));
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);
  return bytes;
}

function createHarness(overrides?: { contentType?: string; sizeBytes?: number; bytes?: Uint8Array }) {
  const sessions = new Map<string, BrainDumpReviewSession>();
  const store: BrainDumpSessionStore = {
    saveSession: vi.fn(async (session) => {
      sessions.set(`${session.ownerUid}:${session.id}`, structuredClone(session));
    }),
    getSession: vi.fn(async (uid, sessionId) => sessions.get(`${uid}:${sessionId}`) || null),
  };
  const bytes = overrides?.bytes || validWavBytes();
  const storage: BrainDumpVoiceSourceStorage = {
    getObject: vi.fn(async () => ({
      bytes,
      contentType: overrides?.contentType || "audio/wav",
      sizeBytes: overrides?.sizeBytes ?? bytes.byteLength,
      createdAtMs: 900,
    })),
    deleteObject: vi.fn(async () => {}),
  };
  const provider: BrainDumpAiProvider = {
    extractTyped: vi.fn(),
    transcribeVoice: vi.fn(async () => ({
      transcript: "Call the dentist tomorrow.",
      model: "gpt-4o-mini-transcribe",
    })),
  };
  return { sessions, store, storage, provider };
}

const ownedPath = "users/uid-1/brain-dump-sources/voice-1/recording.wav";

describe("Brain Dump voice transcription", () => {
  it("transcribes authenticated user-owned audio, stores an editable transcript, and deletes source audio", async () => {
    const harness = createHarness();

    const result = await transcribeVoiceBrainDump({
      uid: "uid-1",
      brainDumpId: "voice-1",
      storagePath: ownedPath,
      durationMs: 42_000,
      provider: harness.provider,
      store: harness.store,
      storage: harness.storage,
      now: () => 1_000,
    });

    expect(result).toMatchObject({
      brainDumpId: "voice-1",
      transcript: "Call the dentist tomorrow.",
      model: "gpt-4o-mini-transcribe",
      mimeType: "audio/wav",
      durationMs: 42_000,
    });
    expect(harness.provider.transcribeVoice).toHaveBeenCalledWith({
      promptId: "brain-dump-voice-transcription-v1",
      audioBytes: expect.any(Uint8Array),
      mimeType: "audio/wav",
      fileName: "recording.wav",
    });
    expect(harness.provider.extractTyped).not.toHaveBeenCalled();
    expect(harness.storage.deleteObject).toHaveBeenCalledWith(ownedPath);
    expect(harness.sessions.get("uid-1:voice-1")).toMatchObject({
      ownerUid: "uid-1",
      mode: "voice",
      state: "transcript",
      source: {
        kind: "voice",
        rawText: "Call the dentist tomorrow.",
        files: [{ path: ownedPath, cleanupStatus: "deleted" }],
      },
      review: { selectedCount: 0, items: [] },
    });
  });

  it("rejects another user's storage path before reading audio or calling OpenAI", async () => {
    const harness = createHarness();

    await expect(
      transcribeVoiceBrainDump({
        uid: "uid-2",
        brainDumpId: "voice-1",
        storagePath: ownedPath,
        durationMs: 10_000,
        provider: harness.provider,
        store: harness.store,
        storage: harness.storage,
      })
    ).rejects.toMatchObject({ code: "brain-dump/invalid-input", status: 400 });

    expect(harness.storage.getObject).not.toHaveBeenCalled();
    expect(harness.provider.transcribeVoice).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid MIME", { contentType: "audio/mpeg" }, 10_000],
    ["oversized audio", { sizeBytes: 10 * 1024 * 1024 + 1 }, 10_000],
    ["over-duration audio", {}, 300_001],
  ])("rejects %s before transcription", async (_label, sourceOverrides, durationMs) => {
    const harness = createHarness(sourceOverrides);

    await expect(
      transcribeVoiceBrainDump({
        uid: "uid-1",
        brainDumpId: "voice-1",
        storagePath: ownedPath,
        durationMs,
        provider: harness.provider,
        store: harness.store,
        storage: harness.storage,
      })
    ).rejects.toMatchObject({ code: "brain-dump/invalid-input", status: 400 });

    expect(harness.provider.transcribeVoice).not.toHaveBeenCalled();
  });

  it("accepts WebM recordings with browser-provided codec parameters", async () => {
    const harness = createHarness({ contentType: "audio/webm;codecs=opus", bytes: validWebmBytes() });

    await transcribeVoiceBrainDump({
      uid: "uid-1",
      brainDumpId: "voice-1",
      storagePath: ownedPath,
      durationMs: 10_000,
      provider: harness.provider,
      store: harness.store,
      storage: harness.storage,
    });

    expect(harness.provider.transcribeVoice).toHaveBeenCalledWith(expect.objectContaining({
      mimeType: "audio/webm;codecs=opus",
      fileName: "recording.webm",
    }));
  });

  it("keeps a retryable transcript-stage session, deletes temporary audio, and creates no review items when the provider fails", async () => {
    const harness = createHarness();
    vi.mocked(harness.provider.transcribeVoice!).mockRejectedValueOnce(Object.assign(new Error("provider detail"), { code: "provider" }));

    await expect(
      transcribeVoiceBrainDump({
        uid: "uid-1",
        brainDumpId: "voice-1",
        storagePath: ownedPath,
        durationMs: 10_000,
        provider: harness.provider,
        store: harness.store,
        storage: harness.storage,
      })
    ).rejects.toThrow("provider detail");

    expect(harness.sessions.get("uid-1:voice-1")).toMatchObject({
      state: "transcribing",
      source: { rawText: "", files: [{ cleanupStatus: "deleted" }] },
      review: { items: [] },
    });
    expect(harness.storage.deleteObject).toHaveBeenCalledWith(ownedPath);
    expect(harness.provider.extractTyped).not.toHaveBeenCalled();
  });

  it("reports the failing stage and preserves the provider failure when recovery persistence also fails", async () => {
    const harness = createHarness();
    const stages: string[] = [];
    vi.mocked(harness.provider.transcribeVoice!).mockRejectedValueOnce(Object.assign(new Error("provider detail"), {
      code: "brain-dump/provider-temporary",
      status: 502,
    }));
    vi.mocked(harness.store.saveSession)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("recovery persistence detail"));

    await expect(
      transcribeVoiceBrainDump({
        uid: "uid-1",
        brainDumpId: "voice-1",
        storagePath: ownedPath,
        durationMs: 10_000,
        provider: harness.provider,
        store: harness.store,
        storage: harness.storage,
        onStage: (stage) => stages.push(stage),
      })
    ).rejects.toMatchObject({
      message: "provider detail",
      transcriptionStage: "provider-transcription",
    });

    expect(stages).toContain("storage-read");
    expect(stages).toContain("audio-validation");
    expect(stages).toContain("provider-transcription");
    expect(stages).toContain("recovery-session-save-failed");
  });

  it("completes transcription and reports deferred cleanup when source deletion fails", async () => {
    const harness = createHarness();
    const stages: string[] = [];
    vi.mocked(harness.storage.deleteObject).mockRejectedValueOnce(new Error("storage deletion failed"));

    const result = await transcribeVoiceBrainDump({
      uid: "uid-1",
      brainDumpId: "voice-1",
      storagePath: ownedPath,
      durationMs: 10_000,
      provider: harness.provider,
      store: harness.store,
      storage: harness.storage,
      onStage: (stage) => stages.push(stage),
    });

    expect(result.transcript).toBe("Call the dentist tomorrow.");
    expect(stages).toContain("source-cleanup-failed");
    expect(harness.sessions.get("uid-1:voice-1")?.source.files?.[0]).toMatchObject({
      cleanupStatus: "delete_failed",
      cleanupErrorCode: "storage-delete-failed",
    });
  });

  it("rejects an empty provider transcript and never starts extraction", async () => {
    const harness = createHarness();
    vi.mocked(harness.provider.transcribeVoice!).mockResolvedValueOnce({ transcript: "", model: "gpt-4o-mini-transcribe" });

    await expect(
      transcribeVoiceBrainDump({
        uid: "uid-1",
        brainDumpId: "voice-1",
        storagePath: ownedPath,
        durationMs: 10_000,
        provider: harness.provider,
        store: harness.store,
        storage: harness.storage,
      })
    ).rejects.toBeInstanceOf(BrainDumpProviderValidationError);

    expect(harness.provider.extractTyped).not.toHaveBeenCalled();
  });

  it("saves the edited transcript before sending that exact text through the existing extraction pipeline", async () => {
    const harness = createHarness();
    await transcribeVoiceBrainDump({
      uid: "uid-1",
      brainDumpId: "voice-1",
      storagePath: ownedPath,
      durationMs: 10_000,
      provider: harness.provider,
      store: harness.store,
      storage: harness.storage,
      now: () => 1_000,
    });
    vi.mocked(harness.provider.extractTyped).mockResolvedValueOnce({
      items: [{
        itemType: "task",
        title: "Book dentist",
        sourceEvidence: ["Book the dentist on Friday"],
        confidence: 0.95,
        ambiguityFlags: [],
        dateSource: "explicit",
        dueDateText: "Friday",
      }],
    });

    const session = await processVoiceTranscriptBrainDump({
      uid: "uid-1",
      sessionId: "voice-1",
      text: "Book the dentist on Friday",
      timezone: "Australia/Sydney",
      provider: harness.provider,
      store: harness.store,
      now: () => 2_000,
    });

    expect(harness.provider.extractTyped).toHaveBeenCalledWith({
      promptId: "brain-dump-v1",
      text: "Book the dentist on Friday",
      timezone: "Australia/Sydney",
    });
    expect(session).toMatchObject({
      id: "voice-1",
      mode: "voice",
      state: "review",
      promptId: "brain-dump-v1",
      source: { kind: "voice", rawText: "Book the dentist on Friday" },
    });
  });

  it("persists transcript edits even when extraction fails", async () => {
    const harness = createHarness();
    await transcribeVoiceBrainDump({
      uid: "uid-1",
      brainDumpId: "voice-1",
      storagePath: ownedPath,
      durationMs: 10_000,
      provider: harness.provider,
      store: harness.store,
      storage: harness.storage,
    });
    vi.mocked(harness.provider.extractTyped).mockRejectedValueOnce(new Error("extraction failed"));

    await expect(
      processVoiceTranscriptBrainDump({
        uid: "uid-1",
        sessionId: "voice-1",
        text: "Edited transcript survives",
        provider: harness.provider,
        store: harness.store,
      })
    ).rejects.toThrow("extraction failed");

    expect(harness.sessions.get("uid-1:voice-1")).toMatchObject({
      state: "transcript",
      source: { rawText: "Edited transcript survives" },
    });
  });

  it("returns a stored transcript for repeated requests without calling OpenAI twice", async () => {
    const harness = createHarness();
    const request = {
      uid: "uid-1",
      brainDumpId: "voice-1",
      storagePath: ownedPath,
      durationMs: 10_000,
      provider: harness.provider,
      store: harness.store,
      storage: harness.storage,
    };
    await transcribeVoiceBrainDump(request);
    await transcribeVoiceBrainDump(request);

    expect(harness.provider.transcribeVoice).toHaveBeenCalledTimes(1);
    expect(harness.provider.extractTyped).not.toHaveBeenCalled();
  });
});
