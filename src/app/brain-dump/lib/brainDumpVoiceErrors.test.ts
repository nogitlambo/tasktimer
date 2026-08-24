import { describe, expect, it } from "vitest";

import { voiceTranscriptionErrorMessage } from "./brainDumpVoiceErrors";

describe("voiceTranscriptionErrorMessage", () => {
  it.each([
    ["brain-dump/transcription-rate-limited", "Too many transcription attempts"],
    ["brain-dump/provider-rate-limited", "temporarily busy"],
    ["brain-dump/not-found", "uploaded recording could not be found"],
    ["brain-dump/not-reviewable", "recording session is no longer ready"],
    ["brain-dump/invalid-audio", "valid audio"],
    ["brain-dump/invalid-input", "valid audio"],
    ["brain-dump/no-speech", "detect enough speech"],
    ["brain-dump/provider-unavailable", "temporarily unavailable"],
    ["brain-dump/provider-temporary", "temporarily unavailable"],
    ["brain-dump/provider-schema-invalid", "temporarily unavailable"],
    ["brain-dump/provider-malformed-response", "temporarily unavailable"],
    ["storage/unauthorized", "upload was blocked"],
    ["storage/retry-limit-exceeded", "upload timed out"],
    ["storage/quota-exceeded", "storage limit"],
  ])("maps %s to actionable guidance", (code, expectedText) => {
    expect(voiceTranscriptionErrorMessage(code)).toContain(expectedText);
  });

  it("keeps a safe fallback for unknown failures", () => {
    expect(voiceTranscriptionErrorMessage("internal")).toBe(
      "TaskLaunch couldn't transcribe this recording reliably. Your recording has not been turned into tasks."
    );
  });
});
