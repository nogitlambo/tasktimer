import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getApiUrl } from "../lib/apiClient";
import { dispatchTaskClarificationStartTaskEvent } from "./task-clarification-events";

export type NextBestActionDashboardRecommendation = {
  recommendationId: string;
  type: "NEXT_BEST_ACTION";
  taskId: string;
  title: string;
  firstAction?: string;
  estimatedMinutes: number;
  durationSource?: string;
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

function asString(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asPositiveMinutes(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1440 ? Math.round(value) : null;
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

function setHidden(element: HTMLElement | null, hidden: boolean) {
  if (!element) return;
  element.hidden = hidden;
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
}

function getElement(documentRef: Document, id: string) {
  return documentRef.getElementById(id) as HTMLElement | null;
}

type CreateDashboardNextBestActionOptions = {
  documentRef?: Document;
  windowRef?: Window;
  fetchImpl?: typeof fetch;
  getCurrentAppPage: () => string;
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

  function setStatus(message: string, state: "loading" | "empty" | "error" | "stale" | "ready") {
    const status = getElement(documentRef, "dashboardNextBestActionStatus");
    if (status) status.textContent = message;
    card?.setAttribute("data-next-best-action-state", state);
    setHidden(getElement(documentRef, "dashboardNextBestActionContent"), state !== "ready");
    setHidden(getElement(documentRef, "dashboardNextBestActionEmpty"), state !== "empty");
    setHidden(getElement(documentRef, "dashboardNextBestActionError"), state !== "error" && state !== "stale");
    const retry = getElement(documentRef, "dashboardNextBestActionRetry") as HTMLButtonElement | null;
    if (retry) retry.hidden = state !== "error" && state !== "stale";
    const actionButtons = documentRef.querySelectorAll<HTMLButtonElement>("[data-next-best-action-action]");
    actionButtons.forEach((button) => {
      button.disabled = state !== "ready";
    });
  }

  function renderRecommendation(recommendation: NextBestActionDashboardRecommendation) {
    shownTaskIds.add(recommendation.taskId);
    const title = getElement(documentRef, "dashboardNextBestActionTitle");
    const firstAction = getElement(documentRef, "dashboardNextBestActionFirstAction");
    const duration = getElement(documentRef, "dashboardNextBestActionDuration");
    const confidence = getElement(documentRef, "dashboardNextBestActionConfidence");
    const explanation = getElement(documentRef, "dashboardNextBestActionExplanation");
    const why = getElement(documentRef, "dashboardNextBestActionWhy");
    if (title) title.textContent = recommendation.title;
    if (firstAction) {
      firstAction.textContent = recommendation.firstAction || "Start with the smallest visible step.";
      firstAction.hidden = !recommendation.firstAction;
    }
    if (duration) duration.textContent = formatNextBestActionDuration(recommendation);
    if (confidence) confidence.textContent = recommendation.confidence ? `${recommendation.confidence} confidence` : "Confidence available";
    if (explanation) explanation.textContent = recommendation.explanation || "This is the most useful next step for right now.";
    if (why) {
      why.textContent = recommendation.reasonCodes?.length
        ? `Signals: ${recommendation.reasonCodes.map((reason) => durationSourceLabel(reason)).join(", ")}.`
        : "The ranking service selected this task from your current eligible work.";
    }
    const actionButtons = documentRef.querySelectorAll<HTMLButtonElement>("[data-next-best-action-action]");
    actionButtons.forEach((button) => {
      button.disabled = false;
      button.setAttribute("data-next-best-action-task-id", recommendation.taskId);
      button.setAttribute("data-next-best-action-recommendation-id", recommendation.recommendationId);
    });
    setStatus("Recommendation ready", "ready");
  }

  async function getIdToken() {
    if (options.getIdToken) return options.getIdToken();
    return getFirebaseAuthClient()?.currentUser?.getIdToken() ?? null;
  }

  async function refresh(availableMinutes?: number | null) {
    if (options.getCurrentAppPage() !== "dashboard" || !card) return;
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
        body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(asString(asRecord(payload)?.error, 240) || "This recommendation can no longer be started.");
        (error as Error & { code?: string }).code = asString(asRecord(payload)?.code, 120);
        throw error;
      }
      dispatchTaskClarificationStartTaskEvent({ taskId });
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
    if (action === "why") {
      const why = getElement(documentRef, "dashboardNextBestActionWhy");
      const expanded = target.getAttribute("aria-expanded") === "true";
      target.setAttribute("aria-expanded", expanded ? "false" : "true");
      setHidden(why, expanded);
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
    if (page === "dashboard") void refresh(getSelectedMinutes());
  }

  function getSelectedMinutes() {
    const value = (getElement(documentRef, "dashboardNextBestActionTimeSelect") as HTMLSelectElement | null)?.value;
    return value && value !== "any" ? Number(value) : null;
  }

  function register() {
    if (!card) return;
    documentRef.addEventListener("change", (event) => {
      const target = event.target as HTMLSelectElement | null;
      if (target?.id === "dashboardNextBestActionTimeSelect") void refresh(getSelectedMinutes());
    });
    documentRef.addEventListener("click", handleAction);
    windowRef.addEventListener("tasklaunch:app-page-changed", handlePageChange);
    windowRef.addEventListener("tasklaunch:schedule-repair-applied", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(getSelectedMinutes()); });
    windowRef.addEventListener("tasklaunch:schedule-repair-undone", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(getSelectedMinutes()); });
    windowRef.addEventListener("tasklaunch:recovery-applied", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(getSelectedMinutes()); });
    windowRef.addEventListener("tasklaunch:recovery-undone", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(getSelectedMinutes()); });
    const retry = getElement(documentRef, "dashboardNextBestActionRetry");
    retry?.addEventListener("click", () => void refresh(getSelectedMinutes()));
    if (options.getCurrentAppPage() === "dashboard") void refresh(getSelectedMinutes());
  }

  function destroy() {
    abortController?.abort();
    requestSequence += 1;
  }

  return { register, refresh, destroy };
}
