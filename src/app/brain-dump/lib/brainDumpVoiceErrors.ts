const FALLBACK_TRANSCRIPTION_ERROR =
  "TaskLaunch couldn't transcribe this recording reliably. Your recording has not been turned into tasks.";

export function voiceTranscriptionErrorMessage(code: string) {
  switch (code) {
    case "brain-dump/transcription-rate-limited":
      return "Too many transcription attempts were made. Please wait 15 minutes and try again.";
    case "brain-dump/provider-rate-limited":
      return "Voice transcription is temporarily busy. Please wait a moment and try again.";
    case "brain-dump/not-found":
      return "The uploaded recording could not be found. Retry this recording or record it again.";
    case "brain-dump/not-reviewable":
      return "This recording session is no longer ready for transcription. Record it again to continue.";
    case "brain-dump/invalid-audio":
    case "brain-dump/invalid-input":
      return "TaskLaunch could not read this recording as valid audio. Record it again and retry.";
    case "brain-dump/no-speech":
      return "TaskLaunch could not detect enough speech. Check playback, then record again with clearer speech.";
    case "brain-dump/provider-unavailable":
    case "brain-dump/provider-temporary":
    case "brain-dump/provider-failed":
    case "brain-dump/provider-schema-invalid":
    case "brain-dump/provider-malformed-response":
      return "Voice transcription is temporarily unavailable. Please try again later.";
    case "storage/unauthorized":
      return "The recording upload was blocked. Refresh your sign-in and try recording again.";
    case "storage/retry-limit-exceeded":
      return "The recording upload timed out. Check your connection and try again.";
    case "storage/quota-exceeded":
      return "The recording could not be uploaded because the storage limit was reached. Please try again later.";
    case "storage/canceled":
      return "The recording upload was cancelled. Try transcribing the recording again.";
    default:
      return FALLBACK_TRANSCRIPTION_ERROR;
  }
}
