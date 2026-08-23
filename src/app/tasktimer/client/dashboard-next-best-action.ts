import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getApiUrl } from "../lib/apiClient";
import type { ExecutiveRequestCoordinator } from "./executive-request-coordinator";
import { getExecutiveFunctionLockedActionLabel } from "../lib/executiveFunctionAvailability";
import { TASK_COMPLETION_CHANGED_EVENT } from "./task-completion-events";
import type { TaskLaunchResult } from "./task-timer-lifecycle";

export type NextBestActionDashboardRecommendation = {
  recommendationId: string;
  type: "NEXT_BEST_ACTION";
  taskId: string;
  title: string;
  firstAction?: string;
  estimatedMinutes: number;
  durationSource?: string;
  timeGoalMinutes?: number;
  dailyProgressPercent?: number;
  latestHistoryEntry?: { ts: number; ms: number };
  confidence?: string;
  reasonCodes?: string[];
  focusWindowMatched?: boolean | null;
  explanation?: string;
  createdAt?: string;
  expiresAt: string;
};

export type NextBestActionDashboardResponse =
  | {
      kind: "recommendation";
      recommendation: NextBestActionDashboardRecommendation;
    }
  | { kind: "empty" }
  | { kind: "stale" }
  | { kind: "invalid" };

const TIME_OPTIONS = [10, 20, 30, 60, null] as const;
const PLUS_REQUIRED_MESSAGE =
  "Upgrade to PLUS to use executive function features.";
const EMPTY_NEXT_BEST_ACTION_MESSAGE = "No eligible task is ready right now.";
const REST_DAY_NEXT_BEST_ACTION_MESSAGE =
  "Rest day. Today is outside your productivity days.";

function asString(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asPositiveMinutes(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 1440
    ? Math.round(value)
    : null;
}

function asPositiveMillis(value: unknown) {
  const millis = Math.floor(Number(value));
  return Number.isFinite(millis) && millis > 0 ? millis : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getNextBestActionTimeOptions() {
  return [...TIME_OPTIONS];
}

export function parseNextBestActionDashboardResponse(
  value: unknown,
  nowMs = Date.now(),
): NextBestActionDashboardResponse {
  const root = asRecord(value);
  if (!root || root.ok !== true) return { kind: "invalid" };
  if (root.recommendation == null) return { kind: "empty" };
  const raw = asRecord(root.recommendation);
  if (!raw || raw.type !== "NEXT_BEST_ACTION") return { kind: "invalid" };
  const recommendationId = asString(raw.recommendationId, 160);
  const taskId = asString(raw.taskId, 160);
  const title = asString(raw.title, 240);
  const estimatedMinutes = asPositiveMinutes(raw.estimatedMinutes);
  const expiresAt = asString(raw.expiresAt, 80);
  const expiresAtMs = Date.parse(expiresAt);
  if (
    !recommendationId ||
    !taskId ||
    !title ||
    !estimatedMinutes ||
    !expiresAt ||
    !Number.isFinite(expiresAtMs)
  )
    return { kind: "invalid" };
  if (expiresAtMs <= nowMs) return { kind: "stale" };
  const reasonCodes = Array.isArray(raw.reasonCodes)
    ? raw.reasonCodes
        .filter((reason): reason is string => typeof reason === "string")
        .slice(0, 8)
    : [];
  const latestHistory = asRecord(raw.latestHistoryEntry);
  const latestHistoryTs = asPositiveMillis(latestHistory?.ts);
  const latestHistoryMs = asPositiveMillis(latestHistory?.ms);
  return {
    kind: "recommendation",
    recommendation: {
      recommendationId,
      type: "NEXT_BEST_ACTION",
      taskId,
      title,
      firstAction: asString(raw.firstAction, 320) || undefined,
      estimatedMinutes,
      durationSource: asString(raw.durationSource, 80) || undefined,
      timeGoalMinutes: asPositiveMinutes(raw.timeGoalMinutes) || undefined,
      dailyProgressPercent: typeof raw.dailyProgressPercent === "number" && Number.isInteger(raw.dailyProgressPercent) && raw.dailyProgressPercent >= 0 && raw.dailyProgressPercent <= 100 ? raw.dailyProgressPercent : undefined,
      latestHistoryEntry:
        latestHistoryTs && latestHistoryMs
          ? { ts: latestHistoryTs, ms: latestHistoryMs }
          : undefined,
      confidence: asString(raw.confidence, 40) || undefined,
      reasonCodes,
      focusWindowMatched:
        typeof raw.focusWindowMatched === "boolean"
          ? raw.focusWindowMatched
          : null,
      explanation: asString(raw.explanation, 360) || undefined,
      createdAt: asString(raw.createdAt, 80) || undefined,
      expiresAt,
    },
  };
}

function durationSourceLabel(source: string | undefined) {
  return source ? source.toLowerCase().replaceAll("_", " ") : "estimated";
}

export function formatNextBestActionDuration(
  recommendation: Pick<
    NextBestActionDashboardRecommendation,
    "estimatedMinutes" | "durationSource"
  >,
) {
  return `${recommendation.estimatedMinutes}m · ${durationSourceLabel(recommendation.durationSource)}`;
}

function formatMinutesDetail(minutes: number) {
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export function formatNextBestActionTimeGoalPill(
  minutes: number | null | undefined,
) {
  const safeMinutes = asPositiveMinutes(minutes);
  return safeMinutes ? formatMinutesDetail(safeMinutes) : "";
}

export function formatNextBestActionDailyProgressPill(
  percent: number | null | undefined,
) {
  return typeof percent === "number" && Number.isInteger(percent) && percent >= 0 && percent <= 100
    ? `${percent}% today`
    : "";
}

function formatHistoryDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return formatMinutesDetail(minutes);
}

function formatHistoryDate(ts: number) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(ts));
}

function formatConfidenceDetail(confidence: string | undefined) {
  const normalized = String(confidence || "").trim().toUpperCase();
  if (normalized === "HIGH")
    return "High - several strong signals support this recommendation";
  if (normalized === "MEDIUM")
    return "Medium - at least one useful signal supports this recommendation";
  if (normalized === "LOW")
    return "Low - limited signals are available for this recommendation";
  return "Not enough signal yet";
}

export function formatNextBestActionExplanation(
  recommendation: Pick<
    NextBestActionDashboardRecommendation,
    | "estimatedMinutes"
    | "durationSource"
    | "timeGoalMinutes"
    | "latestHistoryEntry"
    | "confidence"
    | "explanation"
  >,
) {
  const summary =
    recommendation.explanation ||
    "This is the most useful next step for right now.";
  const duration = `${recommendation.estimatedMinutes} minutes (${durationSourceLabel(recommendation.durationSource)})`;
  const confidence = formatConfidenceDetail(recommendation.confidence);
  const latestHistory = recommendation.latestHistoryEntry
    ? `${formatHistoryDuration(recommendation.latestHistoryEntry.ms)} on ${formatHistoryDate(recommendation.latestHistoryEntry.ts)}`
    : "No previous history entry";
  return [
    summary,
    `- Estimated effort based on historical duration: ${duration}`,
    `- Last history entry: ${latestHistory}`,
    `- Confidence: ${confidence}`,
  ].join("\n");
}

function getNextBestActionExplanationParts(
  recommendation: Parameters<typeof formatNextBestActionExplanation>[0],
) {
  const [summary, ...details] =
    formatNextBestActionExplanation(recommendation).split("\n");
  return {
    summary,
    details: details.map((detail) => {
      const normalized = detail.replace(/^- /, "");
      const separatorIndex = normalized.indexOf(": ");
      return separatorIndex >= 0
        ? {
            label: normalized.slice(0, separatorIndex),
            value: normalized.slice(separatorIndex + 2),
          }
        : { label: normalized, value: "" };
    }),
  };
}

function renderNextBestActionExplanation(
  element: HTMLElement,
  recommendation: Parameters<typeof formatNextBestActionExplanation>[0],
) {
  const { summary, details } = getNextBestActionExplanationParts(recommendation);
  const writableElement = element as HTMLElement & {
    replaceChildren?: (...nodes: Node[]) => void;
  };
  if (typeof writableElement.replaceChildren !== "function") {
    writableElement.textContent = formatNextBestActionExplanation(recommendation);
    return;
  }
  const documentRef = writableElement.ownerDocument;
  const summaryElement = documentRef.createElement("p");
  summaryElement.className = "dashboardNextBestActionExplanationSummary";
  const heading = documentRef.createElement("strong");
  heading.textContent = "Why this?";
  const summaryText = documentRef.createElement("span");
  summaryText.textContent = ` ${summary}`;
  summaryElement.append(heading, summaryText);

  const list = documentRef.createElement("ul");
  list.className = "dashboardNextBestActionExplanationList";
  details.forEach((detail) => {
    const item = documentRef.createElement("li");
    const label = documentRef.createElement("span");
    label.className = "dashboardNextBestActionExplanationLabel";
    label.textContent = detail.label;
    const value = documentRef.createElement("span");
    value.className = "dashboardNextBestActionExplanationValue";
    value.textContent = detail.value;
    item.append(label, value);
    list.append(item);
  });
  writableElement.replaceChildren(summaryElement, list);
}

function setHidden(element: HTMLElement | null, hidden: boolean) {
  if (!element) return;
  element.hidden = hidden;
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
}

function getElement(documentRef: Document, id: string) {
  return documentRef.getElementById(id) as HTMLElement | null;
}

function setStartNowButtonLabel(button: HTMLButtonElement, label: string) {
  const labelElement = button.querySelector?.(".dashboardStartNowButtonLabel");
  if (labelElement) labelElement.textContent = label;
  else button.textContent = label;
}

type CreateDashboardNextBestActionOptions = {
  documentRef?: Document;
  windowRef?: Window;
  fetchImpl?: typeof fetch;
  requestCoordinator?: ExecutiveRequestCoordinator;
  getCurrentAppPage: () => string;
  canUseExecutiveFunction?: () => boolean;
  getExecutiveFunctionUnavailableMessage?: () => string;
  showUpgradePrompt?: (featureName: string, plan?: "plus") => void;
  getTodayIsProductivityDay?: () => boolean;
  getIdToken?: () => Promise<string | null>;
  startTaskById?: (taskId: string) => TaskLaunchResult;
};

export function createDashboardNextBestAction(
  options: CreateDashboardNextBestActionOptions,
) {
  const documentRef = options.documentRef ?? document;
  const windowRef = options.windowRef ?? window;
  const fetchImpl = options.fetchImpl ?? windowRef.fetch.bind(windowRef);
  const card = getElement(documentRef, "dashboardNextBestActionCard");
  let requestSequence = 0;
  let inFlightSequence: number | null = null;
  let automaticRefreshBlockedByError = false;
  let abortController: AbortController | null = null;
  let isDestroyed = false;
  const shownTaskIds = new Set<string>();

  function setStatus(
    message: string,
    state:
      | "loading"
      | "empty"
      | "rest"
      | "error"
      | "stale"
      | "ready"
      | "locked"
      | "started",
  ) {
    const status = getElement(documentRef, "dashboardNextBestActionStatus");
    if (status) {
      status.textContent = message;
      setHidden(status, state !== "loading");
    }
    card?.setAttribute("data-next-best-action-state", state);
    setHidden(
      getElement(documentRef, "dashboardNextBestActionContent"),
      state !== "ready" && state !== "started",
    );
    setHidden(
      getElement(documentRef, "dashboardNextBestActionEmpty"),
      state !== "empty" && state !== "rest",
    );
    setHidden(
      getElement(documentRef, "dashboardNextBestActionError"),
      state !== "error" && state !== "stale" && state !== "locked",
    );
    const retry = getElement(
      documentRef,
      "dashboardNextBestActionRetry",
    ) as HTMLButtonElement | null;
    if (retry) {
      retry.hidden =
        state !== "error" && state !== "stale" && state !== "locked";
      retry.disabled = false;
      retry.textContent =
        state === "locked"
          ? getExecutiveFunctionLockedActionLabel(message, "Retry")
          : "Retry";
      retry.dataset.planLocked = state === "locked" ? "executiveFunction" : "";
    }
    const actionButtons = documentRef.querySelectorAll<HTMLButtonElement>(
      "[data-next-best-action-action]",
    );
    actionButtons.forEach((button) => {
      button.disabled = state !== "ready";
    });
    card?.classList.toggle("isPlanLocked", state === "locked");
    if (state === "locked")
      card?.setAttribute("data-plan-locked", "executiveFunction");
    else card?.removeAttribute("data-plan-locked");
  }

  function setEmptyMessage(message = EMPTY_NEXT_BEST_ACTION_MESSAGE) {
    const empty = getElement(documentRef, "dashboardNextBestActionEmpty");
    if (empty) empty.textContent = message;
  }

  function renderRestDay() {
    abortController?.abort();
    requestSequence += 1;
    setEmptyMessage(REST_DAY_NEXT_BEST_ACTION_MESSAGE);
    setStatus(REST_DAY_NEXT_BEST_ACTION_MESSAGE, "rest");
  }

  function lockIfNeeded() {
    if (options.canUseExecutiveFunction?.() !== false) return false;
    abortController?.abort();
    setStatus(
      options.getExecutiveFunctionUnavailableMessage?.() ||
        PLUS_REQUIRED_MESSAGE,
      "locked",
    );
    return true;
  }

  function renderRecommendation(
    recommendation: NextBestActionDashboardRecommendation,
  ) {
    shownTaskIds.add(recommendation.taskId);
    const title = getElement(documentRef, "dashboardNextBestActionTitle");
    const timeGoal = getElement(documentRef, "dashboardNextBestActionTimeGoal");
    const dailyProgress = getElement(documentRef, "dashboardNextBestActionDailyProgress");
    const firstAction = getElement(
      documentRef,
      "dashboardNextBestActionFirstAction",
    );
    const explanation = getElement(
      documentRef,
      "dashboardNextBestActionExplanation",
    );
    if (title) title.textContent = recommendation.title;
    if (timeGoal) {
      const timeGoalText = formatNextBestActionTimeGoalPill(
        recommendation.timeGoalMinutes,
      );
      timeGoal.textContent = timeGoalText;
      setHidden(timeGoal, !timeGoalText);
    }
    if (dailyProgress) {
      const dailyProgressText = formatNextBestActionDailyProgressPill(
        recommendation.dailyProgressPercent,
      );
      dailyProgress.textContent = dailyProgressText;
      setHidden(dailyProgress, !dailyProgressText);
    }
    if (firstAction) {
      firstAction.textContent =
        recommendation.firstAction || "Start with the smallest visible step.";
      firstAction.hidden = !recommendation.firstAction;
    }
    if (explanation)
      renderNextBestActionExplanation(explanation, recommendation);
    const actionButtons = documentRef.querySelectorAll<HTMLButtonElement>(
      "[data-next-best-action-action]",
    );
    actionButtons.forEach((button) => {
      button.hidden = false;
      button.disabled = false;
      if (button.getAttribute("data-next-best-action-action") === "start")
        setStartNowButtonLabel(button, "LAUNCH");
      button.setAttribute(
        "data-next-best-action-task-id",
        recommendation.taskId,
      );
      button.setAttribute(
        "data-next-best-action-recommendation-id",
        recommendation.recommendationId,
      );
    });
    setStatus("Recommendation ready", "ready");
  }

  function renderRecommendationStarted() {
    setStatus("Task in progress.", "started");
    const actionButtons = documentRef.querySelectorAll<HTMLButtonElement>(
      "[data-next-best-action-action]",
    );
    actionButtons.forEach((button) => {
      const action = button.getAttribute("data-next-best-action-action");
      button.disabled = true;
      if (action === "start") {
        setStartNowButtonLabel(button, "In Progress");
        button.hidden = false;
      } else {
        button.hidden = true;
      }
    });
  }

  async function getIdToken() {
    if (options.getIdToken) return options.getIdToken();
    return getFirebaseAuthClient()?.currentUser?.getIdToken() ?? null;
  }

  async function refresh(
    availableMinutes?: number | null,
    mode: "automatic" | "user" = "automatic",
  ) {
    if (isDestroyed) return;
    if (
      !["dashboard", "executive"].includes(options.getCurrentAppPage()) ||
      !card
    )
      return;
    if (lockIfNeeded()) return;
    if (options.getTodayIsProductivityDay?.() === false) {
      renderRestDay();
      return;
    }
    // Several workspace events can arrive together (for example during a
    // page transition). They describe the same automatic refresh, so keep the
    // current request visible instead of repeatedly aborting it and resetting
    // the card to its loading state.
    if (
      mode === "automatic" &&
      (inFlightSequence != null || automaticRefreshBlockedByError)
    )
      return;
    if (mode === "user") automaticRefreshBlockedByError = false;
    setEmptyMessage();
    shownTaskIds.clear();
    abortController?.abort();
    abortController = new AbortController();
    const sequence = ++requestSequence;
    inFlightSequence = sequence;
    setStatus("Loading your next best action...", "loading");
    try {
      const idToken = await getIdToken();
      if (!idToken)
        throw new Error(
          "Your sign-in session is no longer valid. Please sign in again.",
        );
      const body: Record<string, unknown> = {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      if (availableMinutes != null) body.availableMinutes = availableMinutes;
      const input = getApiUrl("/api/recommendations/next-best-action");
      const init = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      };
      const response = options.requestCoordinator
        ? await options.requestCoordinator.request({ input, init, mode })
        : await fetchImpl(input, init);
      const payload = await response.json().catch(() => ({}));
      if (sequence !== requestSequence) return;
      if (options.getTodayIsProductivityDay?.() === false) {
        renderRestDay();
        return;
      }
      if (!response.ok)
        throw new Error(
          asString(asRecord(payload)?.error, 200) ||
            "Could not load a next best action.",
        );
      const parsed = parseNextBestActionDashboardResponse(payload);
      if (parsed.kind === "recommendation")
        renderRecommendation(parsed.recommendation);
      else if (parsed.kind === "empty") {
        setEmptyMessage();
        setStatus("Nothing needs your attention right now.", "empty");
      }
      else if (parsed.kind === "stale")
        setStatus(
          "That recommendation is out of date. Refresh to choose again.",
          "stale",
        );
      else {
        if (mode === "automatic") automaticRefreshBlockedByError = true;
        setStatus(
          "Could not read the recommendation. Please try again.",
          "error",
        );
      }
    } catch (error) {
      if (abortController.signal.aborted || sequence !== requestSequence)
        return;
      if (options.getTodayIsProductivityDay?.() === false) {
        renderRestDay();
        return;
      }
      if (mode === "automatic") automaticRefreshBlockedByError = true;
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not load a next best action.",
        "error",
      );
    } finally {
      if (inFlightSequence === sequence) inFlightSequence = null;
    }
  }

  async function startRecommendation(target: HTMLElement) {
    const recommendationId = asString(
      target.getAttribute("data-next-best-action-recommendation-id"),
      160,
    );
    const taskId = asString(
      target.getAttribute("data-next-best-action-task-id"),
      160,
    );
    if (!recommendationId || !taskId) return;
    setStatus("Revalidating recommendation...", "loading");
    try {
      const idToken = await getIdToken();
      if (!idToken)
        throw new Error(
          "Your sign-in session is no longer valid. Please sign in again.",
        );
      const response = await fetchImpl(
        getApiUrl(
          `/api/recommendations/next-best-action/${encodeURIComponent(recommendationId)}/start`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-firebase-auth": idToken,
          },
          body: JSON.stringify({
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(
          asString(asRecord(payload)?.error, 240) ||
            "This recommendation can no longer be started.",
        );
        (error as Error & { code?: string }).code = asString(
          asRecord(payload)?.code,
          120,
        );
        throw error;
      }
      const launchResult = options.startTaskById?.(taskId);
      if (launchResult === "requires-confirmation") {
        setStatus("Confirm the active timer switch to launch this task.", "ready");
        return;
      }
      if (launchResult === "blocked" || launchResult === "not-found") {
        throw new Error("This task is no longer available to start. Refresh to choose again.");
      }
      renderRecommendationStarted();
    } catch (error) {
      const code = (error as Error & { code?: string })?.code;
      setStatus(
        code === "recommendation/stale" || code === "recommendation/expired"
          ? "This recommendation is out of date. Refresh to choose again."
          : error instanceof Error
            ? error.message
            : "Could not start the recommended task.",
        code === "recommendation/stale" || code === "recommendation/expired"
          ? "stale"
          : "error",
      );
    }
  }

  async function requestAlternative(target: HTMLElement) {
    const recommendationId = asString(
      target.getAttribute("data-next-best-action-recommendation-id"),
      160,
    );
    if (!recommendationId) return;
    setStatus("Finding an alternative...", "loading");
    try {
      const idToken = await getIdToken();
      if (!idToken)
        throw new Error(
          "Your sign-in session is no longer valid. Please sign in again.",
        );
      const response = await fetchImpl(
        getApiUrl(
          `/api/recommendations/next-best-action/${encodeURIComponent(recommendationId)}/alternative`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-firebase-auth": idToken,
          },
          body: JSON.stringify({
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            availableMinutes: getSelectedMinutes(),
            excludeTaskIds: Array.from(shownTaskIds),
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          asString(asRecord(payload)?.error, 240) ||
            "Could not find an alternative right now.",
        );
      const parsed = parseNextBestActionDashboardResponse(payload);
      if (parsed.kind === "recommendation")
        renderRecommendation(parsed.recommendation);
      else
        setStatus(
          "No more alternatives are available. Review your task list for more options.",
          "empty",
        );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not find an alternative right now.",
        "error",
      );
    }
  }

  async function dismissRecommendation(target: HTMLElement) {
    const recommendationId = asString(
      target.getAttribute("data-next-best-action-recommendation-id"),
      160,
    );
    if (!recommendationId) return;
    try {
      const idToken = await getIdToken();
      if (!idToken)
        throw new Error(
          "Your sign-in session is no longer valid. Please sign in again.",
        );
      const response = await fetchImpl(
        getApiUrl(
          `/api/recommendations/next-best-action/${encodeURIComponent(recommendationId)}/dismiss`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-firebase-auth": idToken,
          },
          body: JSON.stringify({}),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          asString(asRecord(payload)?.error, 240) ||
            "Could not dismiss the recommendation.",
        );
      setStatus(
        "Task hidden for an hour, or until another task is completed. Refresh then to choose again.",
        "empty",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not dismiss the recommendation.",
        "error",
      );
    }
  }

  async function releaseSuppressionsAfterCompletion(taskId: string) {
    const idToken = await getIdToken();
    if (!idToken) return;
    await fetchImpl(getApiUrl("/api/recommendations/next-best-action/suppressions/release"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
      body: JSON.stringify({ completedTaskId: taskId }),
    });
  }

  function handleAction(event: Event) {
    const target = (event.target as HTMLElement | null)?.closest?.(
      "[data-next-best-action-action]",
    ) as HTMLElement | null;
    if (!target) return;
    if (lockIfNeeded()) {
      options.showUpgradePrompt?.("Next Best Action", "plus");
      return;
    }
    const action = target.getAttribute("data-next-best-action-action");
    if (action === "start") {
      void startRecommendation(target);
      return;
    }
    if (action === "alternative") {
      void requestAlternative(target);
      return;
    }
    if (action === "dismiss") {
      void dismissRecommendation(target);
      return;
    }
    windowRef.dispatchEvent(
      new CustomEvent("tasklaunch:next-best-action", {
        detail: {
          action,
          taskId: target.getAttribute("data-next-best-action-task-id"),
          recommendationId: target.getAttribute(
            "data-next-best-action-recommendation-id",
          ),
        },
      }),
    );
    if (action === "dismiss")
      setStatus(
        "Recommendation snoozed. Choose another time to refresh.",
        "empty",
      );
  }

  function handlePageChange(event: Event) {
    const page = (event as CustomEvent<{ page?: unknown }>).detail?.page;
    if (page === "dashboard" || page === "executive")
      void refresh(getSelectedMinutes());
  }

  function refreshWhenVisible() {
    if (["dashboard", "executive"].includes(options.getCurrentAppPage()))
      void refresh(getSelectedMinutes());
  }

  function handleTimeSelectChange(event: Event) {
    const target = event.target as HTMLSelectElement | null;
    if (target?.id !== "dashboardNextBestActionTimeSelect") return;
    setSelectedTime(target.value);
    void refresh(getSelectedMinutes(), "user");
  }

  function handleTimePillClick(event: Event) {
    const target = (event.target as HTMLElement | null)?.closest?.(
      "[data-next-best-action-time]",
    ) as HTMLElement | null;
    if (!target) return;
    setSelectedTime(
      target.getAttribute("data-next-best-action-time") || "any",
    );
    void refresh(getSelectedMinutes(), "user");
  }

  function handleTaskCompletion(event: Event) {
    const taskId = asString((event as CustomEvent<{ taskId?: unknown }>).detail?.taskId, 160);
    if (!taskId || !["dashboard", "executive"].includes(options.getCurrentAppPage())) return;
    void releaseSuppressionsAfterCompletion(taskId).finally(() => {
      void refresh(getSelectedMinutes());
    });
  }

  function handleRetry() {
    if (lockIfNeeded()) {
      options.showUpgradePrompt?.("Next Best Action", "plus");
      return;
    }
    void refresh(getSelectedMinutes(), "user");
  }

  function getSelectedMinutes() {
    const value = (
      getElement(
        documentRef,
        "dashboardNextBestActionTimeSelect",
      ) as HTMLSelectElement | null
    )?.value;
    return value && value !== "any" ? Number(value) : null;
  }

  function setSelectedTime(value: string) {
    const normalized = TIME_OPTIONS.some(
      (option) => String(option ?? "any") === value,
    )
      ? value
      : "any";
    const select = getElement(
      documentRef,
      "dashboardNextBestActionTimeSelect",
    ) as HTMLSelectElement | null;
    if (select) select.value = normalized;
    documentRef
      .querySelectorAll<HTMLButtonElement>("[data-next-best-action-time]")
      .forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          button.getAttribute("data-next-best-action-time") === normalized
            ? "true"
            : "false",
        );
      });
  }

  function register() {
    if (!card) return;
    setSelectedTime(
      (
        getElement(
          documentRef,
          "dashboardNextBestActionTimeSelect",
        ) as HTMLSelectElement | null
      )?.value || "any",
    );
    documentRef.addEventListener("change", handleTimeSelectChange);
    documentRef.addEventListener("click", handleTimePillClick);
    card.addEventListener?.("click", handleAction);
    windowRef.addEventListener("tasklaunch:app-page-changed", handlePageChange);
    windowRef.addEventListener("tasklaunch:schedule-repair-applied", refreshWhenVisible);
    windowRef.addEventListener("tasklaunch:schedule-repair-undone", refreshWhenVisible);
    windowRef.addEventListener("tasklaunch:recovery-applied", refreshWhenVisible);
    windowRef.addEventListener("tasklaunch:recovery-undone", refreshWhenVisible);
    windowRef.addEventListener("tasktimer:optimal-productivity-days-changed", refreshWhenVisible);
    windowRef.addEventListener(TASK_COMPLETION_CHANGED_EVENT, handleTaskCompletion);
    const retry = getElement(documentRef, "dashboardNextBestActionRetry");
    retry?.addEventListener("click", handleRetry);
    if (["dashboard", "executive"].includes(options.getCurrentAppPage()))
      void refresh(getSelectedMinutes());
  }

  function destroy() {
    isDestroyed = true;
    abortController?.abort();
    requestSequence += 1;
    card?.removeEventListener?.("click", handleAction);
    documentRef.removeEventListener?.("change", handleTimeSelectChange);
    documentRef.removeEventListener?.("click", handleTimePillClick);
    windowRef.removeEventListener?.("tasklaunch:app-page-changed", handlePageChange);
    windowRef.removeEventListener?.("tasklaunch:schedule-repair-applied", refreshWhenVisible);
    windowRef.removeEventListener?.("tasklaunch:schedule-repair-undone", refreshWhenVisible);
    windowRef.removeEventListener?.("tasklaunch:recovery-applied", refreshWhenVisible);
    windowRef.removeEventListener?.("tasklaunch:recovery-undone", refreshWhenVisible);
    windowRef.removeEventListener?.("tasktimer:optimal-productivity-days-changed", refreshWhenVisible);
    windowRef.removeEventListener?.(TASK_COMPLETION_CHANGED_EVENT, handleTaskCompletion);
    getElement(documentRef, "dashboardNextBestActionRetry")?.removeEventListener?.("click", handleRetry);
  }

  return { register, refresh, destroy };
}
