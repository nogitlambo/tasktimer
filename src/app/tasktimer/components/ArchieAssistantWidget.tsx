"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import AppImg from "@/components/AppImg";
import {
  resolveArchieAssistantResponse,
  type ArchieSuggestedAction,
} from "../lib/archieAssistant";
import { STORAGE_KEY } from "../lib/storage";

type ArchieAssistantPage = "dashboard" | "tasks" | "test2" | "settings" | "none";
type ArchieBlinkPattern = "idle" | "flicker" | "slow" | "double";

type ArchieAssistantWidgetProps = {
  activePage: ArchieAssistantPage;
  variant?: "desktop" | "mobile";
};

const ARCHIE_DEFAULT_PROMPT = "What can I help with?";
const ARCHIE_OUTLINE_DRAW_MS = 840;
const ARCHIE_TYPE_MS = 2100;
const ARCHIE_TYPE_MS_PER_CHAR = Math.max(6, Math.round((ARCHIE_TYPE_MS / ARCHIE_DEFAULT_PROMPT.length) / 4));
const ARCHIE_BLINK_DURATION_MS = 2000;
const ARCHIE_BLINK_MIN_DELAY_MS = 10000;
const ARCHIE_BLINK_MAX_DELAY_MS = 15000;
const ARCHIE_HELP_REQUEST_EVENT = "tasktimer:archieHelpRequest";
const ARCHIE_NAVIGATE_EVENT = "tasktimer:archieNavigate";
const ARCHIE_INACTIVITY_CLOSE_MS = 30000;
const ARCHIE_PENDING_PUSH_TASK_ID_KEY = `${STORAGE_KEY}:pendingPushTaskId`;
const ARCHIE_PENDING_PUSH_TASK_EVENT = "tasktimer:pendingTaskJump";

export default function ArchieAssistantWidget({ activePage, variant = "desktop" }: ArchieAssistantWidgetProps) {
  const [isArchieBubbleOpen, setIsArchieBubbleOpen] = useState(false);
  const [archieQuestion, setArchieQuestion] = useState("");
  const [archieDisplayMessage, setArchieDisplayMessage] = useState(ARCHIE_DEFAULT_PROMPT);
  const [archieRenderedMessage, setArchieRenderedMessage] = useState(ARCHIE_DEFAULT_PROMPT);
  const [archieTitleAnimation, setArchieTitleAnimation] = useState<"none" | "prompt" | "response">("none");
  const [archieTitleAnimationKey, setArchieTitleAnimationKey] = useState(0);
  const [archieOutlineAnimating, setArchieOutlineAnimating] = useState(false);
  const [archieOutlineComplete, setArchieOutlineComplete] = useState(false);
  const [archieOutlineClosing, setArchieOutlineClosing] = useState(false);
  const [archieInputVisible, setArchieInputVisible] = useState(false);
  const [archieSuggestedAction, setArchieSuggestedAction] = useState<ArchieSuggestedAction | null>(null);
  const [archieBlinkPattern, setArchieBlinkPattern] = useState<ArchieBlinkPattern>("idle");
  const archieInputRef = useRef<HTMLTextAreaElement | null>(null);
  const archieTimersRef = useRef<number[]>([]);
  const archieBlinkStartTimerRef = useRef<number | null>(null);
  const archieBlinkStopTimerRef = useRef<number | null>(null);
  const archieInactivityTimerRef = useRef<number | null>(null);

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

  const clearArchieInactivityTimer = useCallback(() => {
    if (archieInactivityTimerRef.current != null) {
      window.clearTimeout(archieInactivityTimerRef.current);
      archieInactivityTimerRef.current = null;
    }
  }, []);

  const resetArchieBubble = useCallback(() => {
    clearArchieTimers();
    clearArchieInactivityTimer();
    setArchieQuestion("");
    setArchieDisplayMessage(ARCHIE_DEFAULT_PROMPT);
    setArchieRenderedMessage(ARCHIE_DEFAULT_PROMPT);
    setArchieTitleAnimation("none");
    setArchieTitleAnimationKey((value) => value + 1);
    setArchieOutlineAnimating(false);
    setArchieOutlineComplete(false);
    setArchieOutlineClosing(false);
    setArchieInputVisible(false);
    setArchieSuggestedAction(null);
  }, [clearArchieInactivityTimer, clearArchieTimers]);

  const closeArchieBubble = useCallback(
    (opts?: { animated?: boolean }) => {
      const reducedMotion = prefersReducedMotion();
      const animated = opts?.animated !== false && !reducedMotion;
      clearArchieTimers();
      clearArchieInactivityTimer();
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
    [clearArchieInactivityTimer, clearArchieTimers, prefersReducedMotion, queueArchieTimer, resetArchieBubble]
  );

  const restartArchieInactivityTimer = useCallback(() => {
    clearArchieInactivityTimer();
    if (!isArchieBubbleOpen) return;
    archieInactivityTimerRef.current = window.setTimeout(() => {
      archieInactivityTimerRef.current = null;
      closeArchieBubble({ animated: true });
    }, ARCHIE_INACTIVITY_CLOSE_MS);
  }, [clearArchieInactivityTimer, closeArchieBubble, isArchieBubbleOpen]);

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

  const startArchiePromptSequence = useCallback(() => {
    const reducedMotion = prefersReducedMotion();
    clearArchieTimers();
    clearArchieInactivityTimer();
    setArchieQuestion("");
    setArchieDisplayMessage(ARCHIE_DEFAULT_PROMPT);
    setArchieRenderedMessage(reducedMotion ? ARCHIE_DEFAULT_PROMPT : "");
    setArchieInputVisible(false);
    setArchieSuggestedAction(null);
    setArchieOutlineClosing(false);
    setArchieOutlineAnimating(!reducedMotion);
    setArchieOutlineComplete(reducedMotion);
    setArchieTitleAnimation("none");
    setArchieTitleAnimationKey((value) => value + 1);
    if (reducedMotion) {
      setArchieOutlineAnimating(false);
      setArchieOutlineComplete(true);
      setArchieTitleAnimation("none");
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
  }, [clearArchieInactivityTimer, clearArchieTimers, prefersReducedMotion, queueArchieTimer, startArchieTyping]);

  const submitArchieQuestion = useCallback(() => {
    const nextQuestion = String(archieQuestion || "").trim();
    if (!nextQuestion) return;
    const reducedMotion = prefersReducedMotion();
    const reply = resolveArchieAssistantResponse(nextQuestion, activePage);
    clearArchieTimers();
    clearArchieInactivityTimer();
    setArchieQuestion("");
    setArchieDisplayMessage(reply.message);
    setArchieRenderedMessage(reducedMotion ? reply.message : "");
    setArchieInputVisible(false);
    setArchieSuggestedAction(reply.suggestedAction || null);
    setArchieOutlineClosing(false);
    setArchieOutlineAnimating(false);
    setArchieOutlineComplete(true);
    setArchieTitleAnimation(reducedMotion ? "none" : "response");
    setArchieTitleAnimationKey((value) => value + 1);
    if (reducedMotion) {
      setArchieInputVisible(true);
      return;
    }
    startArchieTyping(reply.message, () => {
      setArchieTitleAnimation("none");
      setArchieInputVisible(true);
    });
  }, [activePage, archieQuestion, clearArchieInactivityTimer, clearArchieTimers, prefersReducedMotion, startArchieTyping]);

  const showArchieHelpMessage = useCallback((message: string) => {
    const nextMessage = String(message || "").trim();
    if (!nextMessage) return;
    const reducedMotion = prefersReducedMotion();
    clearArchieTimers();
    clearArchieInactivityTimer();
    const shouldAnimateOpen = !isArchieBubbleOpen;
    setIsArchieBubbleOpen(true);
    setArchieQuestion("");
    setArchieDisplayMessage(nextMessage);
    setArchieRenderedMessage(reducedMotion ? nextMessage : "");
    setArchieInputVisible(false);
    setArchieSuggestedAction(null);
    setArchieOutlineClosing(false);
    setArchieOutlineAnimating(shouldAnimateOpen && !reducedMotion);
    setArchieOutlineComplete(!shouldAnimateOpen || reducedMotion);
    setArchieTitleAnimation("none");
    setArchieTitleAnimationKey((value) => value + 1);
    if (reducedMotion) {
      setArchieOutlineAnimating(false);
      setArchieOutlineComplete(true);
      setArchieTitleAnimation("none");
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
  }, [clearArchieInactivityTimer, clearArchieTimers, isArchieBubbleOpen, prefersReducedMotion, queueArchieTimer, startArchieTyping]);

  const handleArchieSuggestedAction = useCallback(() => {
    if (!archieSuggestedAction || typeof window === "undefined") return;
    restartArchieInactivityTimer();
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
  }, [archieSuggestedAction, restartArchieInactivityTimer]);

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
      submitArchieQuestion();
    },
    [submitArchieQuestion]
  );

  useEffect(() => {
    if (!isArchieBubbleOpen || !archieInputVisible) return;
    archieInputRef.current?.focus();
  }, [archieInputVisible, isArchieBubbleOpen]);

  useEffect(() => {
    if (!isArchieBubbleOpen || archieOutlineClosing) {
      clearArchieInactivityTimer();
      return;
    }
    restartArchieInactivityTimer();
    return () => clearArchieInactivityTimer();
  }, [archieDisplayMessage, archieInputVisible, archieOutlineClosing, archieQuestion, archieSuggestedAction, clearArchieInactivityTimer, isArchieBubbleOpen, restartArchieInactivityTimer]);

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
    <div className={`desktopRailMascot${variant === "mobile" ? " mobileArchieAssistant" : ""}`}>
      <div
        className={`desktopRailMascotBubble${isArchieBubbleOpen ? " isOpen" : ""}${archieOutlineAnimating ? " isOutlineAnimating" : ""}${archieOutlineComplete ? " isOutlineComplete" : ""}${archieOutlineClosing ? " isClosing" : ""}`}
        aria-hidden={!isArchieBubbleOpen}
        onPointerDown={() => restartArchieInactivityTimer()}
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
        {archieSuggestedAction ? (
          <div className={`desktopRailMascotActionRow${archieInputVisible ? " isVisible" : ""}`}>
            <button
              className="btn btn-ghost small desktopRailMascotActionBtn"
              type="button"
              onClick={handleArchieSuggestedAction}
            >
              {archieSuggestedAction.label}
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
              restartArchieInactivityTimer();
              setArchieQuestion(event.target.value);
            }}
            onKeyDown={handleArchieInputKeyDown}
            onFocus={() => restartArchieInactivityTimer()}
            placeholder="Ask Archie a question..."
            aria-label="Ask Archie a question"
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
  );
}
