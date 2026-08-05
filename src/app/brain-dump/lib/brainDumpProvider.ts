import type { BrainDumpAiProvider } from "./brainDumpProcessing";

class BrainDumpProviderUnavailableError extends Error {
  status = 503;
  code = "brain-dump/provider-unavailable";
}

export function getBrainDumpAiProvider(): BrainDumpAiProvider {
  return {
    async extractTyped() {
      throw new BrainDumpProviderUnavailableError("Brain Dump processing is not configured yet.");
    },
    async transcribeVoice() {
      throw new BrainDumpProviderUnavailableError("Brain Dump voice transcription is not configured yet.");
    },
  };
}
