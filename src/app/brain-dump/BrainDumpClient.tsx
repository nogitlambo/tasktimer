"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { trackEvent } from "@/lib/firebaseTelemetry";
import { getApiUrl } from "@/app/tasktimer/lib/apiClient";

import styles from "./BrainDump.module.css";

const BRAIN_DUMP_TEXT_LIMIT = 20_000;
const TASKTIMER_STORAGE_KEY = "taskticker_tasks_v1";
const BRAIN_DUMP_TYPED_DRAFT_KEY = `${TASKTIMER_STORAGE_KEY}:brainDump:typedDraft:v1`;
const BRAIN_DUMP_CAPTURE_MODE_KEY = `${TASKTIMER_STORAGE_KEY}:brainDump:captureMode:v1`;

type BrainDumpCaptureMode = "typed";

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
    return window.localStorage.getItem(BRAIN_DUMP_CAPTURE_MODE_KEY) === "typed" ? "typed" : "typed";
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

type BrainDumpReviewSession = {
  id: string;
  state: "review" | "completed";
  review: {
    selectedCount: number;
    items: BrainDumpReviewItem[];
  };
};

type BrainDumpCreationBatchResult = {
  state: "completed" | "partially_failed" | "failed";
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  retryableCount: number;
};

export default function BrainDumpClient() {
  const [captureMode, setCaptureMode] = useState<BrainDumpCaptureMode>(() => readStoredCaptureMode());
  const [text, setText] = useState(() => readStoredDraft());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [recoverableFailure, setRecoverableFailure] = useState(false);
  const [session, setSession] = useState<BrainDumpReviewSession | null>(null);
  const [batchResult, setBatchResult] = useState<BrainDumpCreationBatchResult | null>(null);
  const [confirmIdempotencyKey, setConfirmIdempotencyKey] = useState("");
  const autoRetriedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const errorSummaryRef = useRef<HTMLParagraphElement | null>(null);
  const trimmedText = text.trim();
  const canSubmit = trimmedText.length > 0 && trimmedText.length <= BRAIN_DUMP_TEXT_LIMIT && !busy;
  const remaining = BRAIN_DUMP_TEXT_LIMIT - text.length;
  const selectedCount = session?.review.items.filter((item) => item.supported && item.selected).length ?? 0;
  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  useEffect(() => {
    if (error) errorSummaryRef.current?.focus();
  }, [error]);

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
    const nextMode: BrainDumpCaptureMode = event.target.value === "typed" ? "typed" : "typed";
    setCaptureMode(nextMode);
    writeStoredCaptureMode(nextMode);
  }

  function handleClearDraft() {
    setText("");
    writeStoredDraft("");
    setError("");
    setStatus("");
    setRecoverableFailure(false);
    setSession(null);
    setBatchResult(null);
    setConfirmIdempotencyKey("");
    autoRetriedRef.current = false;
    void trackEvent("brain_dump_draft_cleared", {
      mode: "typed",
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
      mode: "typed",
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
        setConfirmIdempotencyKey(createConfirmIdempotencyKey(payload.session.id));
        setStatus("Review ready");
        autoRetriedRef.current = false;
        void trackEvent("brain_dump_review_ready", {
          mode: "typed",
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
          mode: "typed",
          draft_length: text.length,
          retry_count: attempt,
        });
        setBusy(false);
        abortControllerRef.current = null;
        return;
      }
    }
  }

  function updateReviewItem(itemId: string, patch: Partial<Pick<BrainDumpReviewItem, "selected" | "title" | "date">>) {
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
            };
          }),
        },
      };
    });
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

      const itemUpdates = session.review.items.map((item) => ({
        itemId: item.id,
        selected: item.supported && item.selected,
        title: item.title,
        date: {
          resolvedDate: item.date.resolvedDate,
          userConfirmedDate: item.date.userConfirmedDate,
        },
      }));
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

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="brainDumpTitle">
        <header className={styles.header}>
          <a className={styles.backLink} href="/tasklaunch">
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
          </select>
          <label className={styles.label} htmlFor="brainDumpText">
            Brain Dump input
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
                </article>
              ))}
            </div>
            <div className={styles.reviewActions}>
              <button
                className={styles.submitButton}
                type="button"
                disabled={selectedCount === 0 || busy || session.state === "completed"}
                onClick={handleConfirm}
              >
                {busy ? "Creating" : `Create ${selectedCount}`}
              </button>
              {batchResult ? (
                <a className={styles.backLink} href="/tasklaunch">
                  Tasks
                </a>
              ) : null}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
