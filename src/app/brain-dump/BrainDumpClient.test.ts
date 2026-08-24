import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("BrainDumpClient", () => {
  it("uses the hosted API helper and Firebase auth header for typed processing", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain('fetch(getApiUrl("/api/brain-dump/sessions/"), {');
    expect(source).toContain('"x-firebase-auth": idToken');
    expect(source).not.toContain("api.openai.com");
  });

  it("keeps typed capture gated and renders the review selected count", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("maxLength={BRAIN_DUMP_TEXT_LIMIT}");
    expect(source).toContain("disabled={!canSubmit}");
    expect(source).toContain("const selectedCount = session?.review.items.filter");
    expect(source).toContain("{session.review.items.length}");
  });

  it("applies primitive styling across the embedded Brain Dump surface", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("brainDumpEmbeddedHeader");
    expect(source).not.toContain("brainDumpEmbeddedPanel brainDumpEmbeddedHeader brainDumpPrimitivePanel");
    expect(source).toContain('aria-label="Back"');
    expect(source).toContain("styles.backIcon");
    expect(source).toContain("styles.srOnly");
    expect(source).toContain("brainDumpEmbeddedPanel brainDumpPrimitivePanel");
    expect(source).toContain("brainDumpPrimitiveReviewItem");
    expect(source).toContain("brainDumpPrimitiveInput");
    expect(source).toContain("brainDumpPrimitiveTextarea");
    expect(source).toContain("brainDumpPrimitiveCheckbox");
    expect(source).toContain("const primitiveBackLinkClass = styles.backLink");
  });

  it("turns a voice recording into an editable transcript before the normal review session", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain('type BrainDumpCaptureMode = "typed" | "voice"');
    expect(source).toContain("navigator.mediaDevices.getUserMedia({ audio: true })");
    expect(source).toContain('const BRAIN_DUMP_VOICE_MIME_TYPE = "audio/wav"');
    expect(source).toContain('from "./lib/brainDumpVoiceCapture"');
    expect(source).toContain("hasDetectableVoiceSignal(chunks)");
    expect(source).toContain("audioContext.createScriptProcessor");
    expect(source).toContain("voicePcmChunksRef.current.push");
    expect(source).toContain("const meterStream = stream.clone()");
    expect(source).toContain("voiceMeterStreamRef.current = meterStream");
    expect(source).toContain("function handleVoicePlaybackLoadedMetadata");
    expect(source).toContain("function handlePlayVoiceRecording");
    expect(source).toContain("function handleVoicePlaybackError");
    expect(source).toContain("Recorder output:");
    expect(source).toContain("voicePlaybackRef");
    expect(source).toContain("Play recording ({formatVoiceDuration");
    expect(source).toContain("audio.currentTime = Number.MAX_SAFE_INTEGER");
    expect(source).toContain("onLoadedMetadata={handleVoicePlaybackLoadedMetadata}");
    expect(source).toContain("uploadBytesResumable(ref(storage, storagePath), voiceAudioBlob");
    expect(source).toContain("`users/${user.uid}/brain-dump-sources/${brainDumpId}/recording.wav`");
    expect(source).toContain('fetch(getApiUrl("/api/brain-dump/transcriptions/"), {');
    expect(source).toContain("brainDumpId,");
    expect(source).toContain("storagePath,");
    expect(source).toContain("setText(payload.transcript)");
    expect(source).toContain("writeStoredDraft(payload.transcript)");
    expect(source).toContain('fetch(getApiUrl("/api/brain-dump/sessions/"), {');
    expect(source).toContain('"Voice"');
    expect(source).toContain("Editable transcript");
  });

  it("exposes voice recording permissions, controls, duration limit, playback, progress, and accessible announcements", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("const BRAIN_DUMP_VOICE_MAX_MS = 5 * 60 * 1000");
    expect(source).toContain("browserSupportsVoiceRecording");
    expect(source).toContain('"Microphone permission was denied."');
    expect(source).toContain("function handlePauseVoiceRecording");
    expect(source).toContain("voiceCaptureRef.current.paused = true");
    expect(source).toContain("function handleResumeVoiceRecording");
    expect(source).toContain("voiceCaptureRef.current.paused = false");
    expect(source).toContain("function handleCancelVoiceRecording");
    expect(source).toContain("handleStopVoiceRecording()");
    expect(source).toContain('aria-label="Brain Dump voice recording playback"');
    expect(source).toContain("src={voiceAudioUrl}");
    expect(source).toContain("onError={handleVoicePlaybackError}");
    expect(source).toContain('role="meter"');
    expect(source).toContain('aria-label="Voice input level"');
    expect(source).toContain("voiceUploadProgressPct");
    expect(source).toContain('role="progressbar"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('trackEvent("brain_dump_transcription_failed"');
    expect(source).toContain('trackEvent("brain_dump_transcription_completed"');
    expect(source).toContain('trackEvent("brain_dump_transcript_edited"');
    expect(source).toContain("duration_bucket");
    expect(source).toContain("file_size_bucket");
    expect(source).not.toContain("transcript: payload.transcript");
    expect(source).not.toContain("raw_audio");
    expect(source).not.toContain("audio_bytes");
    expect(source).toContain("voiceTranscriptionErrorMessage(code)");
  });

  it("turns one image and optional instruction into a normal review session without replacing typed drafts", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain('type BrainDumpCaptureMode = "typed" | "voice" | "image"');
    expect(source).toContain("const BRAIN_DUMP_IMAGE_MAX_BYTES = 10 * 1024 * 1024");
    expect(source).toContain('const BRAIN_DUMP_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp"');
    expect(source).toContain("function handleImageFileChange");
    expect(source).toContain("event.target.files?.[0]");
    expect(source).toContain("URL.createObjectURL(file)");
    expect(source).toContain("setImagePreviewUrl");
    expect(source).toContain("function handleRemoveImage");
    expect(source).toContain("setImageInstruction");
    expect(source).toContain('fetch(getApiUrl("/api/brain-dump/images/"), {');
    expect(source).toContain("imageUploadProgressPct");
    expect(source).toContain("setSession(payload.session)");
    expect(source).toContain("writeStoredDraft(nextText)");
  });

  it("exposes image capture validation, camera runtime hints, preview accessibility, retry, and redacted analytics", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("file.size > BRAIN_DUMP_IMAGE_MAX_BYTES");
    expect(source).toContain("!BRAIN_DUMP_IMAGE_TYPES.has(file.type)");
    expect(source).toContain('"Choose a JPEG, PNG, or WebP image."');
    expect(source).toContain('"Brain Dump images must be 10 MB or smaller."');
    expect(source).toContain('accept={BRAIN_DUMP_IMAGE_ACCEPT}');
    expect(source).toContain('capture="environment"');
    expect(source).toContain('alt={imageFileName ? `Preview of ${imageFileName}` : "Brain Dump image preview"}');
    expect(source).toContain('role="progressbar"');
    expect(source).toContain('trackEvent("brain_dump_image_review_ready"');
    expect(source).toContain('trackEvent("brain_dump_image_review_failed"');
    expect(source).not.toContain("raw_image");
    expect(source).not.toContain("image_bytes");
  });

  it("allows microphone use only from the app origin in the response headers", () => {
    const source = readFileSync(resolve(__dirname, "../../../next.config.ts"), "utf8");

    expect(source).toContain('Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()"');
    expect(source).toContain('"media-src \'self\' blob:"');
  });

  it("supports title edits, item selection, and confirmed creation through the hosted endpoint", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("function updateReviewItem");
    expect(source).toContain('type="checkbox"');
    expect(source).toContain('aria-label={`Select ${item.title}`}');
    expect(source).toContain('value={item.title}');
    expect(source).toContain("selectedCount");
    expect(source).toContain('fetch(getApiUrl(`/api/brain-dump/sessions/${session.id}/confirm/`), {');
    expect(source).toContain("confirmIdempotencyKey");
    expect(source).toContain("idempotencyKey: confirmIdempotencyKey");
    expect(source).toContain("itemUpdates");
    expect(source).toContain('trackEvent("brain_dump_tasks_created"');
    expect(source).toContain("created_count: payload.batch.createdCount");
    expect(source).toContain("skipped_count: payload.batch.skippedCount");
    expect(source).toContain('trackEvent("brain_dump_tasks_partial_failed"');
    expect(source).toContain('trackEvent("brain_dump_tasks_create_failed"');
    expect(source).toContain("failed_count: payload.batch.failedCount");
    expect(source).toContain("retryable_count: payload.batch.retryableCount");
    expect(source).toContain('void trackEvent("brain_dump_tasks_created", {');
  });

  it("preserves typed drafts through failures and exposes safe recovery controls", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("BRAIN_DUMP_TYPED_DRAFT_KEY");
    expect(source).toContain("readStoredDraft");
    expect(source).toContain("writeStoredDraft");
    expect(source).toContain("handleClearDraft");
    expect(source).toContain("handleRetryProcessing");
    expect(source).toContain("handleCancelProcessing");
    expect(source).toContain("AbortController");
    expect(source).toContain("autoRetriedRef");
    expect(source).toContain('"Validating input"');
    expect(source).toContain('"Uploading securely"');
    expect(source).toContain('"Analysing Brain Dump"');
    expect(source).toContain('trackEvent("brain_dump_processing_failed"');
    expect(source).toContain("mode: captureMode");
    expect(source).toContain("draft_length: text.length");
    expect(source).toContain("Retry");
    expect(source).toContain("Clear draft");
    expect(source).toContain("Cancel");
    expect(source).not.toContain("raw_text");
    expect(source).not.toContain("source_text");
  });

  it("restores stored drafts after mount to keep hydration deterministic", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain('const [captureMode, setCaptureMode] = useState<BrainDumpCaptureMode>("typed")');
    expect(source).toContain('const [text, setText] = useState("")');
    expect(source).not.toContain("useState<BrainDumpCaptureMode>(() => readStoredCaptureMode())");
    expect(source).not.toContain("useState(() => readStoredDraft())");
    expect(source).toContain("const timer = window.setTimeout(() => {");
    expect(source).toContain("setCaptureMode(readStoredCaptureMode())");
    expect(source).toContain("setText(readStoredDraft())");
    expect(source).toContain("return () => window.clearTimeout(timer)");
  });

  it("handles expired review sessions with a fresh-start path and no stale completion state", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("function payloadError");
    expect(source).toContain("code?: string");
    expect(source).toContain("function handleRequestError");
    expect(source).toContain('nextCode === "brain-dump/expired"');
    expect(source).toContain("setSession(null)");
    expect(source).toContain("setBatchResult(null)");
    expect(source).toContain("setUndoResult(null)");
    expect(source).toContain("function handleStartFreshAfterExpiry");
    expect(source).toContain('errorCode === "brain-dump/expired"');
    expect(source).toContain("Start fresh");
  });

  it("uses history-aware Back links with a TaskLaunch fallback", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain('resolveTaskTimerRouteHref(onBack ? "/executive" : "/tasklaunch")');
    expect(source).toContain('resolveStandaloneRouteBackTarget("/tasklaunch")');
    expect(source).toContain("function handleBackNavigation");
    expect(source).toContain("window.location.href = resolveTaskTimerRouteHref(backTarget)");
    expect(source).toContain("href={taskLaunchHref}");
    expect(source).not.toContain("window.history.back()");
    expect(source).not.toContain('href="/tasklaunch"');
  });

  it("renders editable review dates inside the visible optional details", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("BrainDumpReviewDate");
    expect(source).toContain('type="date"');
    expect(source).toContain('aria-label={`Date for ${item.title}`}');
    expect(source).toContain("Remove date");
    expect(source).toContain("styles.dateReview");
    expect(source.indexOf("Time Goal/Estimate")).toBeLessThan(source.indexOf('htmlFor={`brainDumpDate-${item.id}`}'));
    expect(source.indexOf('htmlFor={`brainDumpDate-${item.id}`}')).toBeLessThan(source.indexOf("brainDumpPriority"));
    expect(source).not.toContain("item.date.dateSource");
    expect(source).not.toContain("item.date.originalDateText");
  });

  it("keeps optional enrichment visible, accessible, editable, saveable, and clearable", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("BrainDumpReviewEnrichment");
    expect(source).not.toContain("<details");
    expect(source).not.toContain("<summary");
    expect(source).toContain("styles.optionalDetails");
    expect(source).not.toContain('aria-label={`Notes for ${item.title}`}');
    expect(source).not.toContain("brainDumpNotes");
    expect(source).toContain("Task Type");
    expect(source).toContain('aria-label={`Task type for ${item.title}`}');
    expect(source).toContain('["recurring", "Recurring"]');
    expect(source).toContain('["once-off", "Once-off"]');
    expect(source).toContain("styles.taskTypePills");
    expect(source).toContain("updateReviewItem(item.id, { taskType: nextTaskType })");
    expect(source).toContain("Time Goal/Estimate");
    expect(source).toContain('aria-label={`Time goal or estimate for ${item.title}`}');
    expect(source).toContain('aria-label={`Time goal unit for ${item.title}`}');
    expect(source).toContain('aria-label={`Time goal period for ${item.title}`}');
    expect(source).toContain("Min");
    expect(source).toContain("Hour");
    expect(source).toContain("Day");
    expect(source).toContain("Week");
    expect(source).toContain("addTaskDurationRow editTaskDurationRow");
    expect(source).toContain("unitButtons addTaskDurationPills taskScreenPillGroup");
    expect(source).toContain("btn btn-ghost small unitBtn taskScreenPill taskScreenHeaderBtn");
    expect(source).toContain(" isOn");
    expect(source).toContain("buildTimeGoalEnrichment");
    expect(source).toContain("timeGoalValue");
    expect(source).toContain("timeGoalUnit");
    expect(source).toContain("timeGoalPeriod");
    expect(source).toContain('aria-label={`Date for ${item.title}`}');
    expect(source).toContain('aria-label={`Priority for ${item.title}`}');
    expect(source).toContain("styles.priorityPills");
    expect(source).not.toContain('["", "None"]');
    expect(source).toContain('["low", "Low"]');
    expect(source).toContain('["medium", "Normal"]');
    expect(source).toContain('["high", "High"]');
    expect(source).toContain('(item.enrichment.priority || "medium") === priority');
    expect(source).toContain("priority: \"medium\"");
    expect(source).toContain('aria-label={`First action for ${item.title}`}');
    expect(source).toContain("Clear optional details");
    expect(source).toContain('fetch(getApiUrl(`/api/brain-dump/sessions/${session.id}`), {');
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("validationErrors");
  });

  it("renders duplicate warnings with explicit Select anyway and removable Skip actions", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("BrainDumpDuplicateWarning");
    expect(source).toContain("duplicateWarnings");
    expect(source).toContain("Possible duplicate");
    expect(source).toContain('aria-label={`Possible duplicates for ${item.title}`}');
    expect(source).toContain("warning.matchedState");
    expect(source).toContain("warning.matchedTitle");
    expect(source).toContain("Select anyway");
    expect(source).toContain('duplicateDecision: "create_anyway"');
    expect(source).toContain("Skip");
    expect(source).toContain("function removeDuplicateReviewItem");
    expect(source).toContain("removedReviewItemIds.has(item.id)");
    expect(source).toContain('duplicateDecision: "skip"');
  });

  it("shows a create-only executive loading overlay while generating tasks", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");
    const stylesSource = readFileSync(resolve(__dirname, "BrainDump.module.css"), "utf8");

    expect(source).toContain("const [creatingTasks, setCreatingTasks] = useState(false)");
    expect(source).toContain("setCreatingTasks(true)");
    expect(source).toContain("setCreatingTasks(false)");
    expect(source).toContain('setStatus("Generating tasks...")');
    expect(source).toContain("creatingTasks ? (");
    expect(source).toContain("styles.createOverlay");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-label="Generating tasks..."');
    expect(source).toContain('src="/icons/icons_default/executive.webp"');
    expect(source).toContain("styles.createOverlayIcon");
    expect(source).toContain("Generating tasks...");
    expect(source).toContain('{creatingTasks ? "Generating" : `Create ${selectedCount}`}');
    expect(source).not.toContain('setStatus("Creating tasks")');
    expect(source).not.toContain('{busy ? "Creating" : `Create ${selectedCount}`}');
    expect(source.indexOf("async function handleConfirm")).toBeLessThan(source.indexOf("setCreatingTasks(true)"));
    expect(source.indexOf("setCreatingTasks(false)")).toBeLessThan(source.indexOf("async function handleUndoBatch"));
    expect(stylesSource).toContain(".createOverlay");
    expect(stylesSource).toContain(".createOverlayIcon");
    expect(stylesSource).toContain("animation: brainDumpCreateSpin");
    expect(stylesSource).toContain("@keyframes brainDumpCreateSpin");
  });

  it("exposes an accessible 30-second undo action after successful creation", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("BrainDumpUndoBatchResult");
    expect(source).toContain("undoExpiresAtMs");
    expect(source).toContain("30_000");
    expect(source).toContain("undoAvailable");
    expect(source).toContain("handleUndoBatch");
    expect(source).toContain('aria-label="Undo Brain Dump task creation"');
    expect(source).toContain('fetch(getApiUrl(`/api/brain-dump/sessions/${session.id}/undo/`), {');
    expect(source).toContain("idempotencyKey: batchResult.idempotencyKey");
    expect(source).toContain('trackEvent("brain_dump_tasks_undone"');
    expect(source).toContain("removed_count: payload.undo.removedCount");
    expect(source).toContain("retained_count: payload.undo.retainedCount");
  });
});
