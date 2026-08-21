"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, type MouseEvent, type SyntheticEvent } from "react";
import { deleteObject, ref, uploadBytesResumable } from "firebase/storage";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseStorageClient } from "@/lib/firebaseStorageClient";
import { trackEvent } from "@/lib/firebaseTelemetry";
import { getApiUrl } from "@/app/tasktimer/lib/apiClient";
import { resolveStandaloneRouteBackTarget } from "@/app/tasktimer/lib/routeBack";
import { resolveTaskTimerRouteHref } from "@/app/tasktimer/lib/routeHref";
import AppImg from "@/components/AppImg";

import styles from "./BrainDump.module.css";

const BRAIN_DUMP_TEXT_LIMIT = 20_000;
const BRAIN_DUMP_VOICE_MIME_TYPE = "audio/wav";
const BRAIN_DUMP_VOICE_SAMPLE_RATE = 16_000;
const BRAIN_DUMP_VOICE_MAX_MS = 5 * 60 * 1000;
const BRAIN_DUMP_VOICE_MAX_BYTES = 10 * 1024 * 1024;
const BRAIN_DUMP_VOICE_LABEL = "Voice";
const BRAIN_DUMP_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const BRAIN_DUMP_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const BRAIN_DUMP_IMAGE_LABEL = "Image";
const BRAIN_DUMP_IMAGE_TYPES = new Set(BRAIN_DUMP_IMAGE_ACCEPT.split(","));
const TASKTIMER_STORAGE_KEY = "taskticker_tasks_v1";
const BRAIN_DUMP_TYPED_DRAFT_KEY = `${TASKTIMER_STORAGE_KEY}:brainDump:typedDraft:v1`;
const BRAIN_DUMP_CAPTURE_MODE_KEY = `${TASKTIMER_STORAGE_KEY}:brainDump:captureMode:v1`;

type BrainDumpCaptureMode = "typed" | "voice" | "image";
type BrainDumpVoiceState = "idle" | "recording" | "paused" | "recorded" | "transcribing" | "transcript";
type BrainDumpImageState = "idle" | "ready" | "processing";
type BrainDumpTimeGoalUnit = "minute" | "hour";
type BrainDumpTimeGoalPeriod = "day" | "week";
type BrainDumpReviewTaskType = "recurring" | "once-off";

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
    const stored = window.localStorage.getItem(BRAIN_DUMP_CAPTURE_MODE_KEY);
    if (stored === "voice" || stored === "image") return stored;
    return "typed";
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

function createVoiceBrainDumpId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function durationBucket(durationMs: number) {
  const seconds = Math.max(0, Math.ceil(durationMs / 1000));
  if (seconds <= 30) return "0-30s";
  if (seconds <= 60) return "31-60s";
  if (seconds <= 180) return "1-3m";
  return "3-5m";
}

function fileSizeBucket(sizeBytes: number) {
  if (sizeBytes <= 1024 * 1024) return "0-1mb";
  if (sizeBytes <= 5 * 1024 * 1024) return "1-5mb";
  return "5-10mb";
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
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined";
}

function encodeVoiceWav(chunks: Float32Array[], sourceSampleRate: number) {
  const sourceLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const source = new Float32Array(sourceLength);
  let offset = 0;
  for (const chunk of chunks) {
    source.set(chunk, offset);
    offset += chunk.length;
  }
  const sampleRate = Math.min(BRAIN_DUMP_VOICE_SAMPLE_RATE, Math.max(1, Math.floor(sourceSampleRate) || BRAIN_DUMP_VOICE_SAMPLE_RATE));
  const sampleCount = Math.ceil((source.length * sampleRate) / Math.max(1, sourceSampleRate));
  const bytes = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(bytes);
  const writeText = (position: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(position + index, value.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const sourceIndex = Math.min(source.length - 1, Math.floor((index * sourceSampleRate) / sampleRate));
    const sample = Math.max(-1, Math.min(1, source[sourceIndex] || 0));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([bytes], { type: BRAIN_DUMP_VOICE_MIME_TYPE });
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

function payloadError(message: string, code?: string) {
  return Object.assign(new Error(message), { code });
}

function requestErrorCode(error: unknown) {
  return typeof (error as { code?: unknown })?.code === "string" ? String((error as { code?: unknown }).code) : "";
}

function normalizeTimeGoalUnit(value: unknown): BrainDumpTimeGoalUnit {
  return value === "hour" ? "hour" : "minute";
}

function normalizeTimeGoalPeriod(value: unknown): BrainDumpTimeGoalPeriod {
  return value === "week" ? "week" : "day";
}

function maxTimeGoalValue(unit: BrainDumpTimeGoalUnit, period: BrainDumpTimeGoalPeriod) {
  if (period === "day") return unit === "minute" ? 24 * 60 : 24;
  return unit === "minute" ? 7 * 24 * 60 : 7 * 24;
}

function normalizeTimeGoalValue(value: unknown, unit: BrainDumpTimeGoalUnit, period: BrainDumpTimeGoalPeriod) {
  if (value === "" || value === null) return null;
  const amount = Math.floor(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.min(maxTimeGoalValue(unit, period), amount);
}

function timeGoalMinutes(value: number | null, unit: BrainDumpTimeGoalUnit) {
  if (!value || value <= 0) return null;
  return unit === "hour" ? value * 60 : value;
}

function getReviewTimeGoalUnit(enrichment: BrainDumpReviewEnrichment): BrainDumpTimeGoalUnit {
  return normalizeTimeGoalUnit(enrichment.timeGoalUnit);
}

function getReviewTimeGoalPeriod(enrichment: BrainDumpReviewEnrichment): BrainDumpTimeGoalPeriod {
  return normalizeTimeGoalPeriod(enrichment.timeGoalPeriod);
}

function getReviewTimeGoalValue(enrichment: BrainDumpReviewEnrichment) {
  const unit = getReviewTimeGoalUnit(enrichment);
  const period = getReviewTimeGoalPeriod(enrichment);
  return normalizeTimeGoalValue(enrichment.timeGoalValue ?? enrichment.estimatedDurationMinutes, unit, period);
}

function buildTimeGoalEnrichment(
  enrichment: BrainDumpReviewEnrichment,
  patch: {
    timeGoalValue?: number | string | null;
    timeGoalUnit?: BrainDumpTimeGoalUnit;
    timeGoalPeriod?: BrainDumpTimeGoalPeriod;
  }
): BrainDumpReviewEnrichment {
  const unit = normalizeTimeGoalUnit(patch.timeGoalUnit ?? enrichment.timeGoalUnit);
  const period = normalizeTimeGoalPeriod(patch.timeGoalPeriod ?? enrichment.timeGoalPeriod);
  const value = normalizeTimeGoalValue(
    Object.prototype.hasOwnProperty.call(patch, "timeGoalValue") ? patch.timeGoalValue : getReviewTimeGoalValue(enrichment),
    unit,
    period
  );
  return {
    ...enrichment,
    estimatedDurationMinutes: timeGoalMinutes(value, unit),
    timeGoalValue: value,
    timeGoalUnit: unit,
    timeGoalPeriod: period,
  };
}

type BrainDumpReviewItem = {
  id: string;
  itemType: string;
  taskType?: BrainDumpReviewTaskType;
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
  timeGoalValue?: number | null;
  timeGoalUnit?: BrainDumpTimeGoalUnit;
  timeGoalPeriod?: BrainDumpTimeGoalPeriod;
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
  state: "review" | "completed" | "expired";
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

type BrainDumpClientProps = {
  embedded?: boolean;
  onBack?: () => void;
};

export default function BrainDumpClient({ embedded = false, onBack }: BrainDumpClientProps) {
  const [captureMode, setCaptureMode] = useState<BrainDumpCaptureMode>("typed");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [voiceState, setVoiceState] = useState<BrainDumpVoiceState>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [voicePlaybackDiagnostic, setVoicePlaybackDiagnostic] = useState("");
  const [voiceElapsedMs, setVoiceElapsedMs] = useState(0);
  const [voiceUploadProgressPct, setVoiceUploadProgressPct] = useState(0);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceAudioBlob, setVoiceAudioBlob] = useState<Blob | null>(null);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState("");
  const [voiceBrainDumpId, setVoiceBrainDumpId] = useState("");
  const [voiceStoragePath, setVoiceStoragePath] = useState("");
  const [imageState, setImageState] = useState<BrainDumpImageState>("idle");
  const [imageError, setImageError] = useState("");
  const [imageFileName, setImageFileName] = useState("");
  const [imageMimeType, setImageMimeType] = useState("");
  const [imageSizeBytes, setImageSizeBytes] = useState(0);
  const [imageBase64, setImageBase64] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [imageInstruction, setImageInstruction] = useState("");
  const [imageUploadProgressPct, setImageUploadProgressPct] = useState(0);
  const [recoverableFailure, setRecoverableFailure] = useState(false);
  const [session, setSession] = useState<BrainDumpReviewSession | null>(null);
  const [removedReviewItemIds, setRemovedReviewItemIds] = useState<Set<string>>(() => new Set());
  const [batchResult, setBatchResult] = useState<BrainDumpCreationBatchResult | null>(null);
  const [undoResult, setUndoResult] = useState<BrainDumpUndoBatchResult | null>(null);
  const [creatingTasks, setCreatingTasks] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmIdempotencyKey, setConfirmIdempotencyKey] = useState("");
  const autoRetriedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const errorSummaryRef = useRef<HTMLParagraphElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceMeterStreamRef = useRef<MediaStream | null>(null);
  const voicePcmChunksRef = useRef<Float32Array[]>([]);
  const voicePcmSampleRateRef = useRef(BRAIN_DUMP_VOICE_SAMPLE_RATE);
  const voiceCaptureRef = useRef<{ paused: boolean; processor: ScriptProcessorNode; source: MediaStreamAudioSourceNode; silence: GainNode } | null>(null);
  const voiceSegmentStartedAtMsRef = useRef(0);
  const voiceElapsedBeforePauseMsRef = useRef(0);
  const voiceTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const voiceLevelFrameRef = useRef<number | null>(null);
  const voiceAudioUrlRef = useRef("");
  const voicePlaybackRef = useRef<HTMLAudioElement | null>(null);
  const voiceTranscriptEditedRef = useRef(false);
  const imagePreviewUrlRef = useRef("");
  const trimmedText = text.trim();
  const voiceBusy = voiceState === "recording" || voiceState === "paused" || voiceState === "transcribing";
  const imageBusy = imageState === "processing";
  const canProcessImage = !!imageBase64 && imageState === "ready" && !busy;
  const canSubmit = captureMode === "image"
    ? canProcessImage
    : trimmedText.length > 0 &&
      trimmedText.length <= BRAIN_DUMP_TEXT_LIMIT &&
      !busy &&
      !voiceBusy &&
      (captureMode !== "voice" || (voiceState === "transcript" && !!voiceBrainDumpId));
  const remaining = BRAIN_DUMP_TEXT_LIMIT - text.length;
  const selectedCount = session?.review.items.filter((item) => item.supported && item.selected && !removedReviewItemIds.has(item.id)).length ?? 0;
  const undoExpiresAtMs = batchResult?.state === "completed" ? batchResult.completedAtMs + 30_000 : 0;
  const undoAvailable = !!batchResult && batchResult.state === "completed" && !undoResult && nowMs <= undoExpiresAtMs;
  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);
  const taskLaunchHref = resolveTaskTimerRouteHref(onBack ? "/executive" : "/tasklaunch");
  const primitiveSecondaryButtonClass = embedded
    ? `${styles.secondaryButton} btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction brainDumpPrimitiveAction`
    : styles.secondaryButton;
  const primitivePrimaryButtonClass = embedded
    ? `${styles.submitButton} btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction brainDumpPrimitiveAction brainDumpPrimitivePrimaryAction`
    : styles.submitButton;
  const primitiveTextareaClass = embedded ? `${styles.textarea} brainDumpPrimitiveTextarea` : styles.textarea;
  const primitiveInputClass = embedded ? `${styles.titleInput} brainDumpPrimitiveInput` : styles.titleInput;
  const primitiveBackLinkClass = styles.backLink;

  function handleBackNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (typeof window === "undefined") return;
    event.preventDefault();
    if (onBack) {
      onBack();
      return;
    }
    const backTarget = resolveStandaloneRouteBackTarget("/tasklaunch");
    window.location.href = resolveTaskTimerRouteHref(backTarget);
  }

  function handleRequestError(err: unknown, fallback: string) {
    const nextCode = requestErrorCode(err);
    setError(err instanceof Error ? err.message : fallback);
    setErrorCode(nextCode);
    if (nextCode === "brain-dump/expired") {
      setSession(null);
      setRemovedReviewItemIds(new Set());
      setBatchResult(null);
      setUndoResult(null);
      setConfirmIdempotencyKey("");
    }
  }

  function handleStartFreshAfterExpiry() {
    handleClearDraft();
    setErrorCode("");
  }

  useEffect(() => {
    if (error) errorSummaryRef.current?.focus();
  }, [error]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCaptureMode(readStoredCaptureMode());
      setText(readStoredDraft());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!batchResult || batchResult.state !== "completed" || undoResult) return;
    const timer = window.setTimeout(() => setNowMs(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [batchResult, nowMs, undoResult]);

  useEffect(() => {
    voiceAudioUrlRef.current = voiceAudioUrl;
  }, [voiceAudioUrl]);

  useEffect(() => {
    imagePreviewUrlRef.current = imagePreviewUrl;
  }, [imagePreviewUrl]);

  useEffect(() => {
    return () => {
      clearVoiceTimer();
      stopVoiceLevelMeter();
      stopVoiceStream();
      if (voiceAudioUrlRef.current) URL.revokeObjectURL(voiceAudioUrlRef.current);
      if (imagePreviewUrlRef.current) URL.revokeObjectURL(imagePreviewUrlRef.current);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (captureMode === "image") {
      await handleProcessImage();
      return;
    }
    await submitForReview({ allowAutoRetry: true });
  }

  function handleTextChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextText = event.target.value;
    setText(nextText);
    writeStoredDraft(nextText);
    if (captureMode === "voice" && voiceState === "transcript" && !voiceTranscriptEditedRef.current) {
      voiceTranscriptEditedRef.current = true;
      void trackEvent("brain_dump_transcript_edited", { mode: "voice" });
    }
    if (recoverableFailure) setRecoverableFailure(false);
  }

  function handleCaptureModeChange(nextMode: BrainDumpCaptureMode) {
    setCaptureMode(nextMode);
    writeStoredCaptureMode(nextMode);
  }

  function resetImageUpload() {
    setImageState("idle");
    setImageError("");
    setImageFileName("");
    setImageMimeType("");
    setImageSizeBytes(0);
    setImageBase64("");
    setImageUploadProgressPct(0);
    setImagePreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return "";
    });
  }

  async function handleImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setImageError("");
    setImageUploadProgressPct(0);
    if (!file) return;
    if (!BRAIN_DUMP_IMAGE_TYPES.has(file.type)) {
      resetImageUpload();
      setImageError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (!file.size) {
      resetImageUpload();
      setImageError("Brain Dump image is empty or unreadable.");
      return;
    }
    if (file.size > BRAIN_DUMP_IMAGE_MAX_BYTES) {
      resetImageUpload();
      setImageError("Brain Dump images must be 10 MB or smaller.");
      return;
    }
    try {
      const nextImageBase64 = await readBlobAsBase64(file);
      if (!nextImageBase64) throw new Error("Brain Dump image is empty or unreadable.");
      setImageFileName(file.name);
      setImageMimeType(file.type);
      setImageSizeBytes(file.size);
      setImageBase64(nextImageBase64);
      setImagePreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return URL.createObjectURL(file);
      });
      setImageState("ready");
      setStatus("Image ready");
      setRecoverableFailure(false);
    } catch (err) {
      resetImageUpload();
      setImageError(err instanceof Error ? err.message : "Brain Dump image is empty or unreadable.");
    } finally {
      event.target.value = "";
    }
  }

  function handleRemoveImage() {
    resetImageUpload();
    setStatus("Image removed");
    void trackEvent("brain_dump_image_removed", { mode: "image" });
  }

  async function discardUploadedVoiceSource() {
    const path = voiceStoragePath;
    setVoiceStoragePath("");
    if (!path) return;
    const storage = getFirebaseStorageClient();
    if (!storage) return;
    await deleteObject(ref(storage, path)).catch(() => {});
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
    const capture = voiceCaptureRef.current;
    voiceCaptureRef.current = null;
    capture?.processor.disconnect();
    capture?.source.disconnect();
    capture?.silence.disconnect();
    if (capture) capture.processor.onaudioprocess = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
    voiceMeterStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceMeterStreamRef.current = null;
    setVoiceLevel(0);
  }

  function startVoiceLevelMeter(stream: MediaStream) {
    stopVoiceLevelMeter();
    try {
      const meterStream = stream.clone();
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(meterStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silence = audioContext.createGain();
      silence.gain.value = 0;
      const samples = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      source.connect(processor);
      processor.connect(silence);
      silence.connect(audioContext.destination);
      audioContextRef.current = audioContext;
      voiceMeterStreamRef.current = meterStream;
      voicePcmSampleRateRef.current = audioContext.sampleRate;
      voiceCaptureRef.current = { paused: false, processor, source, silence };
      processor.onaudioprocess = (event) => {
        if (!voiceCaptureRef.current?.paused) voicePcmChunksRef.current.push(event.inputBuffer.getChannelData(0).slice());
      };
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
    setVoicePlaybackDiagnostic("");
    setVoiceUploadProgressPct(0);
    void discardUploadedVoiceSource();
    setVoiceBrainDumpId("");
    voiceTranscriptEditedRef.current = false;
    clearVoiceAudio();
    if (!browserSupportsVoiceRecording()) {
      setVoiceError("Voice recording is not available in this browser.");
      void trackEvent("brain_dump_voice_recording_unavailable", { mode: "voice" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      voicePcmChunksRef.current = [];
      voiceElapsedBeforePauseMsRef.current = 0;
      voiceSegmentStartedAtMsRef.current = Date.now();
      setVoiceElapsedMs(0);
      startVoiceLevelMeter(stream);
      startVoiceTimer();
      setVoiceState("recording");
      setStatus("Recording");
      void trackEvent("brain_dump_recording_started", { mode: "voice", mime_type: BRAIN_DUMP_VOICE_MIME_TYPE });
    } catch (err) {
      stopVoiceStream();
      stopVoiceLevelMeter();
      setVoiceState("idle");
      setVoiceError(err instanceof DOMException && err.name === "NotAllowedError" ? "Microphone permission was denied." : "Could not start recording.");
      void trackEvent("brain_dump_voice_permission_denied", { mode: "voice" });
    }
  }

  function handlePauseVoiceRecording() {
    if (!voiceCaptureRef.current || voiceState !== "recording") return;
    const elapsedMs = getCurrentVoiceElapsedMs();
    voiceElapsedBeforePauseMsRef.current = elapsedMs;
    voiceSegmentStartedAtMsRef.current = 0;
    voiceCaptureRef.current.paused = true;
    clearVoiceTimer();
    setVoiceElapsedMs(elapsedMs);
    setVoiceLevel(0);
    setVoiceState("paused");
    setStatus("Recording paused");
  }

  function handleResumeVoiceRecording() {
    if (!voiceCaptureRef.current || voiceState !== "paused") return;
    voiceSegmentStartedAtMsRef.current = Date.now();
    voiceCaptureRef.current.paused = false;
    startVoiceTimer();
    setVoiceState("recording");
    setStatus("Recording");
  }

  function handleStopVoiceRecording() {
    if (!voiceCaptureRef.current) return;
    const durationMs = getCurrentVoiceElapsedMs();
    voiceCaptureRef.current.paused = true;
    voiceElapsedBeforePauseMsRef.current = durationMs;
    voiceSegmentStartedAtMsRef.current = 0;
    setVoiceElapsedMs(durationMs);
    clearVoiceTimer();
    const chunks = voicePcmChunksRef.current;
    const blob = encodeVoiceWav(chunks, voicePcmSampleRateRef.current);
    stopVoiceLevelMeter();
    stopVoiceStream();
    setVoicePlaybackDiagnostic(`Recorder output: ${blob.size.toLocaleString()} bytes, WAV PCM at ${BRAIN_DUMP_VOICE_SAMPLE_RATE.toLocaleString()} Hz.`);
    if (blob.size > BRAIN_DUMP_VOICE_MAX_BYTES) {
      setVoiceState("idle");
      setVoiceError("Brain Dump voice recordings must be 10 MB or smaller.");
    } else if (blob.size > 44) {
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
  }

  function handleVoicePlaybackLoadedMetadata(event: SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget;
    if (Number.isFinite(audio.duration) && audio.duration > 0) return;
    const originalCurrentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const restoreCurrentTime = () => {
      audio.removeEventListener("durationchange", restoreCurrentTime);
      try {
        audio.currentTime = originalCurrentTime;
      } catch {}
    };
    audio.addEventListener("durationchange", restoreCurrentTime);
    try {
      audio.currentTime = Number.MAX_SAFE_INTEGER;
    } catch {
      audio.removeEventListener("durationchange", restoreCurrentTime);
    }
  }

  async function handlePlayVoiceRecording() {
    const audio = voicePlaybackRef.current;
    if (!audio || !voiceAudioUrl) return;
    setVoiceError("");
    try {
      if (!audio.src) audio.src = voiceAudioUrl;
      if (audio.ended) audio.currentTime = 0;
      await audio.play();
    } catch {
      setVoiceError("TaskLaunch could not play this recording. Try recording again, then transcribe.");
    }
  }

  function handleVoicePlaybackError(event: SyntheticEvent<HTMLAudioElement>) {
    const mediaErrorCode = event.currentTarget.error?.code || 0;
    const mediaError =
      mediaErrorCode === MediaError.MEDIA_ERR_ABORTED
        ? "playback was aborted"
        : mediaErrorCode === MediaError.MEDIA_ERR_NETWORK
          ? "a network error occurred"
          : mediaErrorCode === MediaError.MEDIA_ERR_DECODE
            ? "the recorded audio could not be decoded"
            : mediaErrorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
              ? "the recorded audio format is not supported"
              : "the browser did not expose an error code";
    setVoicePlaybackDiagnostic((current) => `${current} Browser media error ${mediaErrorCode}: ${mediaError}.`);
  }

  function resetVoiceRecording() {
    voicePcmChunksRef.current = [];
    voiceElapsedBeforePauseMsRef.current = 0;
    voiceSegmentStartedAtMsRef.current = 0;
    clearVoiceTimer();
    stopVoiceLevelMeter();
    stopVoiceStream();
    clearVoiceAudio();
    void discardUploadedVoiceSource();
    setVoiceBrainDumpId("");
    voiceTranscriptEditedRef.current = false;
    setVoiceState("idle");
    setVoiceElapsedMs(0);
    setVoiceUploadProgressPct(0);
    setVoiceError("");
    setVoicePlaybackDiagnostic("");
  }

  function handleCancelVoiceRecording() {
    resetVoiceRecording();
    setStatus("Recording cancelled");
    void trackEvent("brain_dump_voice_recording_cancelled", { mode: "voice" });
  }

  async function handleTranscribeVoiceRecording() {
    if (!voiceAudioBlob || busy || voiceState === "transcribing") return;
    const durationMs = Math.max(1, Math.floor(voiceElapsedMs || voiceElapsedBeforePauseMsRef.current));
    if (durationMs > BRAIN_DUMP_VOICE_MAX_MS) {
      setVoiceError("Brain Dump voice recordings must be five minutes or shorter.");
      return;
    }
    if (!voiceAudioBlob.size || voiceAudioBlob.size > BRAIN_DUMP_VOICE_MAX_BYTES) {
      setVoiceError("Brain Dump voice recordings must be 10 MB or smaller.");
      return;
    }
    setVoiceState("transcribing");
    setVoiceError("");
    setErrorCode("");
    setVoiceUploadProgressPct(5);
    setStatus("Uploading recording securely");
    const startedAtMs = Date.now();
    void trackEvent("brain_dump_recording_submitted", {
      mode: "voice",
      duration_bucket: durationBucket(durationMs),
      file_size_bucket: fileSizeBucket(voiceAudioBlob.size),
      mime_type: voiceAudioBlob.type || BRAIN_DUMP_VOICE_MIME_TYPE,
    });
    let attemptedStoragePath = voiceStoragePath;
    let storageForCleanup: ReturnType<typeof getFirebaseStorageClient> = null;
    try {
      const auth = getFirebaseAuthClient();
      const user = auth?.currentUser || null;
      const idToken = await user?.getIdToken();
      if (!user?.uid || !idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const storage = getFirebaseStorageClient();
      if (!storage) throw new Error("Secure recording upload is not available. Please try typing your Brain Dump instead.");
      storageForCleanup = storage;

      const brainDumpId = voiceBrainDumpId || createVoiceBrainDumpId();
      const storagePath = voiceStoragePath || `users/${user.uid}/brain-dump-sources/${brainDumpId}/recording.wav`;
      attemptedStoragePath = storagePath;
      if (!voiceStoragePath) {
        const uploadTask = uploadBytesResumable(ref(storage, storagePath), voiceAudioBlob, {
          contentType: voiceAudioBlob.type || BRAIN_DUMP_VOICE_MIME_TYPE,
          customMetadata: { durationMs: String(durationMs) },
        });
        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const ratio = snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0;
              setVoiceUploadProgressPct(Math.max(5, Math.min(60, Math.round(5 + ratio * 55))));
            },
            reject,
            resolve
          );
        });
        setVoiceBrainDumpId(brainDumpId);
        setVoiceStoragePath(storagePath);
        void trackEvent("brain_dump_audio_uploaded", {
          mode: "voice",
          duration_bucket: durationBucket(durationMs),
          file_size_bucket: fileSizeBucket(voiceAudioBlob.size),
          mime_type: voiceAudioBlob.type || BRAIN_DUMP_VOICE_MIME_TYPE,
        });
      }

      setVoiceUploadProgressPct(65);
      setStatus("Transcribing recording");
      void trackEvent("brain_dump_transcription_started", {
        mode: "voice",
        duration_bucket: durationBucket(durationMs),
        mime_type: voiceAudioBlob.type || BRAIN_DUMP_VOICE_MIME_TYPE,
      });
      const response = await fetch(getApiUrl("/api/brain-dump/transcriptions/"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify({
          brainDumpId,
          storagePath,
          durationMs,
        }),
      });
      const payload = (await response.json()) as { brainDumpId?: string; transcript?: string; model?: string; error?: string; code?: string };
      if (!response.ok || !payload.transcript) throw payloadError(payload.error || "Brain Dump recording could not be transcribed.", payload.code);
      setText(payload.transcript);
      writeStoredDraft(payload.transcript);
      setVoiceBrainDumpId(payload.brainDumpId || brainDumpId);
      setVoiceStoragePath("");
      voiceTranscriptEditedRef.current = false;
      setVoiceUploadProgressPct(100);
      setVoiceState("transcript");
      setStatus("Editable transcript ready");
      setRecoverableFailure(false);
      void trackEvent("brain_dump_transcription_completed", {
        mode: "voice",
        duration_bucket: durationBucket(durationMs),
        mime_type: voiceAudioBlob.type || BRAIN_DUMP_VOICE_MIME_TYPE,
        model: payload.model || "unknown",
        latency_ms: Date.now() - startedAtMs,
      });
    } catch (err) {
      if (attemptedStoragePath && storageForCleanup) {
        await deleteObject(ref(storageForCleanup, attemptedStoragePath)).catch(() => {});
      }
      setVoiceStoragePath("");
      setVoiceState("recorded");
      setVoiceUploadProgressPct(0);
      const code = requestErrorCode(err);
      const safeMessage = code.startsWith("auth/")
        ? err instanceof Error ? err.message : "Your sign-in session is no longer valid. Please sign in again."
        : "TaskLaunch couldn't transcribe this recording reliably. Your recording has not been turned into tasks.";
      setVoiceError(safeMessage);
      setStatus("");
      setRecoverableFailure(true);
      void trackEvent("brain_dump_transcription_failed", {
        mode: "voice",
        duration_bucket: durationBucket(durationMs),
        mime_type: voiceAudioBlob.type || BRAIN_DUMP_VOICE_MIME_TYPE,
        error_category: code || "unknown",
        latency_ms: Date.now() - startedAtMs,
      });
    }
  }

  async function handleProcessImage() {
    if (!canProcessImage || imageBusy) return;
    setBusy(true);
    setImageState("processing");
    setImageError("");
    setError("");
    setErrorCode("");
    setRecoverableFailure(false);
    setImageUploadProgressPct(20);
    setStatus("Uploading image securely");
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const auth = getFirebaseAuthClient();
      const user = auth?.currentUser || null;
      const idToken = await user?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      setImageUploadProgressPct(65);
      const response = await fetch(getApiUrl("/api/brain-dump/images/"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify({
          imageBase64,
          mimeType: imageMimeType,
          sizeBytes: imageSizeBytes,
          instruction: imageInstruction,
          timezone,
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as { session?: BrainDumpReviewSession; error?: string; code?: string };
      if (!response.ok || !payload.session) throw payloadError(payload.error || "Brain Dump image could not be processed.", payload.code);
      setImageUploadProgressPct(100);
      setImageState("ready");
      setSession(payload.session);
      setRemovedReviewItemIds(new Set());
      setBatchResult(null);
      setUndoResult(null);
      setConfirmIdempotencyKey(createConfirmIdempotencyKey(payload.session.id));
      setStatus("Review ready");
      void trackEvent("brain_dump_image_review_ready", {
        mode: "image",
        mime_type: imageMimeType,
        size_bytes: imageSizeBytes,
        instruction_length: imageInstruction.length,
        item_count: payload.session.review.items.length,
        selected_count: payload.session.review.items.filter((item) => item.selected).length,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("Cancelled");
      } else {
        handleRequestError(err, "Brain Dump image could not be processed.");
        setImageError(err instanceof Error ? err.message : "Brain Dump image could not be processed.");
        setStatus("");
        setRecoverableFailure(true);
        void trackEvent("brain_dump_image_review_failed", {
          mode: "image",
          mime_type: imageMimeType,
          size_bytes: imageSizeBytes,
          instruction_length: imageInstruction.length,
        });
      }
      setImageUploadProgressPct(0);
      setImageState(imageBase64 ? "ready" : "idle");
    } finally {
      setBusy(false);
      abortControllerRef.current = null;
    }
  }

  function handleClearDraft() {
    setText("");
    writeStoredDraft("");
    resetVoiceRecording();
    resetImageUpload();
    setImageInstruction("");
    setError("");
    setErrorCode("");
    setStatus("");
    setRecoverableFailure(false);
    setSession(null);
    setRemovedReviewItemIds(new Set());
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
    setErrorCode("");
    setStatus("Cancelled");
    setRecoverableFailure(false);
    void trackEvent("brain_dump_processing_cancelled", {
      mode: captureMode,
      draft_length: text.length,
    });
  }

  async function handleRetryProcessing() {
    if (captureMode === "image") {
      await handleProcessImage();
      return;
    }
    await submitForReview({ allowAutoRetry: false });
  }

  async function submitForReview(options: { allowAutoRetry: boolean }) {
    if (!canSubmit) return;
    if (options.allowAutoRetry) autoRetriedRef.current = false;
    setBusy(true);
    setError("");
    setErrorCode("");
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
          body: JSON.stringify({
            text: trimmedText,
            timezone,
            ...(captureMode === "voice" && voiceBrainDumpId ? { brainDumpId: voiceBrainDumpId } : {}),
          }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as { session?: BrainDumpReviewSession; error?: string; code?: string };
        if (!response.ok || !payload.session) throw payloadError(payload.error || "Brain Dump could not be processed.", payload.code);
        setStatus("Saving review");
        setSession(payload.session);
        setRemovedReviewItemIds(new Set());
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
        handleRequestError(err, "Brain Dump could not be processed.");
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
    patch: Partial<Pick<BrainDumpReviewItem, "selected" | "title" | "taskType" | "date" | "enrichment" | "duplicateDecision">>
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

  function removeDuplicateReviewItem(itemId: string) {
    setRemovedReviewItemIds((current) => {
      const next = new Set(current);
      next.add(itemId);
      return next;
    });
    updateReviewItem(itemId, { duplicateDecision: "skip", selected: false });
  }

  function buildReviewItemUpdates(currentSession: BrainDumpReviewSession) {
    return currentSession.review.items.map((item) => ({
      itemId: item.id,
      selected: item.supported && item.selected && !removedReviewItemIds.has(item.id),
      taskType: item.taskType === "once-off" ? "once-off" : "recurring",
      title: item.title,
      date: {
        resolvedDate: item.date.resolvedDate,
        userConfirmedDate: item.date.userConfirmedDate,
      },
      enrichment: item.enrichment,
      duplicateDecision: removedReviewItemIds.has(item.id) ? "skip" : item.duplicateDecision,
    }));
  }

  async function handleSaveReview() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    setErrorCode("");
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
      const payload = (await response.json()) as { session?: BrainDumpReviewSession; error?: string; code?: string };
      if (!response.ok || !payload.session) throw payloadError(payload.error || "Brain Dump review could not be saved.", payload.code);
      setSession(payload.session);
      setStatus("Review saved");
      void trackEvent("brain_dump_review_saved", {
        item_count: payload.session.review.items.length,
        selected_count: payload.session.review.items.filter((item) => item.selected).length,
      });
    } catch (err) {
      handleRequestError(err, "Brain Dump review could not be saved.");
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
    setCreatingTasks(true);
    setError("");
    setErrorCode("");
    setStatus("Generating tasks...");
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
      const payload = (await response.json()) as { batch?: BrainDumpCreationBatchResult; error?: string; code?: string };
      if (!response.ok || !payload.batch) throw payloadError(payload.error || "Brain Dump tasks could not be created.", payload.code);
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
      handleRequestError(err, "Brain Dump tasks could not be created.");
      setStatus("");
      void trackEvent("brain_dump_tasks_create_failed", {
        session_id: session.id,
        selected_count: selectedCount,
      });
    } finally {
      setCreatingTasks(false);
      setBusy(false);
    }
  }

  async function handleUndoBatch() {
    if (!session || !batchResult || !undoAvailable || busy) return;
    setBusy(true);
    setError("");
    setErrorCode("");
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
      const payload = (await response.json()) as { undo?: BrainDumpUndoBatchResult; error?: string; code?: string };
      if (!response.ok || !payload.undo) throw payloadError(payload.error || "Brain Dump undo could not be completed.", payload.code);
      setUndoResult(payload.undo);
      setStatus(`Removed ${payload.undo.removedCount}; retained ${payload.undo.retainedCount}`);
      void trackEvent("brain_dump_tasks_undone", {
        removed_count: payload.undo.removedCount,
        retained_count: payload.undo.retainedCount,
      });
    } catch (err) {
      handleRequestError(err, "Brain Dump undo could not be completed.");
      setStatus("");
      void trackEvent("brain_dump_tasks_undo_failed", {
        session_id: session.id,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`${styles.page}${embedded ? " brainDumpEmbedded" : ""}`}>
      <section className={`${styles.shell}${embedded ? " brainDumpEmbeddedShell" : ""}`} aria-labelledby="brainDumpTitle">
        <header className={`${styles.header}${embedded ? " brainDumpEmbeddedHeader" : ""}`}>
          <a className={primitiveBackLinkClass} href={taskLaunchHref} onClick={handleBackNavigation} aria-label="Back">
            <span className={styles.backIcon} aria-hidden="true" />
            <span className={styles.srOnly}>Back</span>
          </a>
          <div>
            <p className={styles.kicker}>Executive Function</p>
            <h1 id="brainDumpTitle" className={`${styles.title}${embedded ? " brainDumpEmbeddedTitle" : ""}`} tabIndex={-1}>
              Brain Dump
            </h1>
          </div>
        </header>

        <form className={`${styles.capture}${embedded ? " brainDumpEmbeddedPanel brainDumpPrimitivePanel" : ""}`} onSubmit={handleSubmit}>
          <div className="brainDumpCaptureModeField">
            <span className={styles.label} id="brainDumpCaptureModeLabel">
              Capture mode
            </span>
            <div className="brainDumpCaptureModePills" role="group" aria-labelledby="brainDumpCaptureModeLabel">
              {([
                ["typed", "Typed"],
                ["voice", BRAIN_DUMP_VOICE_LABEL],
                ["image", BRAIN_DUMP_IMAGE_LABEL],
              ] as const).map(([mode, label]) => (
                <button
                  className={`brainDumpCaptureModePill${embedded ? " btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction brainDumpPrimitiveAction" : ""}`}
                  type="button"
                  key={mode}
                  aria-pressed={captureMode === mode}
                  disabled={busy}
                  onClick={() => handleCaptureModeChange(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {captureMode === "voice" ? (
            <section className={`${styles.voicePanel}${embedded ? " brainDumpPrimitivePanel" : ""}`} aria-label="Voice Brain Dump recorder">
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
                <button className={primitiveSecondaryButtonClass} type="button" disabled={voiceBusy || busy} onClick={handleStartVoiceRecording}>
                  Start
                </button>
                <button
                  className={primitiveSecondaryButtonClass}
                  type="button"
                  disabled={voiceState !== "recording"}
                  onClick={handlePauseVoiceRecording}
                >
                  Pause
                </button>
                <button
                  className={primitiveSecondaryButtonClass}
                  type="button"
                  disabled={voiceState !== "paused"}
                  onClick={handleResumeVoiceRecording}
                >
                  Resume
                </button>
                <button
                  className={primitiveSecondaryButtonClass}
                  type="button"
                  disabled={voiceState !== "recording" && voiceState !== "paused"}
                  onClick={handleStopVoiceRecording}
                >
                  Stop
                </button>
                <button
                  className={primitiveSecondaryButtonClass}
                  type="button"
                  disabled={voiceState === "idle" || voiceState === "transcribing"}
                  onClick={handleCancelVoiceRecording}
                >
                  Cancel recording
                </button>
              </div>
              {voiceAudioUrl ? (
                <div className={styles.voicePlayback}>
                  <button className={primitiveSecondaryButtonClass} type="button" onClick={handlePlayVoiceRecording}>
                    Play recording ({formatVoiceDuration(voiceElapsedMs || voiceElapsedBeforePauseMsRef.current)})
                  </button>
                  <audio
                    ref={voicePlaybackRef}
                    controls
                    preload="metadata"
                    src={voiceAudioUrl}
                    aria-label="Brain Dump voice recording playback"
                    onLoadedMetadata={handleVoicePlaybackLoadedMetadata}
                    onError={handleVoicePlaybackError}
                  />
                  <button
                    className={primitivePrimaryButtonClass}
                    type="button"
                    disabled={!voiceAudioBlob || voiceState === "transcribing" || voiceState === "transcript" || busy}
                    onClick={handleTranscribeVoiceRecording}
                  >
                    {voiceState === "transcribing" ? "Transcribing" : voiceState === "transcript" ? "Transcript ready" : "Transcribe"}
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
              {voicePlaybackDiagnostic ? <p className={styles.count}>{voicePlaybackDiagnostic}</p> : null}
            </section>
          ) : null}
          {captureMode === "image" ? (
            <section className={`${styles.imagePanel}${embedded ? " brainDumpPrimitivePanel" : ""}`} aria-label="Image Brain Dump capture">
              <label className={`${styles.imagePickerLabel}${embedded ? " brainDumpPrimitivePicker" : ""}`} htmlFor="brainDumpImageFile">
                Choose image
              </label>
              <input
                id="brainDumpImageFile"
                className={styles.imageFileInput}
                type="file"
                accept={BRAIN_DUMP_IMAGE_ACCEPT}
                capture="environment"
                disabled={busy}
                onChange={handleImageFileChange}
              />
              {imagePreviewUrl ? (
                <div className={styles.imagePreviewGrid}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Blob preview URL must render the selected local file directly. */}
                  <img
                    className={styles.imagePreview}
                    src={imagePreviewUrl}
                    alt={imageFileName ? `Preview of ${imageFileName}` : "Brain Dump image preview"}
                  />
                  <div className={styles.imageMeta}>
                    <p className={styles.itemMeta}>{imageFileName || "Selected image"}</p>
                    <p className={styles.dateMeta}>
                      {imageMimeType} | {Math.round(imageSizeBytes / 1024)} KB
                    </p>
                    <button className={primitiveSecondaryButtonClass} type="button" disabled={busy} onClick={handleRemoveImage}>
                      Remove image
                    </button>
                  </div>
                </div>
              ) : null}
              <label className={styles.label} htmlFor="brainDumpImageInstruction">
                Image instruction
              </label>
              <textarea
                id="brainDumpImageInstruction"
                className={`${styles.instructionTextarea}${embedded ? " brainDumpPrimitiveTextarea" : ""}`}
                value={imageInstruction}
                maxLength={1000}
                onChange={(event) => setImageInstruction(event.target.value)}
                placeholder="Ignore the grocery list. Extract only tasks from the whiteboard."
              />
              {imageState === "processing" ? (
                <div
                  className={styles.voiceProgress}
                  role="progressbar"
                  aria-label="Image upload progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={imageUploadProgressPct}
                >
                  <span style={{ width: `${imageUploadProgressPct}%` }} />
                </div>
              ) : null}
              {imageError ? (
                <p className={styles.error} role="alert">
                  {imageError}
                </p>
              ) : null}
            </section>
          ) : null}
          <label className={styles.label} htmlFor="brainDumpText">
            {captureMode === "voice" ? "Editable transcript" : "Brain Dump input"}
          </label>
          <textarea
            id="brainDumpText"
            className={primitiveTextareaClass}
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
            <div className={styles.captureActions}>
              <div className={styles.capturePrimaryActions}>
                <button className={primitiveSecondaryButtonClass} type="button" disabled={!text || busy} onClick={handleClearDraft}>
                  Clear draft
                </button>
                {recoverableFailure ? (
                  <button className={primitiveSecondaryButtonClass} type="button" disabled={!canSubmit} onClick={handleRetryProcessing}>
                    Retry
                  </button>
                ) : null}
                <button className={primitivePrimaryButtonClass} type="submit" disabled={!canSubmit}>
                  {busy ? "Analysing" : captureMode === "image" ? "Review image" : "Review"}
                </button>
              </div>
              {busy ? (
                <div className={styles.captureCancelActions}>
                  <button className={primitiveSecondaryButtonClass} type="button" onClick={handleCancelProcessing}>
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
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
          {errorCode === "brain-dump/expired" ? (
            <button className={primitiveSecondaryButtonClass} type="button" onClick={handleStartFreshAfterExpiry}>
              Start fresh
            </button>
          ) : null}
        </div>

        {session ? (
          <section className={`${styles.review}${embedded ? " brainDumpEmbeddedPanel brainDumpPrimitivePanel" : ""}`} aria-labelledby="brainDumpReviewTitle">
            {creatingTasks ? (
              <div className={styles.createOverlay} role="status" aria-live="polite" aria-label="Generating tasks...">
                <div className={styles.createOverlayContent}>
                  <AppImg className={styles.createOverlayIcon} src="/icons/icons_default/executive.webp" alt="" aria-hidden="true" />
                  <p className={styles.createOverlayText}>Generating tasks...</p>
                </div>
              </div>
            ) : null}
            <div className={styles.reviewHeader}>
              <h2 id="brainDumpReviewTitle" className={styles.reviewTitle}>
                Review
              </h2>
              <p className={styles.selectedCount}>
                {selectedCount} selected of {session.review.items.length}
              </p>
            </div>
            <div className={styles.reviewList}>
              {session.review.items.filter((item) => !removedReviewItemIds.has(item.id)).map((item) => {
                const timeGoalUnit = getReviewTimeGoalUnit(item.enrichment);
                const timeGoalPeriod = getReviewTimeGoalPeriod(item.enrichment);
                const timeGoalValue = getReviewTimeGoalValue(item.enrichment);
                const timeGoalMax = maxTimeGoalValue(timeGoalUnit, timeGoalPeriod);
                const taskType = item.taskType === "once-off" ? "once-off" : "recurring";
                return (
                <article className={`${styles.reviewItem}${embedded ? " brainDumpPrimitivePanel brainDumpPrimitiveReviewItem" : ""}`} key={item.id} data-supported={String(item.supported)}>
                  <div className={styles.reviewItemHeader}>
                    <label className={styles.reviewControls}>
                      <input
                        className={embedded ? "brainDumpPrimitiveCheckbox" : undefined}
                        type="checkbox"
                        aria-label={`Select ${item.title}`}
                        checked={item.supported && item.selected}
                        disabled={!item.supported || session.state === "completed" || busy}
                        onChange={(event) => updateReviewItem(item.id, { selected: event.target.checked })}
                      />
                      <input
                        className={primitiveInputClass}
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
                          className={primitiveSecondaryButtonClass}
                          type="button"
                          disabled={session.state === "completed" || busy}
                          aria-pressed={item.duplicateDecision === "create_anyway"}
                          onClick={() => updateReviewItem(item.id, { duplicateDecision: "create_anyway", selected: true })}
                        >
                          Select anyway
                        </button>
                        <button
                          className={primitiveSecondaryButtonClass}
                          type="button"
                          disabled={session.state === "completed" || busy}
                          aria-pressed={item.duplicateDecision === "skip"}
                          onClick={() => removeDuplicateReviewItem(item.id)}
                        >
                          Skip
                        </button>
                      </div>
                    </section>
                  ) : null}
                  <div className={styles.optionalDetails}>
                    <div className={styles.optionalGrid}>
                      <span className={styles.label} id={`brainDumpTaskType-${item.id}`}>
                        Task Type
                      </span>
                      <div
                        className={`${styles.taskTypePills} ${styles.timeGoalPills} unitButtons timerTypePills editTaskTypePills taskScreenPillGroup`}
                        role="group"
                        aria-labelledby={`brainDumpTaskType-${item.id}`}
                        aria-label={`Task type for ${item.title}`}
                      >
                        {([
                          ["recurring", "Recurring"],
                          ["once-off", "Once-off"],
                        ] as const).map(([nextTaskType, label]) => (
                          <button
                            className={`btn btn-ghost small unitBtn timerTypePill taskScreenPill taskScreenHeaderBtn${taskType === nextTaskType ? " isOn" : ""}`}
                            type="button"
                            key={nextTaskType}
                            disabled={session.state === "completed" || busy}
                            aria-pressed={taskType === nextTaskType}
                            onClick={() => updateReviewItem(item.id, { taskType: nextTaskType })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <label className={styles.label} htmlFor={`brainDumpDuration-${item.id}`}>
                        Time Goal/Estimate
                      </label>
                      <div className={`${styles.timeGoalControl} addTaskDurationRow editTaskDurationRow`}>
                        <input
                          id={`brainDumpDuration-${item.id}`}
                          className={`${primitiveInputClass} ${styles.timeGoalValueInput}`}
                          type="number"
                          min="0"
                          max={timeGoalMax}
                          step="1"
                          inputMode="numeric"
                          aria-label={`Time goal or estimate for ${item.title}`}
                          value={timeGoalValue ?? ""}
                          disabled={session.state === "completed" || busy}
                          onChange={(event) =>
                            updateReviewItem(item.id, {
                              enrichment: buildTimeGoalEnrichment(item.enrichment, { timeGoalValue: event.target.value }),
                            })
                          }
                        />
                        <div
                          className={`${styles.timeGoalPills} unitButtons addTaskDurationPills taskScreenPillGroup`}
                          role="group"
                          aria-label={`Time goal unit for ${item.title}`}
                        >
                          <button
                            className={`btn btn-ghost small unitBtn taskScreenPill taskScreenHeaderBtn${timeGoalUnit === "minute" ? " isOn" : ""}`}
                            type="button"
                            disabled={session.state === "completed" || busy}
                            aria-pressed={timeGoalUnit === "minute"}
                            onClick={() =>
                              updateReviewItem(item.id, {
                                enrichment: buildTimeGoalEnrichment(item.enrichment, { timeGoalUnit: "minute" }),
                              })
                            }
                          >
                            Min
                          </button>
                          <button
                            className={`btn btn-ghost small unitBtn taskScreenPill taskScreenHeaderBtn${timeGoalUnit === "hour" ? " isOn" : ""}`}
                            type="button"
                            disabled={session.state === "completed" || busy}
                            aria-pressed={timeGoalUnit === "hour"}
                            onClick={() =>
                              updateReviewItem(item.id, {
                                enrichment: buildTimeGoalEnrichment(item.enrichment, { timeGoalUnit: "hour" }),
                              })
                            }
                          >
                            Hour
                          </button>
                        </div>
                        <span className={`${styles.timeGoalPerLabel} addTaskDurationPerLabel`}>per</span>
                        <div
                          className={`${styles.timeGoalPills} unitButtons addTaskDurationPills taskScreenPillGroup`}
                          role="group"
                          aria-label={`Time goal period for ${item.title}`}
                        >
                          <button
                            className={`btn btn-ghost small unitBtn taskScreenPill taskScreenHeaderBtn${timeGoalPeriod === "day" ? " isOn" : ""}`}
                            type="button"
                            disabled={session.state === "completed" || busy}
                            aria-pressed={timeGoalPeriod === "day"}
                            onClick={() =>
                              updateReviewItem(item.id, {
                                enrichment: buildTimeGoalEnrichment(item.enrichment, { timeGoalPeriod: "day" }),
                              })
                            }
                          >
                            Day
                          </button>
                          <button
                            className={`btn btn-ghost small unitBtn taskScreenPill taskScreenHeaderBtn${timeGoalPeriod === "week" ? " isOn" : ""}`}
                            type="button"
                            disabled={session.state === "completed" || busy}
                            aria-pressed={timeGoalPeriod === "week"}
                            onClick={() =>
                              updateReviewItem(item.id, {
                                enrichment: buildTimeGoalEnrichment(item.enrichment, { timeGoalPeriod: "week" }),
                              })
                            }
                          >
                            Week
                          </button>
                        </div>
                      </div>
                      <label className={styles.label} htmlFor={`brainDumpDate-${item.id}`}>
                        Date
                      </label>
                      <div className={styles.dateReview}>
                        <input
                          id={`brainDumpDate-${item.id}`}
                          className={primitiveInputClass}
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
                          className={primitiveSecondaryButtonClass}
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
                      </div>
                      <span className={styles.label} id={`brainDumpPriority-${item.id}`}>
                        Priority
                      </span>
                      <div
                        className={`${styles.priorityPills} ${styles.timeGoalPills} unitButtons addTaskDurationPills taskScreenPillGroup`}
                        role="group"
                        aria-labelledby={`brainDumpPriority-${item.id}`}
                        aria-label={`Priority for ${item.title}`}
                      >
                        {([
                          ["low", "Low"],
                          ["medium", "Normal"],
                          ["high", "High"],
                        ] as const).map(([priority, label]) => (
                          <button
                            className={`btn btn-ghost small unitBtn taskScreenPill taskScreenHeaderBtn${(item.enrichment.priority || "medium") === priority ? " isOn" : ""}`}
                            type="button"
                            key={priority}
                            disabled={session.state === "completed" || busy}
                            aria-pressed={(item.enrichment.priority || "medium") === priority}
                            onClick={() =>
                              updateReviewItem(item.id, {
                                enrichment: {
                                  ...item.enrichment,
                                  priority,
                                },
                              })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <label className={styles.label} htmlFor={`brainDumpFirstAction-${item.id}`}>
                        First action
                      </label>
                      <input
                        id={`brainDumpFirstAction-${item.id}`}
                        className={primitiveInputClass}
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
                        className={primitiveSecondaryButtonClass}
                        type="button"
                        disabled={session.state === "completed" || busy}
                        onClick={() =>
                          updateReviewItem(item.id, {
                            enrichment: {
                              notes: null,
                              estimatedDurationMinutes: null,
                              timeGoalValue: null,
                              timeGoalUnit: "minute",
                              timeGoalPeriod: "day",
                              priority: "medium",
                              firstAction: null,
                            },
                          })
                        }
                      >
                        Clear optional details
                      </button>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
            <div className={styles.reviewActions}>
              <button
                className={primitiveSecondaryButtonClass}
                type="button"
                disabled={busy || session.state === "completed"}
                onClick={handleSaveReview}
              >
                Save review
              </button>
              <button
                className={primitivePrimaryButtonClass}
                type="button"
                disabled={selectedCount === 0 || busy || session.state === "completed"}
                onClick={handleConfirm}
              >
                {creatingTasks ? "Generating" : `Create ${selectedCount}`}
              </button>
              {batchResult ? (
                <>
                  {undoAvailable ? (
                    <button
                      className={primitiveSecondaryButtonClass}
                      type="button"
                      aria-label="Undo Brain Dump task creation"
                      disabled={busy}
                      onClick={handleUndoBatch}
                    >
                      Undo
                    </button>
                  ) : null}
                  <a className={primitiveSecondaryButtonClass} href={taskLaunchHref} onClick={handleBackNavigation}>
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
