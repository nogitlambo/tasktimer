import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getApiUrl } from "../lib/apiClient";
import { getExecutiveFunctionLockedActionLabel } from "../lib/executiveFunctionAvailability";
import { dispatchTaskClarificationStartTaskEvent } from "./task-clarification-events";
import { TASK_COMPLETION_CHANGED_EVENT } from "./task-completion-events";

export type NextBestActionDashboardRecommendation = {
  recommendationId: string;
  type: "NEXT_BEST_ACTION";
  taskId: string;
  title: string;
  firstAction?: string;
  estimatedMinutes: number;
  durationSource?: string;
  timeGoalMinutes?: number;
  latestHistoryEntry?: { ts: number; ms: number };
  confidence?: string;
  reasonCodes?: string[];
  focusWindowMatched?: boolean | null;
  explanation?: string;
  createdAt?: string;
  expiresAt: string;
};

export type NextBestActionDashboardResponse =
  | { kind: "recommendation"; recommendation: NextBestActionDashboardRecommendation }
  | { kind: "empty" }
  | { kind: "stale" }
  | { kind: "invalid" };

const TIME_OPTIONS = [10, 20, 30, 60, null] as const;
const PLUS_REQUIRED_MESSAGE = "Upgrade to PLUS to use executive function features.";

function asString(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asPositiveMinutes(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1440 ? Math.round(value) : null;
}

function asPositiveMillis(value: unknown) {
  const millis = Math.floor(Number(value));
  return Number.isFinite(millis) && millis > 0 ? millis : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function getNextBestActionTimeOptions() {
  return [...TIME_OPTIONS];
}

export function parseNextBestActionDashboardResponse(value: unknown, nowMs = Date.now()): NextBestActionDashboardResponse {
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
  if (!recommendationId || !taskId || !title || !estimatedMinutes || !expiresAt || !Number.isFinite(expiresAtMs)) return { kind: "invalid" };
  if (expiresAtMs <= nowMs) return { kind: "stale" };
  const reasonCodes = Array.isArray(raw.reasonCodes) ? raw.reasonCodes.filter((reason): reason is string => typeof reason === "string").slice(0, 8) : [];
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
      latestHistoryEntry: latestHistoryTs && latestHistoryMs ? { ts: latestHistoryTs, ms: latestHistoryMs } : undefined,
      confidence: asString(raw.confidence, 40) || undefined,
      reasonCodes,
      focusWindowMatched: typeof raw.focusWindowMatched === "boolean" ? raw.focusWindowMatched : null,
      explanation: asString(raw.explanation, 360) || undefined,
      createdAt: asString(raw.createdAt, 80) || undefined,
      expiresAt,
    },
  };
}

function durationSourceLabel(source: string | undefined) {
  return source ? source.toLowerCase().replaceAll("_", " ") : "estimated";
}

export function formatNextBestActionDuration(recommendation: Pick<NextBestActionDashboardRecommendation, "estimatedMinutes" | "durationSource">) {
  return `${recommendation.estimatedMinutes}m · ${durationSourceLabel(recommendation.durationSource)}`;
}

function formatMinutesDetail(minutes: number) {
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
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

export function formatNextBestActionExplanation(recommendation: Pick<NextBestActionDashboardRecommendation, "estimatedMinutes" | "durationSource" | "timeGoalMinutes" | "latestHistoryEntry" | "confidence" | "explanation">) {
  const summary = recommendation.explanation || "This is the most useful next step for right now.";
  const duration = `${recommendation.estimatedMinutes} minutes, ${durationSourceLabel(recommendation.durationSource)} duration`;
  const confidence = recommendation.confidence ? `${recommendation.confidence.toLowerCase()} confidence` : "confidence available";
  const timeGoal = recommendation.timeGoalMinutes ? ` Current time goal: ${formatMinutesDetail(recommendation.timeGoalMinutes)}.` : "";
  const latestHistory = recommendation.latestHistoryEntry
    ? ` Last history entry: ${formatHistoryDuration(recommendation.latestHistoryEntry.ms)} on ${formatHistoryDate(recommendation.latestHistoryEntry.ts)}.`
    : "";
  return `${summary} Estimated effort: ${duration}.${timeGoal}${latestHistory} Recommendation confidence: ${confidence}.`;
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
  getCurrentAppPage: () => string;
  canUseExecutiveFunction?: () => boolean;
  getExecutiveFunctionUnavailableMessage?: () => string;
  showUpgradePrompt?: (featureName: string, plan?: "plus") => void;
  getIdToken?: () => Promise<string | null>;
};

export function createDashboardNextBestAction(options: CreateDashboardNextBestActionOptions) {
  const documentRef = options.documentRef ?? document;
  const windowRef = options.windowRef ?? window;
  const fetchImpl = options.fetchImpl ?? windowRef.fetch.bind(windowRef);
  const card = getElement(documentRef, "dashboardNextBestActionCard");
  let requestSequence = 0;
  let abortController: AbortController | null = null;
  const shownTaskIds = new Set<string>();

  function setStatus(message: string, state: "loading" | "empty" | "error" | "stale" | "ready" | "locked" | "started") {
    const status = getElement(documentRef, "dashboardNextBestActionStatus");
    if (status) {
      status.textContent = message;
      setHidden(status, state !== "loading");
    }
    card?.setAttribute("data-next-best-action-state", state);
    setHidden(getElement(documentRef, "dashboardNextBestActionContent"), state !== "ready" && state !== "started");
    setHidden(getElement(documentRef, "dashboardNextBestActionEmpty"), state !== "empty");
    setHidden(getElement(documentRef, "dashboardNextBestActionError"), state !== "error" && state !== "stale" && state !== "locked");
    const retry = getElement(documentRef, "dashboardNextBestActionRetry") as HTMLButtonElement | null;
    if (retry) {
      retry.hidden = state !== "error" && state !== "stale" && state !== "locked";
      retry.disabled = false;
      retry.textContent = state === "locked" ? getExecutiveFunctionLockedActionLabel(message, "Retry") : "Retry";
      retry.dataset.planLocked = state === "locked" ? "executiveFunction" : "";
    }
    const actionButtons = documentRef.querySelectorAll<HTMLButtonElement>("[data-next-best-action-action]");
    actionButtons.forEach((button) => {
      button.disabled = state !== "ready";
    });
    card?.classList.toggle("isPlanLocked", state === "locked");
    if (state === "locked") card?.setAttribute("data-plan-locked", "executiveFunction");
    else card?.removeAttribute("data-plan-locked");
  }

  function lockIfNeeded() {
    if (options.canUseExecutiveFunction?.() !== false) return false;
    abortController?.abort();
    setStatus(options.getExecutiveFunctionUnavailableMessage?.() || PLUS_REQUIRED_MESSAGE, "locked");
    return true;
  }

  function renderRecommendation(recommendation: NextBestActionDashboardRecommendation) {
    shownTaskIds.add(recommendation.taskId);
    const title = getElement(documentRef, "dashboardNextBestActionTitle");
    const firstAction = getElement(documentRef, "dashboardNextBestActionFirstAction");
    const explanation = getElement(documentRef, "dashboardNextBestActionExplanation");
    if (title) title.textContent = recommendation.title;
    if (firstAction) {
      firstAction.textContent = recommendation.firstAction || "Start with the smallest visible step.";
      firstAction.hidden = !recommendation.firstAction;
    }
    if (explanation) explanation.textContent = formatNextBestActionExplanation(recommendation);
    const actionButtons = documentRef.querySelectorAll<HTMLButtonElement>("[data-next-best-action-action]");
    actionButtons.forEach((button) => {
      button.hidden = false;
      button.disabled = false;
      if (button.getAttribute("data-next-best-action-action") === "start") setStartNowButtonLabel(button, "LAUNCH");
      button.setAttribute("data-next-best-action-task-id", recommendation.taskId);
      button.setAttribute("data-next-best-action-recommendation-id", recommendation.recommendationId);
    });
    setStatus("Recommendation ready", "ready");
  }

  function renderRecommendationStarted() {
    setStatus("Task in progress.", "started");
    const actionButtons = documentRef.querySelectorAll<HTMLButtonElement>("[data-next-best-action-action]");
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

  async function refresh(availableMinutes?: number | null) {
    if (!["dashboard", "executive"].includes(options.getCurrentAppPage()) || !card) return;
    if (lockIfNeeded()) return;
    shownTaskIds.clear();
    abortController?.abort();
    abortController = new AbortController();
    const sequence = ++requestSequence;
    setStatus("Loading your next best action...", "loading");
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const body: Record<string, unknown> = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      if (availableMinutes != null) body.availableMinutes = availableMinutes;
      const response = await fetchImpl(getApiUrl("/api/recommendations/next-best-action"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (sequence !== requestSequence) return;
      if (!response.ok) throw new Error(asString(asRecord(payload)?.error, 200) || "Could not load a next best action.");
      const parsed = parseNextBestActionDashboardResponse(payload);
      if (parsed.kind === "recommendation") renderRecommendation(parsed.recommendation);
      else if (parsed.kind === "empty") setStatus("Nothing needs your attention right now.", "empty");
      else if (parsed.kind === "stale") setStatus("That recommendation is out of date. Refresh to choose again.", "stale");
      else setStatus("Could not read the recommendation. Please try again.", "error");
    } catch (error) {
      if (abortController.signal.aborted || sequence !== requestSequence) return;
      setStatus(error instanceof Error ? error.message : "Could not load a next best action.", "error");
    }
  }

  async function startRecommendation(target: HTMLElement) {
    const recommendationId = asString(target.getAttribute("data-next-best-action-recommendation-id"), 160);
    const taskId = asString(target.getAttribute("data-next-best-action-task-id"), 160);
    if (!recommendationId || !taskId) return;
    setStatus("Revalidating recommendation...", "loading");
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const response = await fetchImpl(getApiUrl(`/api/recommendations/next-best-action/${encodeURIComponent(recommendationId)}/start`), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(asString(asRecord(payload)?.error, 240) || "This recommendation can no longer be started.");
        (error as Error & { code?: string }).code = asString(asRecord(payload)?.code, 120);
        throw error;
      }
      dispatchTaskClarificationStartTaskEvent({ taskId });
      renderRecommendationStarted();
    } catch (error) {
      const code = (error as Error & { code?: string })?.code;
      setStatus(code === "recommendation/stale" || code === "recommendation/expired" ? "This recommendation is out of date. Refresh to choose again." : error instanceof Error ? error.message : "Could not start the recommended task.", code === "recommendation/stale" || code === "recommendation/expired" ? "stale" : "error");
    }
  }

  async function requestAlternative(target: HTMLElement) {
    const recommendationId = asString(target.getAttribute("data-next-best-action-recommendation-id"), 160);
    if (!recommendationId) return;
    setStatus("Finding an alternative...", "loading");
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const response = await fetchImpl(getApiUrl(`/api/recommendations/next-best-action/${encodeURIComponent(recommendationId)}/alternative`), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          availableMinutes: getSelectedMinutes(),
          excludeTaskIds: Array.from(shownTaskIds),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString(asRecord(payload)?.error, 240) || "Could not find an alternative right now.");
      const parsed = parseNextBestActionDashboardResponse(payload);
      if (parsed.kind === "recommendation") renderRecommendation(parsed.recommendation);
      else setStatus("No more alternatives are available. Review your task list for more options.", "empty");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not find an alternative right now.", "error");
    }
  }

  async function dismissRecommendation(target: HTMLElement) {
    const recommendationId = asString(target.getAttribute("data-next-best-action-recommendation-id"), 160);
    if (!recommendationId) return;
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const response = await fetchImpl(getApiUrl(`/api/recommendations/next-best-action/${encodeURIComponent(recommendationId)}/dismiss`), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString(asRecord(payload)?.error, 240) || "Could not dismiss the recommendation.");
      setStatus("Recommendation dismissed. You can refresh for another choice.", "empty");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not dismiss the recommendation.", "error");
    }
  }

  function handleAction(event: Event) {
    const target = (event.target as HTMLElement | null)?.closest?.("[data-next-best-action-action]") as HTMLElement | null;
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
    windowRef.dispatchEvent(new CustomEvent("tasklaunch:next-best-action", {
      detail: {
        action,
        taskId: target.getAttribute("data-next-best-action-task-id"),
        recommendationId: target.getAttribute("data-next-best-action-recommendation-id"),
      },
    }));
    if (action === "dismiss") setStatus("Recommendation snoozed. Choose another time to refresh.", "empty");
  }

  function handlePageChange(event: Event) {
    const page = (event as CustomEvent<{ page?: unknown }>).detail?.page;
    if (page === "dashboard" || page === "executive") void refresh(getSelectedMinutes());
  }

  function getSelectedMinutes() {
    const value = (getElement(documentRef, "dashboardNextBestActionTimeSelect") as HTMLSelectElement | null)?.value;
    return value && value !== "any" ? Number(value) : null;
  }

  function setSelectedTime(value: string) {
    const normalized = TIME_OPTIONS.some((option) => String(option ?? "any") === value) ? value : "any";
    const select = getElement(documentRef, "dashboardNextBestActionTimeSelect") as HTMLSelectElement | null;
    if (select) select.value = normalized;
    documentRef.querySelectorAll<HTMLButtonElement>("[data-next-best-action-time]").forEach((button) => {
      button.setAttribute("aria-pressed", button.getAttribute("data-next-best-action-time") === normalized ? "true" : "false");
    });
  }

  function register() {
    if (!card) return;
    setSelectedTime((getElement(documentRef, "dashboardNextBestActionTimeSelect") as HTMLSelectElement | null)?.value || "any");
    documentRef.addEventListener("change", (event) => {
      const target = event.target as HTMLSelectElement | null;
      if (target?.id === "dashboardNextBestActionTimeSelect") {
        setSelectedTime(target.value);
        void refresh(getSelectedMinutes());
      }
    });
    documentRef.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement | null)?.closest?.("[data-next-best-action-time]") as HTMLElement | null;
      if (!target) return;
      setSelectedTime(target.getAttribute("data-next-best-action-time") || "any");
      void refresh(getSelectedMinutes());
    });
    documentRef.addEventListener("click", handleAction);
    windowRef.addEventListener("tasklaunch:app-page-changed", handlePageChange);
    windowRef.addEventListener("tasklaunch:schedule-repair-applied", () => { if (["dashboard", "executive"].includes(options.getCurrentAppPage())) void refresh(getSelectedMinutes()); });
    windowRef.addEventListener("tasklaunch:schedule-repair-undone", () => { if (["dashboard", "executive"].includes(options.getCurrentAppPage())) void refresh(getSelectedMinutes()); });
    windowRef.addEventListener("tasklaunch:recovery-applied", () => { if (["dashboard", "executive"].includes(options.getCurrentAppPage())) void refresh(getSelectedMinutes()); });
    windowRef.addEventListener("tasklaunch:recovery-undone", () => { if (["dashboard", "executive"].includes(options.getCurrentAppPage())) void refresh(getSelectedMinutes()); });
    windowRef.addEventListener(TASK_COMPLETION_CHANGED_EVENT, () => {
      if (["dashboard", "executive"].includes(options.getCurrentAppPage())) void refresh(getSelectedMinutes());
    });
    const retry = getElement(documentRef, "dashboardNextBestActionRetry");
    retry?.addEventListener("click", () => {
      if (lockIfNeeded()) {
        options.showUpgradePrompt?.("Next Best Action", "plus");
        return;
      }
      void refresh(getSelectedMinutes());
    });
    if (["dashboard", "executive"].includes(options.getCurrentAppPage())) void refresh(getSelectedMinutes());
  }

  function destroy() {
    abortController?.abort();
    requestSequence += 1;
  }

  return { register, refresh, destroy };
}
