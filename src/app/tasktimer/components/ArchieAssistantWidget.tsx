"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { onAuthStateChanged, type Auth, type User } from "firebase/auth";

import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
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
import {
  completeOnboardingForCurrentSession,
  getCompletedOnboardingNotice,
  getOnboardingDashboardPanelStepByIndex,
  getOnboardingDashboardPanelStepIndex,
  getOnboardingDashboardPanelStepMessage,
  getOnboardingTasksActionStepMessage,
  ONBOARDING_STEPS,
  ONBOARDING_ADD_TASK_CLICK_EVENT,
  ONBOARDING_DASHBOARD_CLICK_EVENT,
  hasCompletedOnboardingForCurrentSession,
  isOnboardingManualResumeRequired,
  getOnboardingStepByIndex,
  getOnboardingStepIndex,
  getOnboardingStepMessage,
  notifyOnboardingStateChanged,
  readCloudOnboardingComplete,
  readOnboardingStepForCurrentSession,
  readOnboardingStatusForCurrentSession,
  readOnboardingDashboardPanelStepForCurrentSession,
  readOnboardingTasksActionStepForCurrentSession,
  saveOnboardingStepForCurrentSession,
  saveOnboardingDashboardPanelStepForCurrentSession,
  saveOnboardingTasksActionStepForCurrentSession,
  ONBOARDING_MODULE_CLICK_EVENT,
  shouldOnboardingStepAwaitModuleClick,
  skipOnboardingForCurrentSession,
  startOnboardingForCurrentSession,
  type OnboardingDashboardClickDetail,
  type OnboardingDashboardPanelStepId,
  type OnboardingModuleClickDetail,
  type OnboardingModuleStep,
  type OnboardingStep,
  type OnboardingTasksActionStepId,
} from "../lib/onboarding";

type ArchieBlinkPattern = "idle" | "flicker" | "slow" | "double";
export type ArchieResponseFeedback = "up" | "down";
type ArchieCopyState = "idle" | "copied" | "failed";

type ArchieAssistantWidgetProps = {
  activePage: ArchieAssistantPage;
  variant?: "desktop" | "mobile";
  onOnboardingStepChange?: (state: ArchieOnboardingUiState | null) => void;
};

type ArchieLocalActionTone = "ghost" | "accent" | "warn";

type ArchieLocalAction = {
  id: string;
  label: string;
  tone?: ArchieLocalActionTone;
  onClick: () => void;
};

export type ArchieOnboardingUiState = {
  step: OnboardingStep;
  awaitingClick: boolean;
  dashboardPanelStep: OnboardingDashboardPanelStepId | null;
  tasksActionStep: OnboardingTasksActionStepId | null;
};

const ARCHIE_DEFAULT_PROMPT = "What can I help with?";
const ARCHIE_LOADING_PROMPT = "Working through your workspace...";
const ARCHIE_OUTLINE_DRAW_MS = 840;
const ARCHIE_TYPE_MS = 638;
const ARCHIE_TYPE_MS_PER_CHAR = Math.max(6, Math.round((ARCHIE_TYPE_MS / ARCHIE_DEFAULT_PROMPT.length) / 4));
const ARCHIE_BLINK_DURATION_MS = 2000;
const ARCHIE_BLINK_MIN_DELAY_MS = 10000;
const ARCHIE_BLINK_MAX_DELAY_MS = 15000;
const ARCHIE_MOBILE_BREAKPOINT_PX = 980;
const ARCHIE_HELP_REQUEST_EVENT = "tasktimer:archieHelpRequest";
const ARCHIE_NAVIGATE_EVENT = "tasktimer:archieNavigate";
const ARCHIE_PENDING_PUSH_TASK_ID_KEY = `${STORAGE_KEY}:pendingPushTaskId`;
const ARCHIE_PENDING_PUSH_TASK_EVENT = "tasktimer:pendingTaskJump";
const ARCHIE_FOCUS_SESSION_NOTES_KEY = `${STORAGE_KEY}:focusSessionNotes`;
const ARCHIE_PRO_REQUIRED_CODE = "archie/pro-required";
const ARCHIE_PRO_UPGRADE_MESSAGE =
  "I can answer product questions on Free. Workflow recommendations, draft changes, and AI-refined responses are included with Pro.";
const ARCHIE_PRO_UPGRADE_ACTION: ArchieSuggestedAction = { kind: "navigate", label: "Upgrade to Pro", href: "/pricing" };
const ARCHIE_API_FALLBACK_ORIGIN = "https://tasktimer-prod.firebaseapp.com";

type ArchieApiErrorResult = {
  error?: string;
  code?: string;
  suggestedAction?: ArchieSuggestedAction;
};

function resolveArchieApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") {
    const origin = String(window.location.origin || "").trim();
    if (/^https?:/i.test(origin) && !isNativeOrFileRuntime()) return `${origin}${normalizedPath}`;
  }
  return `${ARCHIE_API_FALLBACK_ORIGIN}${normalizedPath}`;
}

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
  if (time) return `Every day at ${time}`;
  return "no scheduled start";
}

function changeSummary(change: ArchieRecommendationDraft["proposedChanges"][number]) {
  if (change.kind === "reorder_task") {
    const beforePosition = change.beforeOrder + 1;
    const afterPosition = change.afterOrder + 1;
    if (afterPosition < beforePosition) {
      if (afterPosition === 1) return `Make ${change.taskName} the first task in your list, so it is the easiest one to pick up next.`;
      return `Make ${change.taskName} the ${formatOrdinal(afterPosition)} task in your list instead of the ${formatOrdinal(beforePosition)}.`;
    }
    if (afterPosition > beforePosition) {
      return `Put ${change.taskName} in the ${formatOrdinal(afterPosition)} spot instead of the ${formatOrdinal(beforePosition)}.`;
    }
    return `Keep ${change.taskName} in its current spot in the list.`;
  }
  if (change.kind === "update_schedule") {
    const beforeSlot = formatPlannedSlot(change.before.plannedStartDay, change.before.plannedStartTime, change.before.plannedStartOpenEnded);
    const afterSlot = formatPlannedSlot(change.after.plannedStartDay, change.after.plannedStartTime, change.after.plannedStartOpenEnded);
    if (beforeSlot === "no scheduled start") {
      return `Set ${change.taskName} for ${afterSlot} so it has a clear place in your week.`;
    }
    return `Set ${change.taskName} to ${afterSlot} instead of ${beforeSlot}.`;
  }
  return change.note;
}

function formatCitationTag(citation: ArchieKnowledgeCitation) {
  const parts = [citation.title];
  if (citation.settingsPane) parts.push(`Pane: ${citation.settingsPane}`);
  else if (citation.route) parts.push(`Route: ${citation.route}`);
  return parts.join(" | ");
}

export function nextArchieResponseFeedback(
  currentFeedback: ArchieResponseFeedback | null,
  requestedFeedback: ArchieResponseFeedback
) {
  return currentFeedback === requestedFeedback ? null : requestedFeedback;
}

export function shouldShowArchieResponseActionRow(input: {
  busy: boolean;
  inputVisible: boolean;
  hasResponseActions: boolean;
  message: string;
}) {
  return !input.busy && input.inputVisible && input.hasResponseActions && !!String(input.message || "").trim();
}

export function onboardingStepTargetPage(step: OnboardingStep | null | undefined): ArchieAssistantPage | null {
  if (step === "friends") return "test2";
  if (step === "dashboard" || step === "tasks" || step === "leaderboard" || step === "settings") return step;
  return null;
}

export function shouldAutoAdvanceOnboardingStep(input: {
  step: OnboardingStep | null | undefined;
  awaitingClick: boolean;
  autoAdvanceIfCurrentPage: boolean;
  activePage: ArchieAssistantPage;
}) {
  if (!input.awaitingClick || !input.autoAdvanceIfCurrentPage) return false;
  return onboardingStepTargetPage(input.step) === input.activePage;
}

export function resolveOnboardingModuleProgress(input: {
  currentStep: OnboardingStep | null | undefined;
  awaitingClick: boolean;
  triggeredStep: OnboardingModuleStep;
}) {
  if (!input.awaitingClick || input.currentStep !== input.triggeredStep) return { type: "ignore" as const };
  if (input.currentStep === "settings") return { type: "reveal_finish" as const };
  const nextStep = getOnboardingStepByIndex(getOnboardingStepIndex(input.currentStep) + 1);
  return { type: "advance" as const, nextStep };
}

export function onboardingPrimaryActionForStep(input: {
  step: OnboardingStep;
  awaitingClick: boolean;
  dashboardPanelStep?: OnboardingDashboardPanelStepId | null;
}) {
  if (input.step === "welcome") {
    return { id: "continue" as const, label: "Let's Go!" as const, tone: "accent" as const };
  }
  if (input.awaitingClick || (input.step === "dashboard" && input.dashboardPanelStep)) return null;
  if (input.step === "settings") {
    return { id: "finish" as const, label: "Finish" as const, tone: "accent" as const };
  }
  return { id: "continue" as const, label: "Next" as const, tone: "accent" as const };
}

function getNextDashboardPanelStep(step: OnboardingDashboardPanelStepId) {
  return getOnboardingDashboardPanelStepByIndex(getOnboardingDashboardPanelStepIndex(step) + 1);
}

export function resolveOnboardingDashboardPanelProgress(step: OnboardingDashboardPanelStepId | null | undefined) {
  if (!step) return { type: "ignore" as const };
  const panelIndex = getOnboardingDashboardPanelStepIndex(step);
  if (panelIndex >= 3) return { type: "advance_step" as const, nextStep: "tasks" as const };
  return { type: "advance_panel" as const, nextPanelStep: getNextDashboardPanelStep(step) };
}

function splitArchieBubbleMessage(messageRaw: string) {
  const message = String(messageRaw || "");
  const instructionLine = "Click anywhere to move forward";
  const lines = message.split("\n");
  return lines.map((line, index) => ({
    id: `line-${index}`,
    text: line,
    isInstruction: line.trim() === instructionLine,
  }));
}

function createArchieLocalSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `archie-local-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function isVisibleArchieVariant(variant: "desktop" | "mobile") {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return variant === "desktop";
  }
  const mobileViewport = window.matchMedia(`(max-width: ${ARCHIE_MOBILE_BREAKPOINT_PX}px)`).matches;
  return variant === "mobile" ? mobileViewport : !mobileViewport;
}

async function copyArchieTextToClipboard(textRaw: string) {
  const text = String(textRaw || "");
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to a temporary textarea for runtimes without clipboard access.
  }
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function sendArchieTelemetryEvent(input: {
  idToken: string;
  sessionId: string;
  draftId?: string | null;
  eventType: "review_opened" | "apply" | "discard" | "response_upvote" | "response_downvote";
}) {
  await fetch(resolveArchieApiUrl("/api/archie/events"), {
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

function buildArchieProUpgradePresentation(result?: ArchieApiErrorResult | null) {
  return {
    message: String(result?.error || ARCHIE_PRO_UPGRADE_MESSAGE).trim() || ARCHIE_PRO_UPGRADE_MESSAGE,
    citations: [],
    suggestedAction:
      result?.suggestedAction?.kind === "navigate" && result.suggestedAction.href
        ? result.suggestedAction
        : ARCHIE_PRO_UPGRADE_ACTION,
    draft: undefined,
  };
}

function ArchieThumbUpIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M8.2 8.2V4.9c0-1 .4-1.9 1.1-2.6l.7-.7 1.1 1.1a2.7 2.7 0 0 1 .7 2.4l-.3 1.8h3.6a1.9 1.9 0 0 1 1.9 2.3l-1 5a2.4 2.4 0 0 1-2.3 1.9H8.2a2 2 0 0 1-1.5-.6V8.2h1.5Zm-4.4 0H6v7.9H3.8a.8.8 0 0 1-.8-.8V9a.8.8 0 0 1 .8-.8Z" />
    </svg>
  );
}

function ArchieThumbDownIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M11.8 11.8v3.3c0 1-.4 1.9-1.1 2.6l-.7.7-1.1-1.1a2.7 2.7 0 0 1-.7-2.4l.3-1.8H4.9A1.9 1.9 0 0 1 3 10.8l1-5A2.4 2.4 0 0 1 6.3 4h5.5c.6 0 1.1.2 1.5.6v7.2h-1.5Zm4.4 0H14v-7.9h2.2c.4 0 .8.4.8.8V11a.8.8 0 0 1-.8.8Z" />
    </svg>
  );
}

function ArchieCopyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6A2.5 2.5 0 0 1 18 3.5v8A2.5 2.5 0 0 1 15.5 14h-1v1.5A2.5 2.5 0 0 1 12 18H5.5A2.5 2.5 0 0 1 3 15.5v-8A2.5 2.5 0 0 1 5.5 5H7V3.5Zm1.5 1.5h3.5A2.5 2.5 0 0 1 14.5 7.5v5h1A1 1 0 0 0 16.5 11.5v-8a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1V5Zm-3 1.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1H12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5.5Z" />
    </svg>
  );
}

export function ArchieResponseActionRow(props: {
  visible: boolean;
  feedback: ArchieResponseFeedback | null;
  copyState: ArchieCopyState;
  onFeedback: (feedback: ArchieResponseFeedback) => void;
  onCopy: () => void;
}) {
  return (
    <div className={`desktopRailMascotResponseActions${props.visible ? " isVisible" : ""}`} aria-label="Archie response actions">
      <button
        className={`desktopRailMascotResponseActionBtn${props.feedback === "up" ? " isSelected" : ""}`}
        type="button"
        aria-label="Mark Archie response helpful"
        title="Helpful"
        onClick={() => props.onFeedback("up")}
      >
        <span className="desktopRailMascotResponseActionIcon">
          <ArchieThumbUpIcon />
        </span>
      </button>
      <button
        className={`desktopRailMascotResponseActionBtn${props.feedback === "down" ? " isSelected" : ""}`}
        type="button"
        aria-label="Mark Archie response unhelpful"
        title="Unhelpful"
        onClick={() => props.onFeedback("down")}
      >
        <span className="desktopRailMascotResponseActionIcon">
          <ArchieThumbDownIcon />
        </span>
      </button>
      <button
        className={`desktopRailMascotResponseActionBtn${props.copyState !== "idle" ? " isSelected" : ""}`}
        type="button"
        aria-label={props.copyState === "copied" ? "Archie response copied" : props.copyState === "failed" ? "Copy Archie response failed" : "Copy Archie response"}
        title={props.copyState === "copied" ? "Copied" : props.copyState === "failed" ? "Copy failed" : "Copy"}
        onClick={props.onCopy}
      >
        <span className="desktopRailMascotResponseActionIcon">
          <ArchieCopyIcon />
        </span>
      </button>
    </div>
  );
}

export default function ArchieAssistantWidget({
  activePage,
  variant = "desktop",
  onOnboardingStepChange,
}: ArchieAssistantWidgetProps) {
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
  const [archieLocalActions, setArchieLocalActions] = useState<ArchieLocalAction[]>([]);
  const [archieBlinkPattern, setArchieBlinkPattern] = useState<ArchieBlinkPattern>("idle");
  const [archieCitations, setArchieCitations] = useState<ArchieKnowledgeCitation[]>([]);
  const [archieDraft, setArchieDraft] = useState<ArchieRecommendationDraft | null>(null);
  const [archieLastOpenDraft, setArchieLastOpenDraft] = useState<ArchieRecommendationDraft | null>(null);
  const [archieLastOpenDraftSessionId, setArchieLastOpenDraftSessionId] = useState<string | null>(null);
  const [archieHasResponseActions, setArchieHasResponseActions] = useState(false);
  const [archieResponseFeedback, setArchieResponseFeedback] = useState<ArchieResponseFeedback | null>(null);
  const [archieCopyState, setArchieCopyState] = useState<ArchieCopyState>("idle");
  const [archieBusy, setArchieBusy] = useState(false);
  const [archieReviewOpen, setArchieReviewOpen] = useState(false);
  const [archieSessionId, setArchieSessionId] = useState<string | null>(null);
  const [archieOnboardingStep, setArchieOnboardingStep] = useState<OnboardingStep | null>(null);
  const [archieOnboardingAwaitingClick, setArchieOnboardingAwaitingClick] = useState(false);
  const [archieOnboardingAutoAdvanceEligible, setArchieOnboardingAutoAdvanceEligible] = useState(false);
  const [archieOnboardingDashboardPanelStep, setArchieOnboardingDashboardPanelStep] = useState<OnboardingDashboardPanelStepId | null>(null);
  const [archieOnboardingTasksActionStep, setArchieOnboardingTasksActionStep] = useState<OnboardingTasksActionStepId | null>(null);
  const archieInputRef = useRef<HTMLTextAreaElement | null>(null);
  const archieTimersRef = useRef<number[]>([]);
  const archieBlinkStartTimerRef = useRef<number | null>(null);
  const archieBlinkStopTimerRef = useRef<number | null>(null);
  const archieCopyResetTimerRef = useRef<number | null>(null);
  const onboardingBootedRef = useRef(false);
  const presentOnboardingStepRef = useRef<
    ((stepRaw?: OnboardingStep | null, opts?: { waitingForModuleClick?: boolean; autoAdvanceIfCurrentPage?: boolean }) => void) | null
  >(null);
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

  const clearArchieCopyResetTimer = useCallback(() => {
    if (archieCopyResetTimerRef.current != null) {
      window.clearTimeout(archieCopyResetTimerRef.current);
      archieCopyResetTimerRef.current = null;
    }
  }, []);

  const resetArchieBubble = useCallback(() => {
    clearArchieTimers();
    clearArchieCopyResetTimer();
    setArchieQuestion("");
    setArchieRenderedMessage(ARCHIE_DEFAULT_PROMPT);
    setArchieTitleAnimation("none");
    setArchieTitleAnimationKey((value) => value + 1);
    setArchieOutlineAnimating(false);
    setArchieOutlineComplete(false);
    setArchieOutlineClosing(false);
    setArchieInputVisible(false);
    setArchieSuggestedAction(null);
    setArchieLocalActions([]);
    setArchieCitations([]);
    setArchieDraft(null);
    setArchieOnboardingStep(null);
    setArchieOnboardingAwaitingClick(false);
    setArchieOnboardingAutoAdvanceEligible(false);
    setArchieOnboardingDashboardPanelStep(null);
    setArchieOnboardingTasksActionStep(null);
    setArchieHasResponseActions(false);
    setArchieResponseFeedback(null);
    setArchieCopyState("idle");
    setArchieSessionId(null);
    setArchieBusy(false);
    setArchieReviewOpen(false);
  }, [clearArchieCopyResetTimer, clearArchieTimers]);

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
      clearArchieCopyResetTimer();
      setArchieRenderedMessage(reducedMotion ? response.message : "");
      setArchieSuggestedAction(response.suggestedAction || null);
      setArchieLocalActions([]);
      setArchieCitations(response.citations || []);
      setArchieDraft(response.draft || null);
      setArchieOnboardingStep(null);
      setArchieOnboardingAwaitingClick(false);
      setArchieOnboardingAutoAdvanceEligible(false);
      setArchieOnboardingDashboardPanelStep(null);
      setArchieOnboardingTasksActionStep(null);
      setArchieHasResponseActions(true);
      setArchieResponseFeedback(null);
      setArchieCopyState("idle");
      setArchieSessionId(response.sessionId || createArchieLocalSessionId());
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
    [clearArchieCopyResetTimer, prefersReducedMotion, startArchieTyping]
  );

  const startArchiePromptSequence = useCallback(() => {
    const reducedMotion = prefersReducedMotion();
    clearArchieTimers();
    clearArchieCopyResetTimer();
    setArchieQuestion("");
    setArchieRenderedMessage(reducedMotion ? ARCHIE_DEFAULT_PROMPT : "");
    setArchieInputVisible(false);
    setArchieSuggestedAction(null);
    setArchieLocalActions([]);
    setArchieCitations([]);
    setArchieDraft(null);
    setArchieOnboardingStep(null);
    setArchieOnboardingAwaitingClick(false);
    setArchieOnboardingAutoAdvanceEligible(false);
    setArchieOnboardingDashboardPanelStep(null);
    setArchieOnboardingTasksActionStep(null);
    setArchieHasResponseActions(false);
    setArchieResponseFeedback(null);
    setArchieCopyState("idle");
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
  }, [clearArchieCopyResetTimer, clearArchieTimers, prefersReducedMotion, queueArchieTimer, startArchieTyping]);

  const submitArchieQuestion = useCallback(async () => {
    const nextQuestion = String(archieQuestion || "").trim();
    if (!nextQuestion || archieBusy) return;
    setArchieBusy(true);
    clearArchieTimers();
    clearArchieCopyResetTimer();
    setArchieQuestion("");
    setArchieSuggestedAction(null);
    setArchieLocalActions([]);
    setArchieCitations([]);
    setArchieDraft(null);
    setArchieOnboardingStep(null);
    setArchieOnboardingAwaitingClick(false);
    setArchieOnboardingAutoAdvanceEligible(false);
    setArchieOnboardingDashboardPanelStep(null);
    setArchieOnboardingTasksActionStep(null);
    setArchieHasResponseActions(false);
    setArchieResponseFeedback(null);
    setArchieCopyState("idle");
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
      const response = await fetch(resolveArchieApiUrl("/api/archie/query"), {
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
      const result = (await response.json().catch(() => null)) as (ArchieQueryResponse & ArchieApiErrorResult) | null;
      if (!response.ok || !result) {
        if (result?.code === ARCHIE_PRO_REQUIRED_CODE) {
          presentArchieResponse(buildArchieProUpgradePresentation(result));
          return;
        }
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
  }, [activePage, archieBusy, archieQuestion, clearArchieCopyResetTimer, clearArchieTimers, presentArchieResponse]);

  const showArchieHelpMessage = useCallback((message: string) => {
    const nextMessage = String(message || "").trim();
    if (!nextMessage) return;
    const reducedMotion = prefersReducedMotion();
    clearArchieTimers();
    clearArchieCopyResetTimer();
    const shouldAnimateOpen = !isArchieBubbleOpen;
    setIsArchieBubbleOpen(true);
    setArchieQuestion("");
    setArchieRenderedMessage(reducedMotion ? nextMessage : "");
    setArchieInputVisible(false);
    setArchieSuggestedAction(null);
    setArchieLocalActions([]);
    setArchieCitations([]);
    setArchieDraft(null);
    setArchieOnboardingStep(null);
    setArchieOnboardingAwaitingClick(false);
    setArchieOnboardingAutoAdvanceEligible(false);
    setArchieOnboardingDashboardPanelStep(null);
    setArchieHasResponseActions(true);
    setArchieResponseFeedback(null);
    setArchieCopyState("idle");
    setArchieReviewOpen(false);
    setArchieBusy(false);
    setArchieSessionId(createArchieLocalSessionId());
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
  }, [clearArchieCopyResetTimer, clearArchieTimers, isArchieBubbleOpen, prefersReducedMotion, queueArchieTimer, startArchieTyping]);

  const presentArchieLocalMessage = useCallback(
    (input: {
      message: string;
      actions?: ArchieLocalAction[];
      showInputAfterTyping?: boolean;
      onboardingStep?: OnboardingStep | null;
      onboardingAwaitingClick?: boolean;
      onboardingAutoAdvanceEligible?: boolean;
      onboardingDashboardPanelStep?: OnboardingDashboardPanelStepId | null;
      onboardingTasksActionStep?: OnboardingTasksActionStepId | null;
    }) => {
      const nextMessage = String(input.message || "").trim();
      if (!nextMessage) return;
      const reducedMotion = prefersReducedMotion();
      clearArchieTimers();
      clearArchieCopyResetTimer();
      setIsArchieBubbleOpen(true);
      setArchieQuestion("");
      setArchieRenderedMessage(reducedMotion ? nextMessage : "");
      setArchieInputVisible(false);
      setArchieSuggestedAction(null);
      setArchieLocalActions(reducedMotion ? input.actions || [] : []);
      setArchieCitations([]);
      setArchieDraft(null);
      setArchieOnboardingStep(input.onboardingStep || null);
      setArchieOnboardingAwaitingClick(!!input.onboardingAwaitingClick);
      setArchieOnboardingAutoAdvanceEligible(!!input.onboardingAutoAdvanceEligible);
      setArchieOnboardingDashboardPanelStep(input.onboardingDashboardPanelStep || null);
      setArchieOnboardingTasksActionStep(input.onboardingTasksActionStep || null);
      setArchieHasResponseActions(false);
      setArchieResponseFeedback(null);
      setArchieCopyState("idle");
      setArchieBusy(false);
      setArchieReviewOpen(false);
      setArchieSessionId(createArchieLocalSessionId());
      setArchieOutlineClosing(false);
      setArchieOutlineAnimating(false);
      setArchieOutlineComplete(true);
      setArchieTitleAnimation(reducedMotion ? "none" : "response");
      setArchieTitleAnimationKey((value) => value + 1);
      if (reducedMotion) {
        if (input.showInputAfterTyping) setArchieInputVisible(true);
        return;
      }
      startArchieTyping(nextMessage, () => {
        setArchieTitleAnimation("none");
        setArchieLocalActions(input.actions || []);
        if (input.showInputAfterTyping) setArchieInputVisible(true);
      });
    },
    [clearArchieCopyResetTimer, clearArchieTimers, prefersReducedMotion, startArchieTyping]
  );

  const finishOnboarding = useCallback(() => {
    const user = getFirebaseAuthClient()?.currentUser || null;
    completeOnboardingForCurrentSession(user);
    saveOnboardingDashboardPanelStepForCurrentSession(user, null);
    saveOnboardingTasksActionStepForCurrentSession(user, null);
    notifyOnboardingStateChanged();
    presentArchieLocalMessage({
      message: getCompletedOnboardingNotice(),
      showInputAfterTyping: true,
    });
  }, [presentArchieLocalMessage]);

  const skipOnboarding = useCallback(
    (step: OnboardingStep) => {
      const user = getFirebaseAuthClient()?.currentUser || null;
      skipOnboardingForCurrentSession(user, step);
      saveOnboardingDashboardPanelStepForCurrentSession(user, null);
      saveOnboardingTasksActionStepForCurrentSession(user, null);
      notifyOnboardingStateChanged();
      if (typeof window === "undefined") {
        closeArchieBubble({ animated: true });
        return;
      }
      const currentPath = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
      if (currentPath === "/dashboard") {
        window.location.reload();
        return;
      }
      window.location.assign("/dashboard");
    },
    [closeArchieBubble]
  );

  const presentDashboardPanelTourStep = useCallback(
    (step: OnboardingDashboardPanelStepId, opts?: { autoAdvanceIfCurrentPage?: boolean }) => {
      const user = getFirebaseAuthClient()?.currentUser || null;
      saveOnboardingStepForCurrentSession(user, "dashboard");
      saveOnboardingDashboardPanelStepForCurrentSession(user, step);
      saveOnboardingTasksActionStepForCurrentSession(user, null);
      notifyOnboardingStateChanged();
      const panelIndex = getOnboardingDashboardPanelStepIndex(step);
      const actions: ArchieLocalAction[] = [
        {
          id: "skip",
          label: "Skip",
          tone: "ghost",
          onClick: () => {
            skipOnboarding("dashboard");
          },
        },
        {
          id: "back",
          label: "Back",
          tone: "ghost",
          onClick: () => {
            if (panelIndex === 0) {
              presentOnboardingStepRef.current?.("dashboard", { waitingForModuleClick: true, autoAdvanceIfCurrentPage: false });
              return;
            }
            presentDashboardPanelTourStep(getOnboardingDashboardPanelStepByIndex(panelIndex - 1), { autoAdvanceIfCurrentPage: false });
          },
        },
      ];
      presentArchieLocalMessage({
        message: getOnboardingDashboardPanelStepMessage(step),
        actions,
        onboardingStep: "dashboard",
        onboardingAwaitingClick: false,
        onboardingAutoAdvanceEligible: !!opts?.autoAdvanceIfCurrentPage,
        onboardingDashboardPanelStep: step,
        onboardingTasksActionStep: null,
      });
    },
    [presentArchieLocalMessage, skipOnboarding]
  );

  const presentTasksAddTaskPrompt = useCallback(() => {
    const user = getFirebaseAuthClient()?.currentUser || null;
    saveOnboardingStepForCurrentSession(user, "tasks");
    saveOnboardingDashboardPanelStepForCurrentSession(user, null);
    saveOnboardingTasksActionStepForCurrentSession(user, "open-add-task");
    notifyOnboardingStateChanged();
    presentArchieLocalMessage({
      message: getOnboardingTasksActionStepMessage("open-add-task"),
      actions: [
        {
          id: "skip",
          label: "Skip",
          tone: "ghost",
          onClick: () => skipOnboarding("tasks"),
        },
        {
          id: "back",
          label: "Back",
          tone: "ghost",
          onClick: () => {
            presentOnboardingStepRef.current?.("tasks", { waitingForModuleClick: true, autoAdvanceIfCurrentPage: false });
          },
        },
      ],
      onboardingStep: "tasks",
      onboardingAwaitingClick: false,
      onboardingAutoAdvanceEligible: false,
      onboardingDashboardPanelStep: null,
      onboardingTasksActionStep: "open-add-task",
    });
  }, [presentArchieLocalMessage, skipOnboarding]);

  const presentOnboardingStep = useCallback(
    (
      stepRaw?: OnboardingStep | null,
      opts?: {
        waitingForModuleClick?: boolean;
        autoAdvanceIfCurrentPage?: boolean;
      }
    ) => {
      const user = getFirebaseAuthClient()?.currentUser || null;
      const step = stepRaw || readOnboardingStepForCurrentSession(user);
      if (!step) return;
      if (step === "dashboard" && opts?.autoAdvanceIfCurrentPage && activePage === "dashboard") {
        const storedDashboardPanelStep = readOnboardingDashboardPanelStepForCurrentSession(user) || "xp-progress";
        presentDashboardPanelTourStep(storedDashboardPanelStep, { autoAdvanceIfCurrentPage: false });
        return;
      }
      if (step === "tasks" && readOnboardingTasksActionStepForCurrentSession(user) === "open-add-task") {
        presentTasksAddTaskPrompt();
        return;
      }
      if (getOnboardingStepIndex(step) === 0 && !archieOnboardingStep) startOnboardingForCurrentSession(user, step);
      else saveOnboardingStepForCurrentSession(user, step);
      if (step !== "dashboard") saveOnboardingDashboardPanelStepForCurrentSession(user, null);
      if (step !== "tasks") saveOnboardingTasksActionStepForCurrentSession(user, null);
      notifyOnboardingStateChanged();
      const stepIndex = getOnboardingStepIndex(step);
      const waitingForModuleClick =
        typeof opts?.waitingForModuleClick === "boolean" ? opts.waitingForModuleClick : shouldOnboardingStepAwaitModuleClick(step);
      const actions: ArchieLocalAction[] = [];
      actions.push({
        id: "skip",
        label: "Skip",
        tone: "ghost",
        onClick: () => {
          skipOnboarding(step);
        },
      });
      if (stepIndex > 0) {
        actions.push({
          id: "back",
          label: "Back",
          tone: "ghost",
          onClick: () => {
            const previousStep = getOnboardingStepByIndex(stepIndex - 1);
            presentOnboardingStep(previousStep, { autoAdvanceIfCurrentPage: false });
          },
        });
      }
      const primaryAction = onboardingPrimaryActionForStep({
        step,
        awaitingClick: waitingForModuleClick,
        dashboardPanelStep: null,
      });
      if (primaryAction?.id === "finish") {
        actions.push({
          id: primaryAction.id,
          label: primaryAction.label,
          tone: primaryAction.tone,
          onClick: finishOnboarding,
        });
      } else if (primaryAction?.id === "continue") {
        actions.push({
          id: primaryAction.id,
          label: primaryAction.label,
          tone: primaryAction.tone,
          onClick: () => {
            const nextStep = getOnboardingStepByIndex(stepIndex + 1);
            presentOnboardingStep(nextStep, { autoAdvanceIfCurrentPage: false });
          },
        });
      }
      presentArchieLocalMessage({
        message: getOnboardingStepMessage(step),
        actions,
        onboardingStep: step,
        onboardingAwaitingClick: waitingForModuleClick,
        onboardingAutoAdvanceEligible: !!opts?.autoAdvanceIfCurrentPage,
        onboardingDashboardPanelStep: null,
        onboardingTasksActionStep: null,
      });
    },
    [activePage, archieOnboardingStep, finishOnboarding, presentArchieLocalMessage, presentDashboardPanelTourStep, presentTasksAddTaskPrompt, skipOnboarding]
  );

  const presentCompleteSetupPrompt = useCallback(() => {
    presentArchieLocalMessage({
      message: "Setup is still incomplete. When you're ready, use Complete Setup and I'll pick up where we left off.",
      actions: [
        {
          id: "completeSetup",
          label: "Complete Setup",
          tone: "accent",
          onClick: () => {
            const user = getFirebaseAuthClient()?.currentUser || null;
            presentOnboardingStep(readOnboardingStepForCurrentSession(user), { autoAdvanceIfCurrentPage: true });
          },
        },
      ],
      showInputAfterTyping: true,
    });
  }, [presentArchieLocalMessage, presentOnboardingStep]);

  useEffect(() => {
    presentOnboardingStepRef.current = presentOnboardingStep;
  }, [presentOnboardingStep]);

  const handleArchieResponseFeedback = useCallback(
    (requestedFeedback: ArchieResponseFeedback) => {
      const nextFeedback = nextArchieResponseFeedback(archieResponseFeedback, requestedFeedback);
      setArchieResponseFeedback(nextFeedback);
      if (!nextFeedback || !archieSessionId) return;
      void (async () => {
        try {
          const session = await resolveAuthSession();
          if (!session?.idToken) return;
          await sendArchieTelemetryEvent({
            idToken: session.idToken,
            sessionId: archieSessionId,
            eventType: nextFeedback === "up" ? "response_upvote" : "response_downvote",
          });
        } catch {
          // Ignore telemetry failures.
        }
      })();
    },
    [archieResponseFeedback, archieSessionId]
  );

  const handleArchieCopyResponse = useCallback(() => {
    const message = String(archieRenderedMessage || "").trim();
    if (!message) return;
    clearArchieCopyResetTimer();
    void copyArchieTextToClipboard(message).then((ok) => {
      setArchieCopyState(ok ? "copied" : "failed");
      archieCopyResetTimerRef.current = window.setTimeout(() => {
        setArchieCopyState("idle");
        archieCopyResetTimerRef.current = null;
      }, 1600);
    });
  }, [archieRenderedMessage, clearArchieCopyResetTimer]);

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

  const handleArchieLocalAction = useCallback((actionId: string) => {
    const target = archieLocalActions.find((action) => action.id === actionId);
    if (!target) return;
    target.onClick();
  }, [archieLocalActions]);

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
        const response = await fetch(resolveArchieApiUrl("/api/archie/recommendations/apply"), {
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
        const result = (await response.json().catch(() => null)) as (ArchieApiErrorResult & { appliedCount?: number }) | null;
        if (!response.ok) {
          if (result?.code === ARCHIE_PRO_REQUIRED_CODE) {
            setArchieReviewOpen(false);
            presentArchieResponse(buildArchieProUpgradePresentation(result));
            return;
          }
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
            message: "Draft discarded. Your workspace stayed unchanged.",
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
    const currentUser = getFirebaseAuthClient()?.currentUser || null;
    const onboardingStatus = readOnboardingStatusForCurrentSession(currentUser);
    void (async () => {
      if (currentUser && (onboardingStatus === "active" || onboardingStatus === "skipped")) {
        const onboardingComplete = await readCloudOnboardingComplete(currentUser.uid);
        if (!onboardingComplete) {
          presentCompleteSetupPrompt();
          return;
        }
      }
      setIsArchieBubbleOpen(true);
      startArchiePromptSequence();
    })();
  }, [closeArchieBubble, isArchieBubbleOpen, presentCompleteSetupPrompt, startArchiePromptSequence]);

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
    onOnboardingStepChange?.(
      variant === "desktop" && archieOnboardingStep
        ? {
            step: archieOnboardingStep,
            awaitingClick: archieOnboardingAwaitingClick,
            dashboardPanelStep: archieOnboardingDashboardPanelStep,
            tasksActionStep: archieOnboardingTasksActionStep,
          }
        : null
    );
  }, [archieOnboardingAwaitingClick, archieOnboardingDashboardPanelStep, archieOnboardingStep, archieOnboardingTasksActionStep, onOnboardingStepChange, variant]);

  useEffect(() => {
    if (variant !== "desktop" || typeof window === "undefined") return;
    const onModuleClick = (event: Event) => {
      const detail = (event as CustomEvent<OnboardingModuleClickDetail>).detail;
      const triggeredStep = detail?.step;
      if (
        triggeredStep !== "dashboard" &&
        triggeredStep !== "tasks" &&
        triggeredStep !== "friends" &&
        triggeredStep !== "leaderboard" &&
        triggeredStep !== "settings"
      ) {
        return;
      }
      const resolution = resolveOnboardingModuleProgress({
        currentStep: archieOnboardingStep,
        awaitingClick: archieOnboardingAwaitingClick,
        triggeredStep,
      });
      if (resolution.type === "ignore") return;
      if (triggeredStep === "dashboard") {
        presentDashboardPanelTourStep("xp-progress", { autoAdvanceIfCurrentPage: false });
        return;
      }
      if (triggeredStep === "tasks") {
        presentTasksAddTaskPrompt();
        return;
      }
      if (resolution.type === "reveal_finish") {
        presentOnboardingStep("settings", { waitingForModuleClick: false, autoAdvanceIfCurrentPage: false });
        return;
      }
      presentOnboardingStep(resolution.nextStep, { autoAdvanceIfCurrentPage: false });
    };
    window.addEventListener(ONBOARDING_MODULE_CLICK_EVENT, onModuleClick as EventListener);
    return () => {
      window.removeEventListener(ONBOARDING_MODULE_CLICK_EVENT, onModuleClick as EventListener);
    };
  }, [archieOnboardingAwaitingClick, archieOnboardingStep, presentDashboardPanelTourStep, presentOnboardingStep, presentTasksAddTaskPrompt, variant]);

  useEffect(() => {
    if (variant !== "desktop" || typeof window === "undefined") return;
    const onDashboardClick = (event: Event) => {
      const detail = (event as CustomEvent<OnboardingDashboardClickDetail>).detail;
      if (detail?.source !== "dashboard-content") return;
      if (archieOnboardingStep !== "dashboard" || !archieOnboardingDashboardPanelStep) return;
      const resolution = resolveOnboardingDashboardPanelProgress(archieOnboardingDashboardPanelStep);
      if (resolution.type === "ignore") return;
      if (resolution.type === "advance_step") {
        presentOnboardingStep("tasks", { autoAdvanceIfCurrentPage: false });
        return;
      }
      presentDashboardPanelTourStep(resolution.nextPanelStep, { autoAdvanceIfCurrentPage: false });
    };
    window.addEventListener(ONBOARDING_DASHBOARD_CLICK_EVENT, onDashboardClick as EventListener);
    return () => {
      window.removeEventListener(ONBOARDING_DASHBOARD_CLICK_EVENT, onDashboardClick as EventListener);
    };
  }, [archieOnboardingDashboardPanelStep, archieOnboardingStep, presentDashboardPanelTourStep, presentOnboardingStep, variant]);

  useEffect(() => {
    if (variant !== "desktop" || typeof window === "undefined") return;
    const onAddTaskClick = () => {
      if (archieOnboardingStep !== "tasks" || archieOnboardingTasksActionStep !== "open-add-task") return;
      presentOnboardingStep("friends", { autoAdvanceIfCurrentPage: false });
    };
    window.addEventListener(ONBOARDING_ADD_TASK_CLICK_EVENT, onAddTaskClick as EventListener);
    return () => {
      window.removeEventListener(ONBOARDING_ADD_TASK_CLICK_EVENT, onAddTaskClick as EventListener);
    };
  }, [archieOnboardingStep, archieOnboardingTasksActionStep, presentOnboardingStep, variant]);

  useEffect(() => {
    if (
      !shouldAutoAdvanceOnboardingStep({
        step: archieOnboardingStep,
        awaitingClick: archieOnboardingAwaitingClick,
        autoAdvanceIfCurrentPage: archieOnboardingAutoAdvanceEligible,
        activePage,
      })
    ) {
      return;
    }
    const triggeredStep = archieOnboardingStep as OnboardingModuleStep;
    const resolution = resolveOnboardingModuleProgress({
      currentStep: archieOnboardingStep,
      awaitingClick: archieOnboardingAwaitingClick,
      triggeredStep,
    });
    if (resolution.type === "ignore") return;
    if (triggeredStep === "dashboard") {
      presentDashboardPanelTourStep("xp-progress", { autoAdvanceIfCurrentPage: false });
      return;
    }
    if (triggeredStep === "tasks") {
      presentTasksAddTaskPrompt();
      return;
    }
    if (resolution.type === "reveal_finish") {
      presentOnboardingStep("settings", { waitingForModuleClick: false, autoAdvanceIfCurrentPage: false });
      return;
    }
    presentOnboardingStep(resolution.nextStep, { autoAdvanceIfCurrentPage: false });
  }, [
    activePage,
    archieOnboardingAutoAdvanceEligible,
    archieOnboardingAwaitingClick,
    archieOnboardingStep,
    presentDashboardPanelTourStep,
    presentOnboardingStep,
    presentTasksAddTaskPrompt,
  ]);

  useEffect(() => {
    if (onboardingBootedRef.current) return;
    if (activePage !== "dashboard") return;
    if (!isVisibleArchieVariant(variant)) return;
    const auth = getFirebaseAuthClient();
    if (!auth) return;

    let cancelled = false;

    const maybeBootOnboarding = async (user: User | null) => {
      if (cancelled || onboardingBootedRef.current || !user) return;
      if (!isVisibleArchieVariant(variant)) return;
      if (isOnboardingManualResumeRequired()) {
        onboardingBootedRef.current = true;
        return;
      }
      if (hasCompletedOnboardingForCurrentSession(user)) {
        onboardingBootedRef.current = true;
        return;
      }
      const onboardingComplete = await readCloudOnboardingComplete(user.uid);
      if (cancelled || onboardingBootedRef.current) return;
      if (onboardingComplete) {
        onboardingBootedRef.current = true;
        return;
      }
      onboardingBootedRef.current = true;
      presentOnboardingStep(readOnboardingStepForCurrentSession(user), { autoAdvanceIfCurrentPage: true });
    };

    void maybeBootOnboarding(auth.currentUser);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void maybeBootOnboarding(user || null);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activePage, presentOnboardingStep, variant]);

  useEffect(() => {
    if (!isArchieBubbleOpen) return;
    if (archieOnboardingStep) return;
    let cancelled = false;
    void (async () => {
      try {
        const session = await resolveAuthSession();
        if (!session?.idToken) return;
        const response = await fetch(resolveArchieApiUrl("/api/archie/recommendations/latest"), {
          method: "GET",
          credentials: "same-origin",
          headers: {
            "x-firebase-auth": session.idToken,
          },
        });
        const result = (await response.json().catch(() => null)) as (ArchieRecentDraftResponse & ArchieApiErrorResult) | null;
        if (cancelled) return;
        if (!response.ok) {
          if (result?.code === ARCHIE_PRO_REQUIRED_CODE) {
            setArchieLastOpenDraft(null);
            setArchieLastOpenDraftSessionId(null);
          }
          return;
        }
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
  }, [archieOnboardingStep, isArchieBubbleOpen]);

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
      clearArchieCopyResetTimer();
    },
    [clearArchieBlinkTimers, clearArchieCopyResetTimer, clearArchieTimers]
  );

  const showArchieResponseActions = shouldShowArchieResponseActionRow({
    busy: archieBusy,
    inputVisible: archieInputVisible,
    hasResponseActions: archieHasResponseActions,
    message: archieRenderedMessage,
  });
  const archieOnboardingStepIndex = archieOnboardingStep ? getOnboardingStepIndex(archieOnboardingStep) : -1;
  const archieOnboardingProgressPercent =
    archieOnboardingStepIndex >= 0 ? Math.round((archieOnboardingStepIndex / Math.max(1, ONBOARDING_STEPS.length - 1)) * 100) : 0;
  const archieOnboardingHeadingOnly =
    archieOnboardingStep != null && archieOnboardingStep !== "welcome" && archieOnboardingStep !== "dashboard";
  const showArchieActionRow = !archieBusy && (!!archieSuggestedAction || archieLocalActions.length > 0 || showReopenLastDraft);
  const archieActionRowVisible = archieInputVisible || archieLocalActions.length > 0;
  const archieBubbleTextVisible =
    archieTitleAnimation !== "none" || archieInputVisible || archieLocalActions.length > 0 || !!archieRenderedMessage.trim();
  const archieBubbleMessageLines = splitArchieBubbleMessage(archieRenderedMessage);

  return (
    <>
      <div className={`desktopRailMascot${variant === "mobile" ? " mobileArchieAssistant" : ""}`}>
        <div
          className={`desktopRailMascotBubble${isArchieBubbleOpen ? " isOpen" : ""}${archieOutlineAnimating ? " isOutlineAnimating" : ""}${archieOutlineComplete ? " isOutlineComplete" : ""}${archieOutlineClosing ? " isClosing" : ""}${archieBusy ? " isBusy" : ""}${archieOnboardingStep ? " isOnboarding" : ""}`}
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
          {archieBusy ? (
            <div className="desktopRailMascotThinkingWrap">
              <span className="desktopRailMascotThinkingIndicator" aria-live="polite" aria-label="Archie is thinking">
                Thinking...
              </span>
            </div>
          ) : (
            <div className={`desktopRailMascotBubbleTitle${archieOnboardingStep ? " isOnboarding" : ""}${archieOnboardingHeadingOnly ? " isOnboardingHeadingOnly" : ""}`}>
              {archieOnboardingStep ? (
                <div className="desktopRailMascotOnboardingProgress" aria-label={`Onboarding ${archieOnboardingProgressPercent}% complete`}>
                  <div className="desktopRailMascotOnboardingProgressBar rewardSegmentedBar" aria-hidden="true">
                    <span
                      className="desktopRailMascotOnboardingProgressFill rewardSegmentedBarFill"
                      style={{ width: `${archieOnboardingProgressPercent}%` }}
                    />
                    <span className="rewardSegmentedBarTrack">
                      <span className="rewardSegmentedBarSegment" />
                      <span className="rewardSegmentedBarSegment" />
                      <span className="rewardSegmentedBarSegment" />
                      <span className="rewardSegmentedBarSegment" />
                      <span className="rewardSegmentedBarSegment" />
                    </span>
                  </div>
                  <span className="desktopRailMascotOnboardingProgressLabel">{archieOnboardingProgressPercent}% complete</span>
                </div>
              ) : null}
              <span
                key={archieTitleAnimationKey}
                className={`desktopRailMascotBubbleTitleText${archieTitleAnimation === "prompt" ? " isTypingPrompt" : ""}${archieTitleAnimation === "response" ? " isTypingResponse" : ""}${archieBubbleTextVisible ? " isVisible" : ""}${archieOnboardingStep ? " isOnboarding" : ""}${archieOnboardingHeadingOnly ? " isOnboardingHeadingOnly" : ""}`}
              >
                {archieBubbleMessageLines.map((line, index) => (
                  <span
                    key={`${archieTitleAnimationKey}-${line.id}`}
                    className={`desktopRailMascotBubbleTitleLine${line.isInstruction ? " isInstruction" : ""}`}
                    style={{ "--archie-line-delay": `${index * 90}ms` } as CSSProperties}
                  >
                    {line.text || "\u00A0"}
                  </span>
                ))}
              </span>
            </div>
          )}
          <ArchieResponseActionRow
            visible={showArchieResponseActions}
            feedback={archieResponseFeedback}
            copyState={archieCopyState}
            onFeedback={handleArchieResponseFeedback}
            onCopy={handleArchieCopyResponse}
          />
          {!archieBusy && archieCitations.length ? (
            <div className={`desktopRailMascotMeta${archieInputVisible ? " isVisible" : ""}`} aria-label="Archie sources">
              {archieCitations.slice(0, 2).map((citation) => (
                <span className="desktopRailMascotMetaTag" key={citation.id}>
                  {formatCitationTag(citation)}
                </span>
              ))}
            </div>
          ) : null}
          {showArchieActionRow ? (
            <div className={`desktopRailMascotActionRow${archieActionRowVisible ? " isVisible" : ""}${archieOnboardingStep ? " isOnboarding" : ""}`}>
              {archieLocalActions.length
                ? archieLocalActions.map((action) => (
                    <button
                      key={action.id}
                      className={`btn small desktopRailMascotActionBtn${archieOnboardingStep ? " isOnboarding" : ""}${archieOnboardingStep && action.tone === "accent" ? " isOnboardingPrimary" : ""}${archieOnboardingStep && action.id === "skip" ? " isOnboardingSkip" : ""} ${action.tone === "accent" ? "btn-accent" : action.tone === "warn" ? "btn-warn" : "btn-ghost"}`}
                      type="button"
                      onClick={() => handleArchieLocalAction(action.id)}
                      disabled={archieBusy}
                    >
                      {action.label}
                    </button>
                  ))
                : archieSuggestedAction ? (
                    <button
                      className="btn btn-ghost small desktopRailMascotActionBtn"
                      type="button"
                      onClick={handleArchieSuggestedAction}
                      disabled={archieBusy}
                    >
                      {archieSuggestedAction.label}
                    </button>
                  ) : null}
              {showReopenLastDraft && (!archieSuggestedAction || !isArchieDraftAction(archieSuggestedAction)) && !archieLocalActions.length ? (
                <button className="btn btn-ghost small desktopRailMascotActionBtn" type="button" onClick={handleReopenLastDraft} disabled={archieBusy}>
                  Reopen Last Draft
                </button>
              ) : null}
            </div>
          ) : null}
          {!archieBusy && !archieLocalActions.length ? (
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
                placeholder="Ask Archie a question..."
                aria-label="Ask Archie a question"
                disabled={archieBusy}
              />
              <span className="desktopRailMascotInputCaret" aria-hidden="true" />
            </span>
          ) : null}
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
                    Snooze
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => void handleDraftDecision("discard")} disabled={archieBusy}>
                    Discard
                  </button>
                  <button className="btn btn-accent" type="button" onClick={() => void handleDraftDecision("apply")} disabled={archieBusy}>
                    Implement
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
