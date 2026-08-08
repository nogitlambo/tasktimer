"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getApiUrl } from "../lib/apiClient";
import {
  dispatchTaskClarificationStartTaskEvent,
  TASKTIMER_OPEN_TASK_CLARIFICATION_EVENT,
  type TaskClarificationOpenDetail,
} from "../client/task-clarification-events";
import {
  closeTaskClarificationReview,
  createTaskClarificationReviewError,
  createTaskClarificationReviewLoading,
  createTaskClarificationReviewReady,
  type TaskClarificationReviewRecommendation,
  type TaskClarificationReviewState,
  type TaskClarificationReviewTask,
} from "../client/task-clarification-review";
import { trackTaskClarificationLifecycle } from "../../taskclarification/lib/taskClarificationTelemetry";

type ClarificationApiPayload = {
  recommendation?: unknown;
  error?: unknown;
  code?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseRecommendation(value: unknown): TaskClarificationReviewRecommendation {
  if (!isRecord(value) || (typeof value.recommendationId !== "string" && typeof value.id !== "string") || typeof value.originalTitle !== "string") {
    throw new Error("The clarification response was incomplete.");
  }
  const suggestions = value;
  const rawRange = isRecord(suggestions.estimatedRange) ? suggestions.estimatedRange : null;
  const rangeMin = rawRange && typeof rawRange.minMinutes === "number" ? rawRange.minMinutes : rawRange && typeof rawRange.min === "number" ? rawRange.min : null;
  const rangeMax = rawRange && typeof rawRange.maxMinutes === "number" ? rawRange.maxMinutes : rawRange && typeof rawRange.max === "number" ? rawRange.max : null;
  if (
    (typeof suggestions.suggestedTitle !== "string" && suggestions.suggestedTitle !== null) ||
    (typeof suggestions.estimatedMinutes !== "number" && suggestions.estimatedMinutes !== null) ||
    (suggestions.estimatedRange !== null && (rangeMin === null || rangeMax === null)) ||
    !Array.isArray(suggestions.subtasks) ||
    !Array.isArray(suggestions.clarificationQuestions) ||
    !Array.isArray(suggestions.warnings)
  ) {
    throw new Error("The clarification response was incomplete.");
  }
  return {
    ...value,
    recommendationId: typeof value.recommendationId === "string" ? value.recommendationId : String(value.id),
    estimatedRange: rangeMin === null || rangeMax === null ? null : { minMinutes: rangeMin, maxMinutes: rangeMax },
  } as unknown as TaskClarificationReviewRecommendation;
}

function taskFromEvent(detail: TaskClarificationOpenDetail): TaskClarificationReviewTask {
  return {
    taskId: detail.taskId,
    title: detail.title,
    ...(detail.taskType ? { taskType: detail.taskType } : {}),
    ...(detail.dueDate ? { dueDate: detail.dueDate } : {}),
  };
}

function errorMessage(payload: ClarificationApiPayload, status: number) {
  if (status === 401 || status === 403) return "Your sign-in session is no longer valid. Please sign in again.";
  return typeof payload.error === "string" && payload.error.trim() ? payload.error : "Could not prepare suggestions. Please try again.";
}

function telemetryErrorCategory(payload: ClarificationApiPayload, status: number, fallback = "unknown") {
  const code = typeof payload.code === "string" ? payload.code : "";
  if (code.includes("stale-task")) return "stale_task";
  if (code.includes("expired")) return "expired_recommendation";
  if (code.includes("rate-limited")) return "rate_limited";
  if (code.includes("entitlement")) return "entitlement_rejected";
  if (code.includes("provider")) return "provider_failure";
  if (code.includes("invalid")) return "invalid_schema";
  if (code.includes("conflict") || code.includes("already-applied")) return "apply_conflict";
  if (status === 0) return "network_failure";
  return fallback;
}

export default function TaskClarificationOverlay() {
  const [state, setState] = useState<TaskClarificationReviewState>(closeTaskClarificationReview);
  const [draftTitle, setDraftTitle] = useState("");
  const [titleSelected, setTitleSelected] = useState(false);
  const [selectedSubtaskIds, setSelectedSubtaskIds] = useState<string[]>([]);
  const [draftSubtaskTitles, setDraftSubtaskTitles] = useState<Record<string, string>>({});
  const [createdSubtaskIds, setCreatedSubtaskIds] = useState<string[]>([]);
  const [applyStatus, setApplyStatus] = useState<"idle" | "applying" | "applied" | "error">("idle");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [undoStatus, setUndoStatus] = useState<"idle" | "available" | "undoing" | "reversed" | "partial" | "expired" | "error">("idle");
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoDeadlineMs, setUndoDeadlineMs] = useState<number | null>(null);
  const [undoSeconds, setUndoSeconds] = useState(0);
  const [dismissStatus, setDismissStatus] = useState<"idle" | "dismissing">("idle");
  const modalRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const previousTaskIdRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<TaskClarificationOpenDetail>).detail;
      if (!detail?.taskId || !detail.title) return;
      const task = taskFromEvent(detail);
      requestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;
      const requestSequence = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestSequence;
      setState(createTaskClarificationReviewLoading(task));
      setDraftTitle("");
      setTitleSelected(false);
      setSelectedSubtaskIds([]);
      setDraftSubtaskTitles({});
      setCreatedSubtaskIds([]);
      setApplyStatus("idle");
      setApplyError(null);
      setUndoStatus("idle");
      setUndoError(null);
      setUndoDeadlineMs(null);
      setUndoSeconds(0);
      setDismissStatus("idle");
      void trackTaskClarificationLifecycle("opened");
      const clarificationStartedAt = Date.now();
      let requestErrorCategory = "unknown";

      void (async () => {
        try {
          const auth = getFirebaseAuthClient();
          const idToken = await auth?.currentUser?.getIdToken();
          if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
          const response = await fetch(getApiUrl(`/api/tasks/${encodeURIComponent(task.taskId)}/clarify/`), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-firebase-auth": idToken,
            },
            body: JSON.stringify({
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
            signal: controller.signal,
          });
          const payload = (await response.json().catch(() => ({}))) as ClarificationApiPayload;
          if (!response.ok) {
            requestErrorCategory = telemetryErrorCategory(payload, response.status);
            if (requestErrorCategory === "stale_task") void trackTaskClarificationLifecycle("stale_blocked");
            throw new Error(errorMessage(payload, response.status));
          }
          const recommendation = parseRecommendation(payload.recommendation);
          if (requestSequenceRef.current !== requestSequence) return;
          setDraftTitle(recommendation.suggestedTitle || "");
          setTitleSelected(!!recommendation.suggestedTitle);
          setSelectedSubtaskIds(recommendation.subtasks.map((subtask) => subtask.id));
          setDraftSubtaskTitles(Object.fromEntries(recommendation.subtasks.map((subtask) => [subtask.id, subtask.title])));
          setApplyStatus("idle");
          setApplyError(null);
          const rawRecommendation = isRecord(payload.recommendation) ? payload.recommendation : {};
          void trackTaskClarificationLifecycle("proposal_ready", {
            modelVersion: rawRecommendation.modelVersion,
            promptVersion: rawRecommendation.promptVersion,
            latencyMs: Date.now() - clarificationStartedAt,
          });
          setState(createTaskClarificationReviewReady(task, recommendation));
        } catch (error) {
          if (controller.signal.aborted || requestSequenceRef.current !== requestSequence) return;
          if (requestErrorCategory !== "stale_task") void trackTaskClarificationLifecycle("failed", { errorCategory: requestErrorCategory });
          setState(createTaskClarificationReviewError(task, error instanceof Error ? error.message : "Could not prepare suggestions. Please try again."));
        }
      })();
    };

    window.addEventListener(TASKTIMER_OPEN_TASK_CLARIFICATION_EVENT, handleOpen);
    return () => {
      window.removeEventListener(TASKTIMER_OPEN_TASK_CLARIFICATION_EVENT, handleOpen);
      requestControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!undoDeadlineMs || undoStatus !== "available") return;
    const update = () => {
      const remainingSeconds = Math.max(0, Math.ceil((undoDeadlineMs - Date.now()) / 1000));
      setUndoSeconds(remainingSeconds);
      if (remainingSeconds <= 0) setUndoStatus("expired");
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [undoDeadlineMs, undoStatus]);

  const close = useCallback(() => {
    requestSequenceRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setState(closeTaskClarificationReview());
  }, []);

  const dismiss = useCallback(async () => {
    if (state.status !== "ready" || !state.recommendation || applyStatus === "applied") {
      close();
      return;
    }
    if (dismissStatus === "dismissing") return;
    setDismissStatus("dismissing");
    setApplyError(null);
    try {
      const auth = getFirebaseAuthClient();
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const response = await fetch(
        getApiUrl(`/api/tasks/${encodeURIComponent(state.task?.taskId || "")}/clarify/${encodeURIComponent(state.recommendation.recommendationId)}/dismiss`),
        { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": idToken }, body: "{}" }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Could not dismiss this suggestion.");
      void trackTaskClarificationLifecycle("dismissed");
      close();
    } catch (error) {
      void trackTaskClarificationLifecycle("failed", { errorCategory: "unknown" });
      setDismissStatus("idle");
      setApplyError(error instanceof Error ? error.message : "Could not dismiss this suggestion.");
    }
  }, [applyStatus, close, dismissStatus, state.recommendation, state.status, state.task]);

  useEffect(() => {
    const taskId = state.task?.taskId || null;
    if (taskId && previousTaskIdRef.current !== taskId) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      previousTaskIdRef.current = taskId;
      window.requestAnimationFrame(() => modalRef.current?.focus({ preventScroll: true }));
    } else if (!taskId && previousTaskIdRef.current) {
      const opener = openerRef.current;
      previousTaskIdRef.current = null;
      openerRef.current = null;
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    }
    if (!state.task) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void dismiss();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );
      if (!focusable.length) {
        event.preventDefault();
        modalRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dismiss, state.task]);

  const applySelectedChanges = async () => {
    if (
      state.status !== "ready" ||
      !state.recommendation ||
      (!titleSelected && selectedSubtaskIds.length === 0) ||
      (titleSelected && !draftTitle.trim()) ||
      applyStatus === "applying" ||
      applyStatus === "applied"
    ) return;
    setApplyStatus("applying");
    setApplyError(null);
    const applyStartedAt = Date.now();
    try {
      const auth = getFirebaseAuthClient();
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await fetch(
        getApiUrl(`/api/tasks/${encodeURIComponent(state.task?.taskId || "")}/clarify/${encodeURIComponent(state.recommendation.recommendationId)}/apply`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
          body: JSON.stringify({
            acceptedFields: [
              ...(titleSelected ? (["name"] as const) : []),
              ...(selectedSubtaskIds.length ? (["subtasks"] as const) : []),
            ],
            values: {
              ...(titleSelected ? { name: draftTitle.trim() } : {}),
              ...(selectedSubtaskIds.length
                ? {
                    subtasks: state.recommendation.subtasks
                      .filter((subtask) => selectedSubtaskIds.includes(subtask.id))
                      .map((subtask) => ({
                        id: subtask.id,
                        title: (draftSubtaskTitles[subtask.id] || subtask.title).trim(),
                        estimatedMinutes: subtask.estimatedMinutes,
                      })),
                  }
                : {}),
            },
            idempotencyKey,
          }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: unknown; code?: unknown; recommendation?: unknown };
      if (!response.ok) {
        const errorCategory = telemetryErrorCategory(payload, response.status);
        if (errorCategory === "stale_task") void trackTaskClarificationLifecycle("stale_blocked");
        throw new Error(typeof payload.error === "string" ? payload.error : "Could not apply the selected change.");
      }
      const recommendationPayload = payload.recommendation;
      const nextCreatedSubtaskIds =
        recommendationPayload && typeof recommendationPayload === "object" && Array.isArray((recommendationPayload as { createdSubtaskIds?: unknown }).createdSubtaskIds)
          ? (recommendationPayload as { createdSubtaskIds: unknown[] }).createdSubtaskIds.filter((id): id is string => typeof id === "string")
          : [];
      setCreatedSubtaskIds(nextCreatedSubtaskIds);
      const reversibleUntil = recommendationPayload && typeof recommendationPayload === "object" ? (recommendationPayload as { reversibleUntil?: unknown }).reversibleUntil : null;
      const reversibleUntilMs = typeof reversibleUntil === "string" ? Date.parse(reversibleUntil) : Number.NaN;
      setUndoDeadlineMs(Number.isFinite(reversibleUntilMs) ? reversibleUntilMs : null);
      setUndoSeconds(Number.isFinite(reversibleUntilMs) ? Math.max(0, Math.ceil((reversibleUntilMs - Date.now()) / 1000)) : 0);
      setUndoStatus(Number.isFinite(reversibleUntilMs) && reversibleUntilMs > Date.now() ? "available" : "expired");
      setUndoError(null);
      setApplyStatus("applied");
      void trackTaskClarificationLifecycle("applied", {
        latencyMs: Date.now() - applyStartedAt,
        acceptedFieldCount: (titleSelected ? 1 : 0) + (selectedSubtaskIds.length ? 1 : 0),
        selectedSubtaskCount: selectedSubtaskIds.length,
      });
    } catch (error) {
      void trackTaskClarificationLifecycle("failed", { errorCategory: "apply_conflict" });
      setApplyStatus("error");
      setApplyError(error instanceof Error ? error.message : "Could not apply the selected change.");
    }
  };

  const undo = async () => {
    if (state.status !== "ready" || !state.task || !state.recommendation || undoStatus !== "available") return;
    setUndoStatus("undoing");
    setUndoError(null);
    try {
      const auth = getFirebaseAuthClient();
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await fetch(
        getApiUrl(`/api/tasks/${encodeURIComponent(state.task.taskId)}/clarify/${encodeURIComponent(state.recommendation.recommendationId)}/undo`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
          body: JSON.stringify({ idempotencyKey }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: unknown; partial?: unknown; recommendation?: unknown };
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Could not undo the selected changes.");
      const recommendationPayload = payload.recommendation;
      const removedIds = recommendationPayload && typeof recommendationPayload === "object" && Array.isArray((recommendationPayload as { removedSubtaskIds?: unknown }).removedSubtaskIds)
        ? (recommendationPayload as { removedSubtaskIds: unknown[] }).removedSubtaskIds.filter((id): id is string => typeof id === "string")
        : [];
      setCreatedSubtaskIds((current) => current.filter((id) => !removedIds.includes(id)));
      setUndoStatus(payload.partial ? "partial" : "reversed");
      setUndoDeadlineMs(null);
      setUndoSeconds(0);
      void trackTaskClarificationLifecycle(payload.partial ? "partial_undo" : "undone", { selectedSubtaskCount: createdSubtaskIds.length });
    } catch (error) {
      void trackTaskClarificationLifecycle("failed", { errorCategory: "undo_failure" });
      setUndoStatus("error");
      setUndoError(error instanceof Error ? error.message : "Could not undo the selected changes.");
    }
  };

  if (!state.task) return null;

  const suggestion = state.recommendation;
  const hasImprovementSuggestions = !!suggestion && Boolean(
    suggestion.suggestedTitle ||
      suggestion.firstAction ||
      suggestion.definitionOfDone ||
      suggestion.stoppingPoint ||
      suggestion.estimatedMinutes !== null ||
      suggestion.estimatedRange ||
      suggestion.subtasks.length ||
      suggestion.clarificationQuestions.length ||
      suggestion.warnings.length
  );
  return (
    <div
      className="overlay primitiveSciFiModalOverlay taskClarificationPrimitiveOverlay"
      id="taskClarificationOverlay"
      style={{ display: "flex" }}
      onClick={(event) => event.target === event.currentTarget && void dismiss()}
    >
      <div className="modal taskClarificationPrimitiveModal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Make this task clearer">
        <header className="taskClarificationPrimitiveHeader">
          <h2>Make this task clearer</h2>
          <p className="modalSubtext">
            Review suggestions for a clearer title, first action, and stopping point. Nothing changes to your task in this preview.
          </p>
        </header>

        <div className="taskClarificationPrimitiveBody">
          <section className="taskClarificationOriginal" aria-labelledby="taskClarificationOriginalLabel">
          <h3 id="taskClarificationOriginalLabel">Original task</h3>
          <p>{state.task.title}</p>
          </section>

        {state.status === "loading" ? <p className="taskClarificationStatus" aria-live="polite">Preparing suggestions...</p> : null}
        {state.status === "error" ? (
          <p className="taskClarificationStatus taskClarificationStatusError" role="alert">
            {state.error}
          </p>
        ) : null}

        {state.status === "ready" && suggestion && !hasImprovementSuggestions ? (
          <p className="taskClarificationStatus" role="status">
            No improvement suggestions were generated. You can keep the original task.
          </p>
        ) : null}

        {state.status === "ready" && suggestion && hasImprovementSuggestions ? (
          <div className="taskClarificationSuggestions" aria-label="Read-only clarification suggestions">
            <section>
              <h3>Suggested title</h3>
              <p>{suggestion.suggestedTitle}</p>
            </section>
            {suggestion.firstAction ? (
              <section>
                <h3>First action</h3>
                <p>{suggestion.firstAction}</p>
              </section>
            ) : null}
            {suggestion.definitionOfDone ? (
              <section>
                <h3>Definition of Done</h3>
                <p>{suggestion.definitionOfDone}</p>
              </section>
            ) : null}
            {suggestion.stoppingPoint ? (
              <section>
                <h3>Stopping point</h3>
                <p>{suggestion.stoppingPoint}</p>
              </section>
            ) : null}
            <section>
              <h3>Estimated effort</h3>
              <p>
                {suggestion.estimatedMinutes == null ? "No estimate available" : `${suggestion.estimatedMinutes} minutes`}
                {suggestion.estimatedRange ? ` (${suggestion.estimatedRange.minMinutes}-${suggestion.estimatedRange.maxMinutes} minutes)` : ""}
              </p>
            </section>
            {suggestion.subtasks.length ? (
              <section>
                <h3>Suggested subtasks</h3>
                <ul>
                  {suggestion.subtasks.map((subtask, index) => (
                    <li key={`${subtask.title}-${index}`}>
                      <label className="taskClarificationSubtaskChoice">
                        <input
                          type="checkbox"
                          checked={selectedSubtaskIds.includes(subtask.id)}
                          aria-label={`Select subtask ${index + 1}`}
                          onChange={(event) =>
                            setSelectedSubtaskIds((current) =>
                              event.target.checked ? [...current, subtask.id] : current.filter((id) => id !== subtask.id)
                            )
                          }
                          disabled={applyStatus === "applying" || applyStatus === "applied"}
                        />
                        <input
                          type="text"
                          value={draftSubtaskTitles[subtask.id] || subtask.title}
                          onChange={(event) => setDraftSubtaskTitles((current) => ({ ...current, [subtask.id]: event.target.value }))}
                          disabled={applyStatus === "applying" || applyStatus === "applied"}
                          aria-label={`Subtask ${index + 1}`}
                        />
                        <span>{subtask.estimatedMinutes == null ? "" : `(${subtask.estimatedMinutes} minutes)`}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {suggestion.suggestedTitle ? (
              <section className="taskClarificationEditableField">
                <label htmlFor="taskClarificationSuggestedTitle">Suggested title</label>
                <div className="taskClarificationEditableRow">
                  <input
                    id="taskClarificationSuggestedTitle"
                    type="text"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    disabled={applyStatus === "applying" || applyStatus === "applied"}
                  />
                  <label className="taskClarificationFieldChoice">
                    <input
                      type="checkbox"
                      checked={titleSelected}
                      onChange={(event) => setTitleSelected(event.target.checked)}
                      disabled={applyStatus === "applying" || applyStatus === "applied"}
                    />
                    <span>Apply</span>
                  </label>
                </div>
              </section>
            ) : null}
            {suggestion.clarificationQuestions.length ? (
              <section>
                <h3>Questions to consider</h3>
                <ul>
                  {suggestion.clarificationQuestions.map((question, index) => (
                    <li key={`${question}-${index}`}>{question}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {suggestion.warnings.length ? (
              <section>
                <h3>Warnings</h3>
                <ul>
                  {suggestion.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        {applyError ? <p className="taskClarificationStatus taskClarificationStatusError" role="alert">{applyError}</p> : null}
        {undoError ? <p className="taskClarificationStatus taskClarificationStatusError" role="alert">{undoError}</p> : null}

        {applyStatus === "applied" && undoStatus === "available" ? (
          <button className="btn btn-ghost taskClarificationUndoButton" type="button" onClick={() => void undo()}>
            Undo changes ({undoSeconds}s)
          </button>
        ) : null}
        {undoStatus === "undoing" ? <p className="taskClarificationStatus" aria-live="polite">Undoing changes...</p> : null}
        {undoStatus === "reversed" ? <p className="taskClarificationStatus" role="status">Changes undone.</p> : null}
        {undoStatus === "partial" ? <p className="taskClarificationStatus" role="status">Some changes were kept because they were edited after apply.</p> : null}
        {undoStatus === "expired" ? <p className="taskClarificationStatus" role="status">The 30-second undo window has expired.</p> : null}

          {applyStatus === "applied" && createdSubtaskIds.length ? (
            <section className="taskClarificationCreatedTasks" aria-label="Created subtasks">
              <h3>Created tasks</h3>
              <ul>
                {createdSubtaskIds.map((taskId) => (
                  <li key={taskId}>
                    <span>{taskId}</span>
                    <button className="btn btn-accent small" type="button" onClick={() => dispatchTaskClarificationStartTaskEvent({ taskId })}>
                      Start now
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="confirmBtns taskClarificationPrimitiveFooter">
          <button className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction taskClarificationPrimitiveAction taskClarificationPrimitiveSecondaryAction" type="button" onClick={() => void dismiss()} disabled={dismissStatus === "dismissing"}>
            {dismissStatus === "dismissing" ? "Keeping original..." : applyStatus === "applied" ? "Close" : "Keep original"}
          </button>
          {state.status === "ready" && suggestion && (suggestion.suggestedTitle || suggestion.subtasks.length) ? (
            <button
              className="btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction taskClarificationPrimitiveAction taskClarificationPrimitivePrimaryAction"
              type="button"
              onClick={() => void applySelectedChanges()}
              disabled={
                (!titleSelected && selectedSubtaskIds.length === 0) ||
                (titleSelected && !draftTitle.trim()) ||
                applyStatus === "applying" ||
                applyStatus === "applied"
              }
            >
              {applyStatus === "applying" ? "Applying..." : applyStatus === "applied" ? "Applied" : "Apply selected changes"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
