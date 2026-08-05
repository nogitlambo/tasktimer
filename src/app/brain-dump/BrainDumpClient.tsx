"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { trackEvent } from "@/lib/firebaseTelemetry";
import { getApiUrl } from "@/app/tasktimer/lib/apiClient";
import { resolveTaskTimerRouteHref } from "@/app/tasktimer/lib/routeHref";

import styles from "./BrainDump.module.css";

const BRAIN_DUMP_TEXT_LIMIT = 20_000;
const BRAIN_DUMP_VOICE_MIME_TYPE = "audio/webm";
const BRAIN_DUMP_VOICE_MAX_MS = 5 * 60 * 1000;
const BRAIN_DUMP_VOICE_LABEL = "Voice";
const TASKTIMER_STORAGE_KEY = "taskticker_tasks_v1";
const BRAIN_DUMP_TYPED_DRAFT_KEY = `${TASKTIMER_STORAGE_KEY}:brainDump:typedDraft:v1`;
const BRAIN_DUMP_CAPTURE_MODE_KEY = `${TASKTIMER_STORAGE_KEY}:brainDump:captureMode:v1`;

type BrainDumpCaptureMode = "typed" | "voice";
type BrainDumpVoiceState = "idle" | "recording" | "paused" | "recorded" | "transcribing";

function readStoredDraft() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(BRAIN_DUMP_TYPED_DRAFT_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredDraft(value: string) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(BRAIN_DUMP_TYPED_DRAFT_KEY, value);
    else window.localStorage.removeItem(BRAIN_DUMP_TYPED_DRAFT_KEY);
  } catch {}
}

function readStoredCaptureMode(): BrainDumpCaptureMode {
  if (typeof window === "undefined") return "typed";
  try {
    return window.localStorage.getItem(BRAIN_DUMP_CAPTURE_MODE_KEY) === "voice" ? "voice" : "typed";
  } catch {
    return "typed";
  }
}

function writeStoredCaptureMode(mode: BrainDumpCaptureMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BRAIN_DUMP_CAPTURE_MODE_KEY, mode);
  } catch {}
}

function createConfirmIdempotencyKey(sessionId: string) {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${sessionId}:${suffix}`;
}

function formatVoiceDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function browserSupportsVoiceRecording() {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(BRAIN_DUMP_VOICE_MIME_TYPE))
  );
}

function readBlobAsBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the Brain Dump recording."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] || "");
    };
    reader.readAsDataURL(blob);
  });
}

type BrainDumpReviewItem = {
  id: string;
  itemType: string;
  title: string;
  selected: boolean;
  sourceEvidence: string[];
  confidence: number;
  ambiguityFlags: string[];
  supported: boolean;
  date: BrainDumpReviewDate;
  enrichment: BrainDumpReviewEnrichment;
  validationErrors: BrainDumpReviewValidationError[];
  duplicateWarnings: BrainDumpDuplicateWarning[];
  duplicateDecision: BrainDumpDuplicateDecision;
};

type BrainDumpReviewDate = {
  originalDateText: string | null;
  dateSource: "explicit" | "inferred" | "suggested" | "none";
  timezone: string;
  resolvedDate: string | null;
  dateConfidence: number;
  ambiguity: "none" | "ambiguous";
  ambiguityFlags: string[];
  userConfirmedDate: boolean;
  recurrenceText: string | null;
  dependencyTimingText: string | null;
};

type BrainDumpReviewEnrichment = {
  notes: string | null;
  estimatedDurationMinutes: number | null;
  priority: "low" | "medium" | "high" | null;
  firstAction: string | null;
};

type BrainDumpReviewValidationError = {
  field: string;
  message: string;
};

type BrainDumpDuplicateDecision = "undecided" | "create_anyway" | "skip";

type BrainDumpDuplicateWarning = {
  id: string;
  source: "same-dump" | "workspace";
  matchType: "title" | "title-date";
  matchedItemId: string | null;
  matchedTaskId: string | null;
  matchedTitle: string;
  matchedState: "proposed" | "active" | "recent" | "archived";
  reason: string;
};

type BrainDumpReviewSession = {
  id: string;
  state: "review" | "completed";
  review: {
    selectedCount: number;
    items: BrainDumpReviewItem[];
  };
};

type BrainDumpCreationBatchResult = {
  sessionId: string;
  idempotencyKey: string;
  state: "completed" | "partially_failed" | "failed";
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  retryableCount: number;
  completedAtMs: number;
};

type BrainDumpUndoBatchResult = {
  state: "undone" | "partially_undone" | "not_undone" | "expired";
  removedCount: number;
  retainedCount: number;
};

export default function BrainDumpClient() {
  const [captureMode, setCaptureMode] = useState<BrainDumpCaptureMode>(() => readStoredCaptureMode());
  const [text, setText] = useState(() => readStoredDraft());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [voiceState, setVoiceState] = useState<BrainDumpVoiceState>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [voiceElapsedMs, setVoiceElapsedMs] = useState(0);
  const [voiceUploadProgressPct, setVoiceUploadProgressPct] = useState(0);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceAudioBlob, setVoiceAudioBlob] = useState<Blob | null>(null);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState("");
  const [recoverableFailure, setRecoverableFailure] = useState(false);
  const [session, setSession] = useState<BrainDumpReviewSession | null>(null);
  const [batchResult, setBatchResult] = useState<BrainDumpCreationBatchResult | null>(null);
  const [undoResult, setUndoResult] = useState<BrainDumpUndoBatchResult | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmIdempotencyKey, setConfirmIdempotencyKey] = useState("");
  const autoRetriedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const errorSummaryRef = useRef<HTMLParagraphElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceSegmentStartedAtMsRef = useRef(0);
  const voiceElapsedBeforePauseMsRef = useRef(0);
  const voiceTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const voiceLevelFrameRef = useRef<number | null>(null);
  const voiceAudioUrlRef = useRef("");
  const trimmedText = text.trim();
  const voiceBusy = voiceState === "recording" || voiceState === "paused" || voiceState === "transcribing";
  const canSubmit = trimmedText.length > 0 && trimmedText.length <= BRAIN_DUMP_TEXT_LIMIT && !busy && !voiceBusy;
  const remaining = BRAIN_DUMP_TEXT_LIMIT - text.length;
  const selectedCount = session?.review.items.filter((item) => item.supported && item.selected).length ?? 0;
  const undoExpiresAtMs = batchResult?.state === "completed" ? batchResult.completedAtMs + 30_000 : 0;
  const undoAvailable = !!batchResult && batchResult.state === "completed" && !undoResult && nowMs <= undoExpiresAtMs;
  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);
  const taskLaunchHref = resolveTaskTimerRouteHref("/tasklaunch");

  function handleBackNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  }

  useEffect(() => {
    if (error) errorSummaryRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (!batchResult || batchResult.state !== "completed" || undoResult) return;
    const timer = window.setTimeout(() => setNowMs(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [batchResult, nowMs, undoResult]);

  useEffect(() => {
    voiceAudioUrlRef.current = voiceAudioUrl;
  }, [voiceAudioUrl]);

  useEffect(() => {
    return () => {
      clearVoiceTimer();
      stopVoiceLevelMeter();
      stopVoiceStream();
      if (voiceAudioUrlRef.current) URL.revokeObjectURL(voiceAudioUrlRef.current);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitForReview({ allowAutoRetry: true });
  }

  function handleTextChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextText = event.target.value;
    setText(nextText);
    writeStoredDraft(nextText);
    if (recoverableFailure) setRecoverableFailure(false);
  }

  function handleCaptureModeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextMode: BrainDumpCaptureMode = event.target.value === "voice" ? "voice" : "typed";
    setCaptureMode(nextMode);
    writeStoredCaptureMode(nextMode);
  }

  function clearVoiceAudio() {
    setVoiceAudioBlob(null);
    setVoiceAudioUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return "";
    });
  }

  function clearVoiceTimer() {
    if (voiceTimerRef.current !== null) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }

  function getCurrentVoiceElapsedMs() {
    const startedAtMs = voiceSegmentStartedAtMsRef.current;
    const segmentElapsedMs = startedAtMs ? Date.now() - startedAtMs : 0;
    return Math.min(BRAIN_DUMP_VOICE_MAX_MS, voiceElapsedBeforePauseMsRef.current + segmentElapsedMs);
  }

  function startVoiceTimer() {
    clearVoiceTimer();
    voiceTimerRef.current = window.setInterval(() => {
      const elapsedMs = getCurrentVoiceElapsedMs();
      setVoiceElapsedMs(elapsedMs);
      if (elapsedMs >= BRAIN_DUMP_VOICE_MAX_MS) {
        setStatus("Recording stopped at five minutes");
        handleStopVoiceRecording();
      }
    }, 250);
  }

  function stopVoiceStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function stopVoiceLevelMeter() {
    if (voiceLevelFrameRef.current !== null) {
      window.cancelAnimationFrame(voiceLevelFrameRef.current);
      voiceLevelFrameRef.current = null;
    }
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
    setVoiceLevel(0);
  }

  function startVoiceLevelMeter(stream: MediaStream) {
    stopVoiceLevelMeter();
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      const samples = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      audioContextRef.current = audioContext;
      const readLevel = () => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) {
          peak = Math.max(peak, Math.abs(sample - 128));
        }
        setVoiceLevel(Math.min(1, peak / 64));
        voiceLevelFrameRef.current = window.requestAnimationFrame(readLevel);
      };
      readLevel();
    } catch {
      setVoiceLevel(0);
    }
  }

  async function handleStartVoiceRecording() {
    if (busy || voiceState === "recording" || voiceState === "paused") return;
    setError("");
    setVoiceError("");
    setVoiceUploadProgressPct(0);
    clearVoiceAudio();
    if (!browserSupportsVoiceRecording()) {
      setVoiceError("Voice recording is not available in this browser.");
      void trackEvent("brain_dump_voice_recording_unavailable", { mode: "voice" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: BRAIN_DUMP_VOICE_MIME_TYPE });
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      voiceElapsedBeforePauseMsRef.current = 0;
      voiceSegmentStartedAtMsRef.current = Date.now();
      setVoiceElapsedMs(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = getCurrentVoiceElapsedMs();
        voiceElapsedBeforePauseMsRef.current = durationMs;
        voiceSegmentStartedAtMsRef.current = 0;
        clearVoiceTimer();
        stopVoiceLevelMeter();
        stopVoiceStream();
        const blob = new Blob(voiceChunksRef.current, { type: BRAIN_DUMP_VOICE_MIME_TYPE });
        if (blob.size > 0) {
          setVoiceAudioBlob(blob);
          setVoiceAudioUrl((currentUrl) => {
            if (currentUrl) URL.revokeObjectURL(currentUrl);
            return URL.createObjectURL(blob);
          });
          setVoiceState("recorded");
          setStatus("Recording ready for playback");
        } else {
          setVoiceState("idle");
          setVoiceError("No audio was captured.");
        }
      };
      recorder.start();
      startVoiceLevelMeter(stream);
      startVoiceTimer();
      setVoiceState("recording");
      setStatus("Recording");
      void trackEvent("brain_dump_voice_recording_started", { mode: "voice", mime_type: BRAIN_DUMP_VOICE_MIME_TYPE });
    } catch (err) {
      stopVoiceStream();
      stopVoiceLevelMeter();
      setVoiceState("idle");
      setVoiceError(err instanceof DOMException && err.name === "NotAllowedError" ? "Microphone permission was denied." : "Could not start recording.");
      void trackEvent("brain_dump_voice_permission_denied", { mode: "voice" });
    }
  }

  function handlePauseVoiceRecording() {
    if (mediaRecorderRef.current?.state !== "recording") return;
    const elapsedMs = getCurrentVoiceElapsedMs();
    voiceElapsedBeforePauseMsRef.current = elapsedMs;
    voiceSegmentStartedAtMsRef.current = 0;
    mediaRecorderRef.current?.pause();
    clearVoiceTimer();
    setVoiceElapsedMs(elapsedMs);
    setVoiceLevel(0);
    setVoiceState("paused");
    setStatus("Recording paused");
  }

  function handleResumeVoiceRecording() {
    if (mediaRecorderRef.current?.state !== "paused") return;
    voiceSegmentStartedAtMsRef.current = Date.now();
    mediaRecorderRef.current?.resume();
    startVoiceTimer();
    setVoiceState("recording");
    setStatus("Recording");
  }

  function handleStopVoiceRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      setVoiceElapsedMs(getCurrentVoiceElapsedMs());
      mediaRecorderRef.current.stop();
      return;
    }
    clearVoiceTimer();
    stopVoiceLevelMeter();
    stopVoiceStream();
  }

  function resetVoiceRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    voiceChunksRef.current = [];
    voiceElapsedBeforePauseMsRef.current = 0;
    voiceSegmentStartedAtMsRef.current = 0;
    clearVoiceTimer();
    stopVoiceLevelMeter();
    stopVoiceStream();
    clearVoiceAudio();
    setVoiceState("idle");
    setVoiceElapsedMs(0);
    setVoiceUploadProgressPct(0);
    setVoiceError("");
  }

  function handleCancelVoiceRecording() {
    resetVoiceRecording();
    setStatus("Recording cancelled");
    void trackEvent("brain_dump_voice_recording_cancelled", { mode: "voice" });
  }

  async function handleTranscribeVoiceRecording() {
    if (!voiceAudioBlob || busy || voiceState === "transcribing") return;
    setVoiceState("transcribing");
    setVoiceError("");
    setVoiceUploadProgressPct(20);
    setStatus("Uploading recording securely");
    try {
      const auth = getFirebaseAuthClient();
      const user = auth?.currentUser || null;
      const idToken = await user?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const audioBase64 = await readBlobAsBase64(voiceAudioBlob);
      setVoiceUploadProgressPct(65);
      const response = await fetch(getApiUrl("/api/brain-dump/transcriptions/"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify({
          audioBase64,
          mimeType: BRAIN_DUMP_VOICE_MIME_TYPE,
          durationMs: Math.max(1, Math.floor(voiceElapsedMs || voiceElapsedBeforePauseMsRef.current)),
          timezone,
        }),
      });
      const payload = (await response.json()) as { transcript?: string; error?: string };
      if (!response.ok || !payload.transcript) throw new Error(payload.error || "Brain Dump recording could not be transcribed.");
      setText(payload.transcript);
      writeStoredDraft(payload.transcript);
      setVoiceUploadProgressPct(100);
      setVoiceState("recorded");
      setStatus("Editable transcript ready");
      setRecoverableFailure(false);
      void trackEvent("brain_dump_voice_transcribed", {
        mode: "voice",
        duration_ms: Math.max(1, Math.floor(voiceElapsedMs || voiceElapsedBeforePauseMsRef.current)),
        mime_type: BRAIN_DUMP_VOICE_MIME_TYPE,
      });
    } catch (err) {
      setVoiceState("recorded");
      setVoiceUploadProgressPct(0);
      setVoiceError(err instanceof Error ? err.message : "Brain Dump recording could not be transcribed.");
      setStatus("");
      setRecoverableFailure(true);
      void trackEvent("brain_dump_voice_transcription_failed", {
        mode: "voice",
        duration_ms: Math.max(0, Math.floor(voiceElapsedMs || voiceElapsedBeforePauseMsRef.current)),
      });
    }
  }

  function handleClearDraft() {
    setText("");
    writeStoredDraft("");
    resetVoiceRecording();
    setError("");
    setStatus("");
    setRecoverableFailure(false);
    setSession(null);
    setBatchResult(null);
    setUndoResult(null);
    setConfirmIdempotencyKey("");
    autoRetriedRef.current = false;
    void trackEvent("brain_dump_draft_cleared", {
      mode: captureMode,
      draft_length: 0,
    });
  }

  function handleCancelProcessing() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setBusy(false);
    setError("");
    setStatus("Cancelled");
    setRecoverableFailure(false);
    void trackEvent("brain_dump_processing_cancelled", {
      mode: captureMode,
      draft_length: text.length,
    });
  }

  async function handleRetryProcessing() {
    await submitForReview({ allowAutoRetry: false });
  }

  async function submitForReview(options: { allowAutoRetry: boolean }) {
    if (!canSubmit) return;
    if (options.allowAutoRetry) autoRetriedRef.current = false;
    setBusy(true);
    setError("");
    setRecoverableFailure(false);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        setStatus("Validating input");
        const auth = getFirebaseAuthClient();
        const user = auth?.currentUser || null;
        const idToken = await user?.getIdToken();
        if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");

        setStatus("Uploading securely");
        setStatus("Analysing Brain Dump");
        const response = await fetch(getApiUrl("/api/brain-dump/sessions/"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-firebase-auth": idToken,
          },
          body: JSON.stringify({ text: trimmedText, timezone }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as { session?: BrainDumpReviewSession; error?: string };
        if (!response.ok || !payload.session) throw new Error(payload.error || "Brain Dump could not be processed.");
        setStatus("Saving review");
        setSession(payload.session);
        setBatchResult(null);
        setUndoResult(null);
        setConfirmIdempotencyKey(createConfirmIdempotencyKey(payload.session.id));
        setStatus("Review ready");
        autoRetriedRef.current = false;
        void trackEvent("brain_dump_review_ready", {
          mode: captureMode,
          item_count: payload.session.review.items.length,
          selected_count: payload.session.review.items.filter((item) => item.selected).length,
        });
        setBusy(false);
        abortControllerRef.current = null;
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setStatus("Cancelled");
          setBusy(false);
          abortControllerRef.current = null;
          return;
        }
        if (options.allowAutoRetry && attempt === 0 && !autoRetriedRef.current) {
          autoRetriedRef.current = true;
          setStatus("Retrying");
          continue;
        }
        setError(err instanceof Error ? err.message : "Brain Dump could not be processed.");
        setStatus("");
        setRecoverableFailure(true);
        void trackEvent("brain_dump_processing_failed", {
          mode: captureMode,
          draft_length: text.length,
          retry_count: attempt,
        });
        setBusy(false);
        abortControllerRef.current = null;
        return;
      }
    }
  }

  function updateReviewItem(
    itemId: string,
    patch: Partial<Pick<BrainDumpReviewItem, "selected" | "title" | "date" | "enrichment" | "duplicateDecision">>
  ) {
    setSession((current) => {
      if (!current) return current;
      return {
        ...current,
        review: {
          ...current.review,
          items: current.review.items.map((item) => {
            if (item.id !== itemId) return item;
            return {
              ...item,
              title: patch.title ?? item.title,
              selected: item.supported ? (patch.selected ?? item.selected) : false,
              date: patch.date ?? item.date,
              enrichment: patch.enrichment ?? item.enrichment,
              duplicateDecision: patch.duplicateDecision ?? item.duplicateDecision,
            };
          }),
        },
      };
    });
  }

  function buildReviewItemUpdates(currentSession: BrainDumpReviewSession) {
    return currentSession.review.items.map((item) => ({
      itemId: item.id,
      selected: item.supported && item.selected,
      title: item.title,
      date: {
        resolvedDate: item.date.resolvedDate,
        userConfirmedDate: item.date.userConfirmedDate,
      },
      enrichment: item.enrichment,
      duplicateDecision: item.duplicateDecision,
    }));
  }

  async function handleSaveReview() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setStatus("Saving review");
    try {
      const auth = getFirebaseAuthClient();
      const user = auth?.currentUser || null;
      const idToken = await user?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");

      const response = await fetch(getApiUrl(`/api/brain-dump/sessions/${session.id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify({ itemUpdates: buildReviewItemUpdates(session) }),
      });
      const payload = (await response.json()) as { session?: BrainDumpReviewSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "Brain Dump review could not be saved.");
      setSession(payload.session);
      setStatus("Review saved");
      void trackEvent("brain_dump_review_saved", {
        item_count: payload.session.review.items.length,
        selected_count: payload.session.review.items.filter((item) => item.selected).length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brain Dump review could not be saved.");
      setStatus("");
      void trackEvent("brain_dump_review_save_failed", {
        session_id: session.id,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!session || selectedCount === 0 || busy || !confirmIdempotencyKey) return;
    setBusy(true);
    setError("");
    setStatus("Creating tasks");
    try {
      const auth = getFirebaseAuthClient();
      const user = auth?.currentUser || null;
      const idToken = await user?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");

      const itemUpdates = buildReviewItemUpdates(session);
      const response = await fetch(getApiUrl(`/api/brain-dump/sessions/${session.id}/confirm/`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify({ idempotencyKey: confirmIdempotencyKey, itemUpdates }),
      });
      const payload = (await response.json()) as { batch?: BrainDumpCreationBatchResult; error?: string };
      if (!response.ok || !payload.batch) throw new Error(payload.error || "Brain Dump tasks could not be created.");
      setBatchResult(payload.batch);
      setUndoResult(null);
      if (payload.batch.state === "completed") {
        setSession((current) => (current ? { ...current, state: "completed" } : current));
        setStatus(`Created ${payload.batch.createdCount} task${payload.batch.createdCount === 1 ? "" : "s"}`);
        void trackEvent("brain_dump_tasks_created", {
          created_count: payload.batch.createdCount,
          skipped_count: payload.batch.skippedCount,
        });
      } else {
        setStatus(
          `Created ${payload.batch.createdCount}; ${payload.batch.failedCount} failed and ${payload.batch.retryableCount} can retry`
        );
        void trackEvent("brain_dump_tasks_partial_failed", {
          session_id: session.id,
          created_count: payload.batch.createdCount,
          skipped_count: payload.batch.skippedCount,
          failed_count: payload.batch.failedCount,
          retryable_count: payload.batch.retryableCount,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brain Dump tasks could not be created.");
      setStatus("");
      void trackEvent("brain_dump_tasks_create_failed", {
        session_id: session.id,
        selected_count: selectedCount,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleUndoBatch() {
    if (!session || !batchResult || !undoAvailable || busy) return;
    setBusy(true);
    setError("");
    setStatus("Undoing tasks");
    try {
      const auth = getFirebaseAuthClient();
      const user = auth?.currentUser || null;
      const idToken = await user?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");

      const response = await fetch(getApiUrl(`/api/brain-dump/sessions/${session.id}/undo/`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify({ idempotencyKey: batchResult.idempotencyKey }),
      });
      const payload = (await response.json()) as { undo?: BrainDumpUndoBatchResult; error?: string };
      if (!response.ok || !payload.undo) throw new Error(payload.error || "Brain Dump undo could not be completed.");
      setUndoResult(payload.undo);
      setStatus(`Removed ${payload.undo.removedCount}; retained ${payload.undo.retainedCount}`);
      void trackEvent("brain_dump_tasks_undone", {
        removed_count: payload.undo.removedCount,
        retained_count: payload.undo.retainedCount,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brain Dump undo could not be completed.");
      setStatus("");
      void trackEvent("brain_dump_tasks_undo_failed", {
        session_id: session.id,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="brainDumpTitle">
        <header className={styles.header}>
          <a className={styles.backLink} href={taskLaunchHref} onClick={handleBackNavigation}>
            Back
          </a>
          <div>
            <p className={styles.kicker}>Executive Function</p>
            <h1 id="brainDumpTitle" className={styles.title}>
              Brain Dump
            </h1>
          </div>
        </header>

        <form className={styles.capture} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="brainDumpCaptureMode">
            Capture mode
          </label>
          <select
            id="brainDumpCaptureMode"
            className={styles.titleInput}
            value={captureMode}
            disabled={busy}
            onChange={handleCaptureModeChange}
          >
            <option value="typed">Typed</option>
            <option value="voice">{BRAIN_DUMP_VOICE_LABEL}</option>
          </select>
          {captureMode === "voice" ? (
            <section className={styles.voicePanel} aria-label="Voice Brain Dump recorder">
              <div className={styles.voiceMeterRow}>
                <span className={styles.voiceTimer}>{formatVoiceDuration(voiceElapsedMs)}</span>
                <div
                  className={styles.voiceMeter}
                  role="meter"
                  aria-label="Voice input level"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(voiceLevel * 100)}
                >
                  <span style={{ width: `${Math.round(voiceLevel * 100)}%` }} />
                </div>
              </div>
              <div className={styles.secondaryActions}>
                <button className={styles.secondaryButton} type="button" disabled={voiceBusy || busy} onClick={handleStartVoiceRecording}>
                  Start
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={voiceState !== "recording"}
                  onClick={handlePauseVoiceRecording}
                >
                  Pause
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={voiceState !== "paused"}
                  onClick={handleResumeVoiceRecording}
                >
                  Resume
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={voiceState !== "recording" && voiceState !== "paused"}
                  onClick={handleStopVoiceRecording}
                >
                  Stop
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={voiceState === "idle" || voiceState === "transcribing"}
                  onClick={handleCancelVoiceRecording}
                >
                  Cancel recording
                </button>
              </div>
              {voiceAudioUrl ? (
                <div className={styles.voicePlayback}>
                  <audio controls src={voiceAudioUrl} aria-label="Brain Dump voice recording playback" />
                  <button
                    className={styles.submitButton}
                    type="button"
                    disabled={!voiceAudioBlob || voiceState === "transcribing" || busy}
                    onClick={handleTranscribeVoiceRecording}
                  >
                    {voiceState === "transcribing" ? "Transcribing" : "Transcribe"}
                  </button>
                </div>
              ) : null}
              {voiceState === "transcribing" ? (
                <div
                  className={styles.voiceProgress}
                  role="progressbar"
                  aria-label="Voice upload progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={voiceUploadProgressPct}
                >
                  <span style={{ width: `${voiceUploadProgressPct}%` }} />
                </div>
              ) : null}
              {voiceError ? (
                <p className={styles.error} role="alert">
                  {voiceError}
                </p>
              ) : null}
            </section>
          ) : null}
          <label className={styles.label} htmlFor="brainDumpText">
            {captureMode === "voice" ? "Editable transcript" : "Brain Dump input"}
          </label>
          <textarea
            id="brainDumpText"
            className={styles.textarea}
            value={text}
            maxLength={BRAIN_DUMP_TEXT_LIMIT}
            onChange={handleTextChange}
            aria-describedby="brainDumpCount brainDumpStatus brainDumpError"
            placeholder="Finish Play Store screenshots, call dentist before Thursday..."
          />
          <div className={styles.captureFooter}>
            <span id="brainDumpCount" className={remaining < 0 ? styles.countError : styles.count}>
              {remaining} characters left
            </span>
            <button className={styles.submitButton} type="submit" disabled={!canSubmit}>
              {busy ? "Analysing" : "Review"}
            </button>
          </div>
          <div className={styles.secondaryActions}>
            <button className={styles.secondaryButton} type="button" disabled={!text || busy} onClick={handleClearDraft}>
              Clear draft
            </button>
            {recoverableFailure ? (
              <button className={styles.secondaryButton} type="button" disabled={!canSubmit} onClick={handleRetryProcessing}>
                Retry
              </button>
            ) : null}
            {busy ? (
              <button className={styles.secondaryButton} type="button" onClick={handleCancelProcessing}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        <div className={styles.statusRow} aria-live="polite">
          {status ? (
            <p id="brainDumpStatus" className={styles.status}>
              {status}
            </p>
          ) : null}
          {error ? (
            <p id="brainDumpError" className={styles.error} role="alert" tabIndex={-1} ref={errorSummaryRef}>
              {error}
            </p>
          ) : null}
        </div>

        {session ? (
          <section className={styles.review} aria-labelledby="brainDumpReviewTitle">
            <div className={styles.reviewHeader}>
              <h2 id="brainDumpReviewTitle" className={styles.reviewTitle}>
                Review
              </h2>
              <p className={styles.selectedCount}>
                {selectedCount} selected of {session.review.items.length}
              </p>
            </div>
            <div className={styles.reviewList}>
              {session.review.items.map((item) => (
                <article className={styles.reviewItem} key={item.id} data-supported={String(item.supported)}>
                  <div className={styles.reviewItemHeader}>
                    <label className={styles.reviewControls}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.title}`}
                        checked={item.supported && item.selected}
                        disabled={!item.supported || session.state === "completed" || busy}
                        onChange={(event) => updateReviewItem(item.id, { selected: event.target.checked })}
                      />
                      <input
                        className={styles.titleInput}
                        value={item.title}
                        disabled={session.state === "completed" || busy}
                        onChange={(event) => updateReviewItem(item.id, { title: event.target.value })}
                      />
                    </label>
                    <span className={item.supported ? styles.supportedBadge : styles.unsupportedBadge}>
                      {item.supported ? (item.selected ? "Selected" : "Review") : "Unsupported"}
                    </span>
                  </div>
                  <p className={styles.itemMeta}>
                    {item.itemType} | {Math.round(item.confidence * 100)}%
                  </p>
                  {item.sourceEvidence.length ? <p className={styles.evidence}>{item.sourceEvidence.join(" ")}</p> : null}
                  {item.ambiguityFlags.length ? <p className={styles.flags}>{item.ambiguityFlags.join(" ")}</p> : null}
                  {item.validationErrors.length ? (
                    <ul className={styles.validationErrors} aria-label={`Review errors for ${item.title || "item"}`}>
                      {item.validationErrors.map((validationError) => (
                        <li key={`${validationError.field}-${validationError.message}`}>{validationError.message}</li>
                      ))}
                    </ul>
                  ) : null}
                  {item.duplicateWarnings.length ? (
                    <section className={styles.duplicateWarning} aria-label={`Possible duplicates for ${item.title}`}>
                      <p className={styles.flags}>Possible duplicate</p>
                      {item.duplicateWarnings.map((warning) => (
                        <p className={styles.duplicateContext} key={warning.id}>
                          {warning.reason} Matched {warning.matchedState}: {warning.matchedTitle}
                        </p>
                      ))}
                      <div className={styles.duplicateActions}>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          disabled={session.state === "completed" || busy}
                          aria-pressed={item.duplicateDecision === "create_anyway"}
                          onClick={() => updateReviewItem(item.id, { duplicateDecision: "create_anyway", selected: true })}
                        >
                          Create anyway
                        </button>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          disabled={session.state === "completed" || busy}
                          aria-pressed={item.duplicateDecision === "skip"}
                          onClick={() => updateReviewItem(item.id, { duplicateDecision: "skip", selected: false })}
                        >
                          Skip
                        </button>
                      </div>
                    </section>
                  ) : null}
                  <div className={styles.dateReview}>
                    <label className={styles.label} htmlFor={`brainDumpDate-${item.id}`}>
                      Date
                    </label>
                    <input
                      id={`brainDumpDate-${item.id}`}
                      className={styles.titleInput}
                      type="date"
                      aria-label={`Date for ${item.title}`}
                      value={item.date.resolvedDate || ""}
                      disabled={session.state === "completed" || busy}
                      onChange={(event) =>
                        updateReviewItem(item.id, {
                          date: {
                            ...item.date,
                            resolvedDate: event.target.value || null,
                            userConfirmedDate: true,
                            ambiguity: event.target.value ? "none" : item.date.ambiguity,
                            ambiguityFlags: event.target.value ? [] : item.date.ambiguityFlags,
                          },
                        })
                      }
                    />
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={!item.date.resolvedDate || session.state === "completed" || busy}
                      onClick={() =>
                        updateReviewItem(item.id, {
                          date: {
                            ...item.date,
                            resolvedDate: null,
                            userConfirmedDate: true,
                          },
                        })
                      }
                    >
                      Remove date
                    </button>
                    <p className={styles.dateMeta}>
                      {item.date.dateSource} {item.date.originalDateText ? `| ${item.date.originalDateText}` : ""}
                    </p>
                    {item.date.ambiguityFlags.length ? <p className={styles.flags}>{item.date.ambiguityFlags.join(" ")}</p> : null}
                  </div>
                  <details className={styles.optionalDetails}>
                    <summary>Optional details</summary>
                    <div className={styles.optionalGrid}>
                      <label className={styles.label} htmlFor={`brainDumpNotes-${item.id}`}>
                        Notes
                      </label>
                      <textarea
                        id={`brainDumpNotes-${item.id}`}
                        className={styles.textarea}
                        aria-label={`Notes for ${item.title}`}
                        value={item.enrichment.notes || ""}
                        disabled={session.state === "completed" || busy}
                        onChange={(event) =>
                          updateReviewItem(item.id, {
                            enrichment: { ...item.enrichment, notes: event.target.value || null },
                          })
                        }
                      />
                      <label className={styles.label} htmlFor={`brainDumpDuration-${item.id}`}>
                        Duration
                      </label>
                      <input
                        id={`brainDumpDuration-${item.id}`}
                        className={styles.titleInput}
                        type="number"
                        min="1"
                        max="1440"
                        inputMode="numeric"
                        aria-label={`Estimated duration minutes for ${item.title}`}
                        value={item.enrichment.estimatedDurationMinutes ?? ""}
                        disabled={session.state === "completed" || busy}
                        onChange={(event) =>
                          updateReviewItem(item.id, {
                            enrichment: {
                              ...item.enrichment,
                              estimatedDurationMinutes: event.target.value ? Math.max(1, Number(event.target.value)) : null,
                            },
                          })
                        }
                      />
                      <label className={styles.label} htmlFor={`brainDumpPriority-${item.id}`}>
                        Priority
                      </label>
                      <select
                        id={`brainDumpPriority-${item.id}`}
                        className={styles.titleInput}
                        aria-label={`Priority for ${item.title}`}
                        value={item.enrichment.priority || ""}
                        disabled={session.state === "completed" || busy}
                        onChange={(event) =>
                          updateReviewItem(item.id, {
                            enrichment: {
                              ...item.enrichment,
                              priority: event.target.value === "low" || event.target.value === "medium" || event.target.value === "high"
                                ? event.target.value
                                : null,
                            },
                          })
                        }
                      >
                        <option value="">None</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <label className={styles.label} htmlFor={`brainDumpFirstAction-${item.id}`}>
                        First action
                      </label>
                      <input
                        id={`brainDumpFirstAction-${item.id}`}
                        className={styles.titleInput}
                        aria-label={`First action for ${item.title}`}
                        value={item.enrichment.firstAction || ""}
                        disabled={session.state === "completed" || busy}
                        onChange={(event) =>
                          updateReviewItem(item.id, {
                            enrichment: { ...item.enrichment, firstAction: event.target.value || null },
                          })
                        }
                      />
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        disabled={session.state === "completed" || busy}
                        onClick={() =>
                          updateReviewItem(item.id, {
                            enrichment: {
                              notes: null,
                              estimatedDurationMinutes: null,
                              priority: null,
                              firstAction: null,
                            },
                          })
                        }
                      >
                        Clear optional details
                      </button>
                    </div>
                  </details>
                </article>
              ))}
            </div>
            <div className={styles.reviewActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={busy || session.state === "completed"}
                onClick={handleSaveReview}
              >
                Save review
              </button>
              <button
                className={styles.submitButton}
                type="button"
                disabled={selectedCount === 0 || busy || session.state === "completed"}
                onClick={handleConfirm}
              >
                {busy ? "Creating" : `Create ${selectedCount}`}
              </button>
              {batchResult ? (
                <>
                  {undoAvailable ? (
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      aria-label="Undo Brain Dump task creation"
                      disabled={busy}
                      onClick={handleUndoBatch}
                    >
                      Undo
                    </button>
                  ) : null}
                  <a className={styles.backLink} href={taskLaunchHref} onClick={handleBackNavigation}>
                    Tasks
                  </a>
                </>
              ) : null}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
