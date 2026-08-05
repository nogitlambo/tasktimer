"use client";

import { FormEvent, useMemo, useState } from "react";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
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
  state: "review";
  review: {
    selectedCount: number;
    items: BrainDumpReviewItem[];
  };
};

export default function BrainDumpClient() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState<BrainDumpReviewSession | null>(null);
  const trimmedText = text.trim();
  const canSubmit = trimmedText.length > 0 && trimmedText.length <= BRAIN_DUMP_TEXT_LIMIT && !busy;
  const remaining = BRAIN_DUMP_TEXT_LIMIT - text.length;
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
      setStatus("Review ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brain Dump could not be processed.");
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
                {session.review.selectedCount} selected of {session.review.items.length}
              </p>
            </div>
            <div className={styles.reviewList}>
              {session.review.items.map((item) => (
                <article className={styles.reviewItem} key={item.id} data-supported={String(item.supported)}>
                  <div className={styles.reviewItemHeader}>
                    <h3 className={styles.reviewItemTitle}>{item.title}</h3>
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
          </section>
        ) : null}
      </section>
    </main>
  );
}
