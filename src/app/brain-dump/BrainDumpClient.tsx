"use client";

import { FormEvent, useMemo, useState } from "react";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { trackEvent } from "@/lib/firebaseTelemetry";
import { getApiUrl } from "@/app/tasktimer/lib/apiClient";

import styles from "./BrainDump.module.css";

const BRAIN_DUMP_TEXT_LIMIT = 20_000;

type BrainDumpReviewItem = {
  id: string;
  itemType: string;
  title: string;
  selected: boolean;
  sourceEvidence: string[];
  confidence: number;
  ambiguityFlags: string[];
  supported: boolean;
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
  createdCount: number;
  skippedCount: number;
  createdTaskIds: string[];
};

export default function BrainDumpClient() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState<BrainDumpReviewSession | null>(null);
  const [batchResult, setBatchResult] = useState<BrainDumpCreationBatchResult | null>(null);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    setStatus("Analysing");
    try {
      const auth = getFirebaseAuthClient();
      const user = auth?.currentUser || null;
      const idToken = await user?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");

      const response = await fetch(getApiUrl("/api/brain-dump/sessions/"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify({ text: trimmedText, timezone }),
      });
      const payload = (await response.json()) as { session?: BrainDumpReviewSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "Brain Dump could not be processed.");
      setSession(payload.session);
      setBatchResult(null);
      setStatus("Review ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brain Dump could not be processed.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  function updateReviewItem(itemId: string, patch: Partial<Pick<BrainDumpReviewItem, "selected" | "title">>) {
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
            };
          }),
        },
      };
    });
  }

  async function handleConfirm() {
    if (!session || selectedCount === 0 || busy) return;
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
      }));
      const response = await fetch(getApiUrl(`/api/brain-dump/sessions/${session.id}/confirm/`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify({ itemUpdates }),
      });
      const payload = (await response.json()) as { batch?: BrainDumpCreationBatchResult; error?: string };
      if (!response.ok || !payload.batch) throw new Error(payload.error || "Brain Dump tasks could not be created.");
      setBatchResult(payload.batch);
      setSession((current) => (current ? { ...current, state: "completed" } : current));
      setStatus(`Created ${payload.batch.createdCount} task${payload.batch.createdCount === 1 ? "" : "s"}`);
      void trackEvent("brain_dump_tasks_created", {
        created_count: payload.batch.createdCount,
        skipped_count: payload.batch.skippedCount,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brain Dump tasks could not be created.");
      setStatus("");
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
          <label className={styles.label} htmlFor="brainDumpText">
            Brain Dump input
          </label>
          <textarea
            id="brainDumpText"
            className={styles.textarea}
            value={text}
            maxLength={BRAIN_DUMP_TEXT_LIMIT}
            onChange={(event) => setText(event.target.value)}
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
        </form>

        <div className={styles.statusRow} aria-live="polite">
          {status ? (
            <p id="brainDumpStatus" className={styles.status}>
              {status}
            </p>
          ) : null}
          {error ? (
            <p id="brainDumpError" className={styles.error} role="alert">
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
