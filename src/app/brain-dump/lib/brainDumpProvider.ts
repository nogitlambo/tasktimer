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
  };
}
