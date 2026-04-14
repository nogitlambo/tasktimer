"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { onAuthStateChanged, type Auth, type User } from "firebase/auth";

import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  type ArchieAssistantPage,
  type ArchieKnowledgeCitation,
  type ArchieQueryResponse,
  type ArchieRecentDraftResponse,
  type ArchieRecommendationDraft,
  type ArchieSuggestedAction,
  isArchieDraftAction,
} from "../lib/archieAssistant";
import { STORAGE_KEY } from "../lib/storage";

type ArchieBlinkPattern = "idle" | "flicker" | "slow" | "double";

type ArchieAssistantWidgetProps = {
  activePage: ArchieAssistantPage;
  variant?: "desktop" | "mobile";
};

const ARCHIE_DEFAULT_PROMPT = "What can I help with?";
const ARCHIE_LOADING_PROMPT = "Working through your workspace...";
const ARCHIE_OUTLINE_DRAW_MS = 840;
const ARCHIE_TYPE_MS = 2100;
const ARCHIE_TYPE_MS_PER_CHAR = Math.max(6, Math.round((ARCHIE_TYPE_MS / ARCHIE_DEFAULT_PROMPT.length) / 4));
const ARCHIE_BLINK_DURATION_MS = 2000;
const ARCHIE_BLINK_MIN_DELAY_MS = 10000;
const ARCHIE_BLINK_MAX_DELAY_MS = 15000;
const ARCHIE_HELP_REQUEST_EVENT = "tasktimer:archieHelpRequest";
const ARCHIE_NAVIGATE_EVENT = "tasktimer:archieNavigate";
const ARCHIE_PENDING_PUSH_TASK_ID_KEY = `${STORAGE_KEY}:pendingPushTaskId`;
const ARCHIE_PENDING_PUSH_TASK_EVENT = "tasktimer:pendingTaskJump";
const ARCHIE_FOCUS_SESSION_NOTES_KEY = `${STORAGE_KEY}:focusSessionNotes`;

async function resolveAuthSession(): Promise<{ auth: Auth; user: User; idToken: string } | null> {
  const auth = getFirebaseAuthClient();
  if (!auth) return null;
  const authWithReady = auth as Auth & { authStateReady?: () => Promise<void> };
  if (typeof authWithReady.authStateReady === "function") {
    try {
      await authWithReady.authStateReady();
    } catch {
      // ignore and continue with current auth state
    }
  }
  let user = auth.currentUser;
  if (!user) {
    user = await new Promise<User | null>((resolve) => {
      let settled = false;
      const finish = (nextUser: User | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        unsubscribe();
        resolve(nextUser);
      };
      const timeoutId = window.setTimeout(() => finish(auth.currentUser), 1500);
      const unsubscribe = onAuthStateChanged(auth, (nextUser) => finish(nextUser || null));
    });
  }
  if (!user) return null;
  const idToken = await user.getIdToken();
  if (!idToken) return null;
  return { auth, user, idToken };
}

function loadFocusSessionNotesByTaskId() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ARCHIE_FOCUS_SESSION_NOTES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const next: Record<string, string> = {};
    Object.entries(parsed || {}).forEach(([taskId, value]) => {
      const text = String(value || "").trim();
      if (text) next[taskId] = text;
    });
    return next;
  } catch {
    return {};
  }
}

function formatOrdinal(value: number) {
  const absolute = Math.abs(Math.trunc(value));
  const mod100 = absolute % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${absolute}th`;
  const mod10 = absolute % 10;
  if (mod10 === 1) return `${absolute}st`;
  if (mod10 === 2) return `${absolute}nd`;
  if (mod10 === 3) return `${absolute}rd`;
  return `${absolute}th`;
}

function formatPlannedSlot(day: string | null | undefined, time: string | null | undefined, openEnded: boolean | null | undefined) {
  if (openEnded) {
    return day ? `${day.toUpperCase()} with an open-ended start` : "an open-ended start";
  }
  if (day && time) return `${day.toUpperCase()} at ${time}`;
  if (day) return `${day.toUpperCase()}`;
  if (time) return `${time}`;
  return "no scheduled start";
}

function changeSummary(change: ArchieRecommendationDraft["proposedChanges"][number]) {
  if (change.kind === "reorder_task") {
    const beforePosition = change.beforeOrder + 1;
    const afterPosition = change.afterOrder + 1;
    if (afterPosition < beforePosition) {
      if (afterPosition === 1) return `Move ${change.taskName} to the top of your list so it is easier to pick up next.`;
      return `Move ${change.taskName} higher in your list, from ${formatOrdinal(beforePosition)} to ${formatOrdinal(afterPosition)} place.`;
    }
    if (afterPosition > beforePosition) {
      return `Move ${change.taskName} lower in your list, from ${formatOrdinal(beforePosition)} to ${formatOrdinal(afterPosition)} place.`;
    }
    return `Keep ${change.taskName} in its current spot in the list.`;
  }
  if (change.kind === "update_schedule") {
    const beforeSlot = formatPlannedSlot(change.before.plannedStartDay, change.before.plannedStartTime, change.before.plannedStartOpenEnded);
    const afterSlot = formatPlannedSlot(change.after.plannedStartDay, change.after.plannedStartTime, change.after.plannedStartOpenEnded);
    if (beforeSlot === "no scheduled start") {
      return `Give ${change.taskName} a clearer place in your week by scheduling it for ${afterSlot}.`;
    }
    return `Shift ${change.taskName} from ${beforeSlot} to ${afterSlot} so it fits better into your current flow.`;
  }
  return change.note;
}

function formatCitationTag(citation: ArchieKnowledgeCitation) {
  const parts = [citation.title];
  if (citation.settingsPane) parts.push(`Pane: ${citation.settingsPane}`);
  else if (citation.route) parts.push(`Route: ${citation.route}`);
  return parts.join(" | ");
}

async function sendArchieTelemetryEvent(input: { idToken: string; sessionId: string; draftId?: string | null; eventType: "review_opened" | "apply" | "discard" }) {
  await fetch("/api/archie/events", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-firebase-auth": input.idToken,
    },
    body: JSON.stringify({
      sessionId: input.sessionId,
      draftId: input.draftId || null,
      eventType: input.eventType,
    }),
  });
}

export default function ArchieAssistantWidget({ activePage, variant = "desktop" }: ArchieAssistantWidgetProps) {
  const [isArchieBubbleOpen, setIsArchieBubbleOpen] = useState(false);
  const [archieQuestion, setArchieQuestion] = useState("");
  const [archieRenderedMessage, setArchieRenderedMessage] = useState(ARCHIE_DEFAULT_PROMPT);
  const [archieTitleAnimation, setArchieTitleAnimation] = useState<"none" | "prompt" | "response">("none");
  const [archieTitleAnimationKey, setArchieTitleAnimationKey] = useState(0);
  const [archieOutlineAnimating, setArchieOutlineAnimating] = useState(false);
  const [archieOutlineComplete, setArchieOutlineComplete] = useState(false);
  const [archieOutlineClosing, setArchieOutlineClosing] = useState(false);
  const [archieInputVisible, setArchieInputVisible] = useState(false);
  const [archieSuggestedAction, setArchieSuggestedAction] = useState<ArchieSuggestedAction | null>(null);
  const [archieBlinkPattern, setArchieBlinkPattern] = useState<ArchieBlinkPattern>("idle");
  const [archieCitations, setArchieCitations] = useState<ArchieKnowledgeCitation[]>([]);
  const [archieDraft, setArchieDraft] = useState<ArchieRecommendationDraft | null>(null);
  const [archieLastOpenDraft, setArchieLastOpenDraft] = useState<ArchieRecommendationDraft | null>(null);
  const [archieLastOpenDraftSessionId, setArchieLastOpenDraftSessionId] = useState<string | null>(null);
  const [archieBusy, setArchieBusy] = useState(false);
  const [archieReviewOpen, setArchieReviewOpen] = useState(false);
  const [archieSessionId, setArchieSessionId] = useState<string | null>(null);
  const archieInputRef = useRef<HTMLTextAreaElement | null>(null);
  const archieTimersRef = useRef<number[]>([]);
  const archieBlinkStartTimerRef = useRef<number | null>(null);
  const archieBlinkStopTimerRef = useRef<number | null>(null);
  const canUsePortal = typeof document !== "undefined";

  const clearArchieTimers = useCallback(() => {
    archieTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    archieTimersRef.current = [];
  }, []);

  const prefersReducedMotion = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const queueArchieTimer = useCallback((callback: () => void, delayMs: number) => {
    const timerId = window.setTimeout(() => {
      archieTimersRef.current = archieTimersRef.current.filter((entry) => entry !== timerId);
      callback();
    }, delayMs);
    archieTimersRef.current.push(timerId);
  }, []);

  const clearArchieBlinkTimers = useCallback(() => {
    if (archieBlinkStartTimerRef.current != null) {
      window.clearTimeout(archieBlinkStartTimerRef.current);
      archieBlinkStartTimerRef.current = null;
    }
    if (archieBlinkStopTimerRef.current != null) {
      window.clearTimeout(archieBlinkStopTimerRef.current);
      archieBlinkStopTimerRef.current = null;
    }
  }, []);

  const resetArchieBubble = useCallback(() => {
    clearArchieTimers();
    setArchieQuestion("");
    setArchieRenderedMessage(ARCHIE_DEFAULT_PROMPT);
    setArchieTitleAnimation("none");
    setArchieTitleAnimationKey((value) => value + 1);
    setArchieOutlineAnimating(false);
    setArchieOutlineComplete(false);
    setArchieOutlineClosing(false);
    setArchieInputVisible(false);
    setArchieSuggestedAction(null);
    setArchieCitations([]);
    setArchieDraft(null);
    setArchieSessionId(null);
    setArchieBusy(false);
    setArchieReviewOpen(false);
  }, [clearArchieTimers]);

  const closeArchieBubble = useCallback(
    (opts?: { animated?: boolean }) => {
      const reducedMotion = prefersReducedMotion();
      const animated = opts?.animated !== false && !reducedMotion;
      clearArchieTimers();
      if (!animated) {
        setIsArchieBubbleOpen(false);
        resetArchieBubble();
        return;
      }
      setArchieInputVisible(false);
      setArchieTitleAnimation("none");
      setArchieOutlineAnimating(false);
      setArchieOutlineComplete(false);
      setArchieOutlineClosing(true);
      queueArchieTimer(() => {
        setIsArchieBubbleOpen(false);
        resetArchieBubble();
      }, ARCHIE_OUTLINE_DRAW_MS);
    },
    [clearArchieTimers, prefersReducedMotion, queueArchieTimer, resetArchieBubble]
  );

  const startArchieTyping = useCallback(
    (messageRaw: string, onComplete?: () => void) => {
      const message = String(messageRaw || "");
      clearArchieTimers();
      const stepMs = ARCHIE_TYPE_MS_PER_CHAR;
      setArchieRenderedMessage("");
      Array.from(message).forEach((_, index, chars) => {
        queueArchieTimer(() => {
          setArchieRenderedMessage(chars.slice(0, index + 1).join(""));
          if (index === chars.length - 1) onComplete?.();
        }, stepMs * (index + 1));
      });
      if (!message) onComplete?.();
    },
    [clearArchieTimers, queueArchieTimer]
  );

  const presentArchieResponse = useCallback(
    (response: Pick<ArchieQueryResponse, "message" | "citations" | "suggestedAction" | "draft" | "sessionId">) => {
      const reducedMotion = prefersReducedMotion();
      setArchieRenderedMessage(reducedMotion ? response.message : "");
      setArchieSuggestedAction(response.suggestedAction || null);
      setArchieCitations(response.citations || []);
      setArchieDraft(response.draft || null);
      setArchieSessionId(response.sessionId || null);
      if (response.draft) {
        setArchieLastOpenDraft({ ...response.draft, sessionId: response.sessionId || null });
        setArchieLastOpenDraftSessionId(response.sessionId || null);
      }
      setArchieInputVisible(false);
      setArchieOutlineClosing(false);
      setArchieOutlineAnimating(false);
      setArchieOutlineComplete(true);
      setArchieTitleAnimation(reducedMotion ? "none" : "response");
      setArchieTitleAnimationKey((value) => value + 1);
      if (reducedMotion) {
        setArchieInputVisible(true);
        return;
      }
      startArchieTyping(response.message, () => {
        setArchieTitleAnimation("none");
        setArchieInputVisible(true);
      });
    },
    [prefersReducedMotion, startArchieTyping]
  );

  const startArchiePromptSequence = useCallback(() => {
    const reducedMotion = prefersReducedMotion();
    clearArchieTimers();
    setArchieQuestion("");
    setArchieRenderedMessage(reducedMotion ? ARCHIE_DEFAULT_PROMPT : "");
    setArchieInputVisible(false);
    setArchieSuggestedAction(null);
    setArchieCitations([]);
    setArchieDraft(null);
    setArchieSessionId(null);
    setArchieReviewOpen(false);
    setArchieOutlineClosing(false);
    setArchieOutlineAnimating(!reducedMotion);
    setArchieOutlineComplete(reducedMotion);
    setArchieTitleAnimation("none");
    setArchieTitleAnimationKey((value) => value + 1);
    if (reducedMotion) {
      setArchieOutlineAnimating(false);
      setArchieOutlineComplete(true);
      setArchieInputVisible(true);
      return;
    }
    queueArchieTimer(() => {
      setArchieOutlineAnimating(false);
      setArchieOutlineComplete(true);
      setArchieTitleAnimation("prompt");
      setArchieTitleAnimationKey((value) => value + 1);
      startArchieTyping(ARCHIE_DEFAULT_PROMPT, () => {
        setArchieTitleAnimation("none");
        setArchieInputVisible(true);
      });
    }, ARCHIE_OUTLINE_DRAW_MS);
  }, [clearArchieTimers, prefersReducedMotion, queueArchieTimer, startArchieTyping]);

  const submitArchieQuestion = useCallback(async () => {
    const nextQuestion = String(archieQuestion || "").trim();
    if (!nextQuestion || archieBusy) return;
    setArchieBusy(true);
    clearArchieTimers();
    setArchieQuestion("");
    setArchieSuggestedAction(null);
    setArchieCitations([]);
    setArchieDraft(null);
    setArchieSessionId(null);
    setArchieReviewOpen(false);
    setArchieRenderedMessage(ARCHIE_LOADING_PROMPT);
    setArchieInputVisible(false);
    setArchieOutlineClosing(false);
    setArchieOutlineAnimating(false);
    setArchieOutlineComplete(true);
    setArchieTitleAnimation("none");
    setArchieTitleAnimationKey((value) => value + 1);
    try {
      const session = await resolveAuthSession();
      if (!session?.idToken) {
        presentArchieResponse({
          message: "You need to be signed in before I can analyze your workspace or answer account-aware questions.",
          citations: [],
          suggestedAction: undefined,
          draft: undefined,
        });
        return;
      }
      const response = await fetch("/api/archie/query", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": session.idToken,
        },
        body: JSON.stringify({
          message: nextQuestion,
          activePage,
          focusSessionNotesByTaskId: loadFocusSessionNotesByTaskId(),
        }),
      });
      const result = (await response.json().catch(() => null)) as (ArchieQueryResponse & { error?: string }) | null;
      if (!response.ok || !result) {
        presentArchieResponse({
          message: result?.error || "I hit a problem while checking your workspace. Please try again.",
          citations: [],
          suggestedAction: undefined,
          draft: undefined,
        });
        return;
      }
      presentArchieResponse(result);
    } catch {
      presentArchieResponse({
        message: "I hit a problem while checking your workspace. Please try again.",
        citations: [],
        suggestedAction: undefined,
        draft: undefined,
      });
    } finally {
      setArchieBusy(false);
    }
  }, [activePage, archieBusy, archieQuestion, clearArchieTimers, presentArchieResponse]);

  const showArchieHelpMessage = useCallback((message: string) => {
    const nextMessage = String(message || "").trim();
    if (!nextMessage) return;
    const reducedMotion = prefersReducedMotion();
    clearArchieTimers();
    const shouldAnimateOpen = !isArchieBubbleOpen;
    setIsArchieBubbleOpen(true);
    setArchieQuestion("");
    setArchieRenderedMessage(reducedMotion ? nextMessage : "");
    setArchieInputVisible(false);
    setArchieSuggestedAction(null);
    setArchieCitations([]);
    setArchieDraft(null);
    setArchieReviewOpen(false);
    setArchieBusy(false);
    setArchieOutlineClosing(false);
    setArchieOutlineAnimating(shouldAnimateOpen && !reducedMotion);
    setArchieOutlineComplete(!shouldAnimateOpen || reducedMotion);
    setArchieTitleAnimation("none");
    setArchieTitleAnimationKey((value) => value + 1);
    if (reducedMotion) {
      setArchieOutlineAnimating(false);
      setArchieOutlineComplete(true);
      setArchieInputVisible(true);
      return;
    }
    if (shouldAnimateOpen) {
      queueArchieTimer(() => {
        setArchieOutlineAnimating(false);
        setArchieOutlineComplete(true);
        setArchieTitleAnimation("prompt");
        setArchieTitleAnimationKey((value) => value + 1);
        startArchieTyping(nextMessage, () => {
          setArchieTitleAnimation("none");
          setArchieInputVisible(true);
        });
      }, ARCHIE_OUTLINE_DRAW_MS);
      return;
    }
    setArchieOutlineAnimating(false);
    setArchieOutlineComplete(true);
    setArchieTitleAnimation("response");
    setArchieTitleAnimationKey((value) => value + 1);
    startArchieTyping(nextMessage, () => {
      setArchieTitleAnimation("none");
      setArchieInputVisible(true);
    });
  }, [clearArchieTimers, isArchieBubbleOpen, prefersReducedMotion, queueArchieTimer, startArchieTyping]);

  const handleArchieSuggestedAction = useCallback(() => {
    if (!archieSuggestedAction || typeof window === "undefined") return;
    if (isArchieDraftAction(archieSuggestedAction)) {
      setArchieReviewOpen(true);
      if (archieSessionId && archieDraft?.id) {
        void (async () => {
          try {
            const session = await resolveAuthSession();
            if (!session?.idToken) return;
            await sendArchieTelemetryEvent({
              idToken: session.idToken,
              sessionId: archieSessionId,
              draftId: archieDraft.id,
              eventType: "review_opened",
            });
          } catch {
            // Ignore telemetry failures.
          }
        })();
      }
      return;
    }
    if (archieSuggestedAction.kind === "navigate") {
      try {
        window.dispatchEvent(new CustomEvent(ARCHIE_NAVIGATE_EVENT, { detail: { href: archieSuggestedAction.href } }));
      } catch {
        window.location.assign(archieSuggestedAction.href);
      }
      return;
    }
    if (archieSuggestedAction.kind === "openSettingsPane") {
      const href = `/settings?pane=${archieSuggestedAction.pane}`;
      try {
        window.dispatchEvent(new CustomEvent(ARCHIE_NAVIGATE_EVENT, { detail: { href } }));
      } catch {
        window.location.assign(href);
      }
      return;
    }
    try {
      window.localStorage.setItem(ARCHIE_PENDING_PUSH_TASK_ID_KEY, archieSuggestedAction.taskId);
    } catch {
      // Ignore localStorage failures and still attempt event-based delivery.
    }
    try {
      window.dispatchEvent(new CustomEvent(ARCHIE_PENDING_PUSH_TASK_EVENT, { detail: { taskId: archieSuggestedAction.taskId } }));
    } catch {
      // Ignore custom event failures.
    }
    const pathname = String(window.location.pathname || "");
    const onTasksRoute = /\/tasklaunch\/?$/i.test(pathname) || /\/tasklaunch\/index\.html$/i.test(pathname);
    if (!onTasksRoute) window.location.assign("/tasklaunch");
  }, [archieDraft?.id, archieSessionId, archieSuggestedAction]);

  const handleReopenLastDraft = useCallback(() => {
    if (!archieLastOpenDraft) return;
    setArchieDraft(archieLastOpenDraft);
    setArchieSessionId(archieLastOpenDraftSessionId || archieLastOpenDraft.sessionId || null);
    setArchieReviewOpen(true);
    const resolvedSessionId = archieLastOpenDraftSessionId || archieLastOpenDraft.sessionId || null;
    if (!resolvedSessionId || !archieLastOpenDraft.id) return;
    void (async () => {
      try {
        const session = await resolveAuthSession();
        if (!session?.idToken) return;
        await sendArchieTelemetryEvent({
          idToken: session.idToken,
          sessionId: resolvedSessionId,
          draftId: archieLastOpenDraft.id,
          eventType: "review_opened",
        });
      } catch {
        // Ignore telemetry failures.
      }
    })();
  }, [archieLastOpenDraft, archieLastOpenDraftSessionId]);

  const handleDraftDecision = useCallback(
    async (decision: "apply" | "discard") => {
      if (!archieDraft || archieBusy) return;
      setArchieBusy(true);
      try {
        const session = await resolveAuthSession();
        if (!session?.idToken) {
          presentArchieResponse({
            message: "You need to be signed in before I can change your workspace.",
            citations: [],
            suggestedAction: undefined,
            draft: archieDraft,
          });
          return;
        }
        const response = await fetch("/api/archie/recommendations/apply", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-firebase-auth": session.idToken,
          },
          body: JSON.stringify({
            draftId: archieDraft.id,
            decision,
            sessionId: archieSessionId,
          }),
        });
        const result = (await response.json().catch(() => null)) as { error?: string; appliedCount?: number } | null;
        if (!response.ok) {
          presentArchieResponse({
            message: result?.error || "I could not update that Archie draft.",
            citations: [],
            suggestedAction: { kind: "reviewDraft", label: "Review Draft", draftId: archieDraft.id },
            draft: archieDraft,
          });
          return;
        }
        setArchieReviewOpen(false);
        if (archieLastOpenDraft?.id === archieDraft.id) {
          setArchieLastOpenDraft(null);
          setArchieLastOpenDraftSessionId(null);
        }
        if (decision === "discard") {
          presentArchieResponse({
            message: "Draft discarded. Your current task order and schedule stayed unchanged.",
            citations: [],
            suggestedAction: undefined,
            draft: undefined,
          });
          return;
        }
        presentArchieResponse({
          message: `Draft applied. I updated ${Math.max(0, Math.floor(Number(result?.appliedCount || 0) || 0))} workspace change${Number(result?.appliedCount || 0) === 1 ? "" : "s"}.`,
          citations: [],
          suggestedAction: undefined,
          draft: undefined,
        });
      } catch {
        presentArchieResponse({
          message: "I could not update that Archie draft.",
          citations: [],
          suggestedAction: { kind: "reviewDraft", label: "Review Draft", draftId: archieDraft.id },
          draft: archieDraft,
        });
      } finally {
        setArchieBusy(false);
      }
    },
    [archieBusy, archieDraft, archieLastOpenDraft?.id, archieSessionId, presentArchieResponse]
  );

  const handleArchieToggle = useCallback(() => {
    if (isArchieBubbleOpen) {
      closeArchieBubble({ animated: true });
      return;
    }
    setIsArchieBubbleOpen(true);
    startArchiePromptSequence();
  }, [closeArchieBubble, isArchieBubbleOpen, startArchiePromptSequence]);

  const handleArchieInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      void submitArchieQuestion();
    },
    [submitArchieQuestion]
  );

  useEffect(() => {
    if (!isArchieBubbleOpen || !archieInputVisible) return;
    archieInputRef.current?.focus();
  }, [archieInputVisible, isArchieBubbleOpen]);

  useEffect(() => {
    if (!isArchieBubbleOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const session = await resolveAuthSession();
        if (!session?.idToken) return;
        const response = await fetch("/api/archie/recommendations/latest", {
          method: "GET",
          credentials: "same-origin",
          headers: {
            "x-firebase-auth": session.idToken,
          },
        });
        const result = (await response.json().catch(() => null)) as ArchieRecentDraftResponse | null;
        if (cancelled || !response.ok) return;
        if (!result?.draft) {
          setArchieLastOpenDraft(null);
          setArchieLastOpenDraftSessionId(null);
          return;
        }
        setArchieLastOpenDraft(result.draft);
        setArchieLastOpenDraftSessionId(result.sessionId || result.draft.sessionId || null);
      } catch {
        // Ignore lookup failures and leave recent-draft UI hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isArchieBubbleOpen]);

  const showReopenLastDraft =
    isArchieBubbleOpen &&
    archieInputVisible &&
    !!archieLastOpenDraft &&
    (!isArchieDraftAction(archieSuggestedAction) || archieSuggestedAction.draftId === archieLastOpenDraft.id);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleArchieHelpRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      const message = String(detail?.message || "").trim();
      if (!message) return;
      showArchieHelpMessage(message);
    };
    window.addEventListener(ARCHIE_HELP_REQUEST_EVENT, handleArchieHelpRequest as EventListener);
    return () => {
      window.removeEventListener(ARCHIE_HELP_REQUEST_EVENT, handleArchieHelpRequest as EventListener);
    };
  }, [showArchieHelpMessage]);

  useEffect(() => {
    if (prefersReducedMotion()) {
      clearArchieBlinkTimers();
      return;
    }

    const blinkPatterns: ArchieBlinkPattern[] = ["flicker", "slow", "double"];
    const scheduleNextBlink = () => {
      const nextDelay =
        ARCHIE_BLINK_MIN_DELAY_MS +
        Math.round(Math.random() * (ARCHIE_BLINK_MAX_DELAY_MS - ARCHIE_BLINK_MIN_DELAY_MS));
      archieBlinkStartTimerRef.current = window.setTimeout(() => {
        const nextPattern = blinkPatterns[Math.floor(Math.random() * blinkPatterns.length)] || "slow";
        setArchieBlinkPattern(nextPattern);
        archieBlinkStopTimerRef.current = window.setTimeout(() => {
          setArchieBlinkPattern("idle");
          scheduleNextBlink();
        }, ARCHIE_BLINK_DURATION_MS);
      }, nextDelay);
    };

    clearArchieBlinkTimers();
    scheduleNextBlink();

    return () => {
      clearArchieBlinkTimers();
    };
  }, [clearArchieBlinkTimers, prefersReducedMotion]);

  useEffect(
    () => () => {
      clearArchieTimers();
      clearArchieBlinkTimers();
    },
    [clearArchieBlinkTimers, clearArchieTimers]
  );

  return (
    <>
      <div className={`desktopRailMascot${variant === "mobile" ? " mobileArchieAssistant" : ""}`}>
        <div
          className={`desktopRailMascotBubble${isArchieBubbleOpen ? " isOpen" : ""}${archieOutlineAnimating ? " isOutlineAnimating" : ""}${archieOutlineComplete ? " isOutlineComplete" : ""}${archieOutlineClosing ? " isClosing" : ""}`}
          aria-hidden={!isArchieBubbleOpen}
        >
          <span className="desktopRailMascotBubbleOutline" aria-hidden="true">
            <span className="desktopRailMascotBubbleLine desktopRailMascotBubbleLineTop" />
            <span className="desktopRailMascotBubbleLine desktopRailMascotBubbleLineRight" />
            <span className="desktopRailMascotBubbleLine desktopRailMascotBubbleLineBottomRight" />
            <span className="desktopRailMascotBubbleTailSvg" />
            <span className="desktopRailMascotBubbleLine desktopRailMascotBubbleLineBottomLeft" />
            <span className="desktopRailMascotBubbleLine desktopRailMascotBubbleLineLeft" />
          </span>
          <div className="desktopRailMascotBubbleTitle">
            <span
              key={archieTitleAnimationKey}
              className={`desktopRailMascotBubbleTitleText${archieTitleAnimation === "prompt" ? " isTypingPrompt" : ""}${archieTitleAnimation === "response" ? " isTypingResponse" : ""}${archieTitleAnimation !== "none" || archieInputVisible ? " isVisible" : ""}`}
            >
              {archieRenderedMessage}
            </span>
          </div>
          {archieCitations.length ? (
            <div className={`desktopRailMascotMeta${archieInputVisible ? " isVisible" : ""}`} aria-label="Archie sources">
              {archieCitations.slice(0, 2).map((citation) => (
                <span className="desktopRailMascotMetaTag" key={citation.id}>
                  {formatCitationTag(citation)}
                </span>
              ))}
            </div>
          ) : null}
          {archieSuggestedAction ? (
            <div className={`desktopRailMascotActionRow${archieInputVisible ? " isVisible" : ""}`}>
              <button
                className="btn btn-ghost small desktopRailMascotActionBtn"
                type="button"
                onClick={handleArchieSuggestedAction}
                disabled={archieBusy}
              >
                {archieSuggestedAction.label}
              </button>
              {showReopenLastDraft && (!archieSuggestedAction || !isArchieDraftAction(archieSuggestedAction)) ? (
                <button className="btn btn-ghost small desktopRailMascotActionBtn" type="button" onClick={handleReopenLastDraft} disabled={archieBusy}>
                  Reopen Last Draft
                </button>
              ) : null}
            </div>
          ) : showReopenLastDraft ? (
            <div className={`desktopRailMascotActionRow${archieInputVisible ? " isVisible" : ""}`}>
              <button className="btn btn-ghost small desktopRailMascotActionBtn" type="button" onClick={handleReopenLastDraft} disabled={archieBusy}>
                Reopen Last Draft
              </button>
            </div>
          ) : null}
          <span className={`desktopRailMascotInputRow${archieInputVisible ? " isVisible" : ""}`}>
            <textarea
              ref={archieInputRef}
              className="desktopRailMascotInput"
              value={archieQuestion}
              rows={2}
              onChange={(event) => {
                setArchieQuestion(event.target.value);
              }}
              onKeyDown={handleArchieInputKeyDown}
              placeholder={archieBusy ? "Archie is thinking..." : "Ask Archie a question..."}
              aria-label="Ask Archie a question"
              disabled={archieBusy}
            />
            <span className="desktopRailMascotInputCaret" aria-hidden="true" />
          </span>
        </div>
        <button
          className={`desktopRailMascotTrigger${isArchieBubbleOpen ? " isOpen" : ""}`}
          type="button"
          aria-label="Ask Archie what he can help with"
          aria-expanded={isArchieBubbleOpen}
          onClick={handleArchieToggle}
        >
          <span className="desktopRailMascotFigure" aria-hidden="true">
            <AppImg className="desktopRailMascotImage" src="/archie/turned_in_left.png" alt="" />
            <span className="desktopRailMascotBody" />
            <span
              className={`desktopRailMascotBlinkOverlay${archieBlinkPattern !== "idle" ? ` is${archieBlinkPattern[0].toUpperCase()}${archieBlinkPattern.slice(1)}` : ""}`}
            />
          </span>
        </button>
      </div>

      {archieReviewOpen && archieDraft && canUsePortal
        ? createPortal(
            <div className="overlay" style={{ display: "flex" }} onClick={() => setArchieReviewOpen(false)}>
              <div className="modal archieDraftModal" role="dialog" aria-modal="true" aria-label="Archie Draft Review" onClick={(event) => event.stopPropagation()}>
                <div className="confirmText">Review Draft</div>
                <div className="modalSubtext">{archieDraft.summary}</div>
                <div className="archieDraftSection">
                  <div className="archieDraftSectionTitle">Reasoning</div>
                  <div className="archieDraftReasoning">{archieDraft.reasoning}</div>
                </div>
                <div className="archieDraftSection">
                  <div className="archieDraftSectionTitle">Changes</div>
                  <div className="archieDraftList">
                    {archieDraft.proposedChanges.map((change, index) => (
                      <div className="archieDraftListItem" key={`${change.kind}-${index}`}>
                        {changeSummary(change)}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="confirmBtns">
                  <button className="btn btn-ghost" type="button" onClick={() => setArchieReviewOpen(false)} disabled={archieBusy}>
                    Close
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => void handleDraftDecision("discard")} disabled={archieBusy}>
                    Discard
                  </button>
                  <button className="btn btn-accent" type="button" onClick={() => void handleDraftDecision("apply")} disabled={archieBusy}>
                    Apply Draft
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
