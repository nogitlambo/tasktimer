import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getApiUrl } from "../lib/apiClient";
import { dispatchTaskClarificationOpenEvent, dispatchTaskClarificationStartTaskEvent } from "./task-clarification-events";
import { trackDailyExecutiveBrief } from "@/app/dailyexecutivebrief/lib/dailyExecutiveBriefTelemetry";

type BriefPlan = {
  planHealth: string;
  deadlineRisk: string;
  plannedMinutes: number;
  completedMinutes: number;
  remainingMinutes: number;
  realisticWorkloadRange: { minMinutes: number; maxMinutes: number };
  adjustments: Array<{ adjustmentId: string; taskId: string; type: string; status: string; explanation: string }>;
};

export type DailyExecutiveBriefDashboard = {
  date: string;
  status: "READY" | "EMPTY" | "INSUFFICIENT_DATA";
  plan: BriefPlan;
  summary: string;
  nextBestAction: { recommendationId: string; taskId: string; title: string; firstAction: string | null; estimatedMinutes: number } | null;
  clarificationTaskIds: string[];
  expiresAt: string;
};

type BriefResponse = { kind: "brief"; brief: DailyExecutiveBriefDashboard } | { kind: "empty" | "insufficient" | "stale" | "invalid" | "error" };

function asString(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asMinutes(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1440 ? value : null;
}

function parseBriefResponse(value: unknown, nowMs = Date.now()): BriefResponse {
  const root = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const raw = root?.brief && typeof root.brief === "object" ? root.brief as Record<string, unknown> : null;
  const plan = raw?.plan && typeof raw.plan === "object" ? raw.plan as Record<string, unknown> : null;
  const range = plan?.realisticWorkloadRange && typeof plan.realisticWorkloadRange === "object" ? plan.realisticWorkloadRange as Record<string, unknown> : null;
  if (!root || root.ok !== true || !raw || !plan || !range) return { kind: "invalid" };
  const expiresAt = asString(raw.expiresAt, 80);
  const expiresAtMs = Date.parse(expiresAt);
  const status = raw.status === "READY" || raw.status === "EMPTY" || raw.status === "INSUFFICIENT_DATA" ? raw.status : null;
  const plannedMinutes = asMinutes(plan.plannedMinutes);
  const completedMinutes = asMinutes(plan.completedMinutes);
  const remainingMinutes = asMinutes(plan.remainingMinutes);
  const minMinutes = asMinutes(range.minMinutes);
  const maxMinutes = asMinutes(range.maxMinutes);
  if (!status || !expiresAt || !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs || plannedMinutes == null || completedMinutes == null || remainingMinutes == null || minMinutes == null || maxMinutes == null) return { kind: "stale" };
  const next = raw.nextBestAction && typeof raw.nextBestAction === "object" ? raw.nextBestAction as Record<string, unknown> : null;
  const recommendationId = next ? asString(next.recommendationId, 160) : "";
  const taskId = next ? asString(next.taskId, 160) : "";
  const title = next ? asString(next.title, 240) : "";
  const estimatedMinutes = next ? asMinutes(next.estimatedMinutes) : null;
  const nextBestAction = next && recommendationId && taskId && title && estimatedMinutes ? { recommendationId, taskId, title, firstAction: asString(next.firstAction, 500) || null, estimatedMinutes } : null;
  const adjustments = Array.isArray(plan.adjustments) ? plan.adjustments.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const adjustment = value as Record<string, unknown>;
    const taskId = asString(adjustment.taskId, 160);
    const type = asString(adjustment.type, 40);
    const adjustmentId = asString(adjustment.adjustmentId, 320);
    const status = asString(adjustment.status, 30);
    const explanation = asString(adjustment.explanation, 500);
    return adjustmentId && taskId && type && status && explanation ? [{ adjustmentId, taskId, type, status, explanation }] : [];
  }).slice(0, 3) : [];
  const clarificationTaskIds = Array.isArray(raw.clarificationTaskIds) ? raw.clarificationTaskIds.filter((value): value is string => !!asString(value, 160)).map((value) => asString(value, 160)).slice(0, 20) : [];
  return { kind: "brief", brief: { date: asString(raw.date, 10), status, plan: { planHealth: asString(plan.planHealth, 40), deadlineRisk: asString(plan.deadlineRisk, 40), plannedMinutes, completedMinutes, remainingMinutes, realisticWorkloadRange: { minMinutes, maxMinutes }, adjustments }, summary: asString(raw.summary, 1000), nextBestAction, clarificationTaskIds, expiresAt } };
}

function setHidden(element: HTMLElement | null, hidden: boolean) {
  if (!element) return;
  element.hidden = hidden;
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
}

function element(documentRef: Document, id: string) {
  return documentRef.getElementById(id) as HTMLElement | null;
}

type Options = { documentRef?: Document; windowRef?: Window; fetchImpl?: typeof fetch; getCurrentAppPage: () => string; getIdToken?: () => Promise<string | null> };

export function createDashboardDailyExecutiveBrief(options: Options) {
  const documentRef = options.documentRef ?? document;
  const windowRef = options.windowRef ?? window;
  const fetchImpl = options.fetchImpl ?? windowRef.fetch.bind(windowRef);
  const card = element(documentRef, "dashboardDailyExecutiveBriefCard");
  let requestSequence = 0;
  let abortController: AbortController | null = null;
  let expanded = true;
  let currentBrief: DailyExecutiveBriefDashboard | null = null;

  function setState(state: "loading" | "ready" | "empty" | "insufficient" | "stale" | "error", message: string) {
    card?.setAttribute("data-daily-executive-brief-state", state);
    const status = element(documentRef, "dashboardDailyExecutiveBriefStatus");
    if (status) status.textContent = message;
    const retry = element(documentRef, "dashboardDailyExecutiveBriefRetry") as HTMLButtonElement | null;
    if (retry) retry.hidden = !["error", "stale"].includes(state);
    const start = documentRef.querySelector<HTMLButtonElement>('[data-daily-executive-brief="start"]');
    if (start) start.disabled = state !== "ready";
    setHidden(element(documentRef, "dashboardDailyExecutiveBriefAction"), state !== "ready");
  }

  function render(brief: DailyExecutiveBriefDashboard) {
    currentBrief = brief;
    const health = element(documentRef, "dashboardDailyExecutiveBriefHealth");
    if (health) { health.textContent = brief.plan.planHealth.replaceAll("_", " "); health.setAttribute("data-plan-health", brief.plan.planHealth); }
    const summary = element(documentRef, "dashboardDailyExecutiveBriefSummary");
    if (summary) summary.textContent = brief.summary || "Your daily plan is ready.";
    const workload = element(documentRef, "dashboardDailyExecutiveBriefWorkload");
    if (workload) workload.textContent = `${brief.plan.remainingMinutes}m remaining`;
    const range = element(documentRef, "dashboardDailyExecutiveBriefRange");
    if (range) range.textContent = `${brief.plan.realisticWorkloadRange.minMinutes}-${brief.plan.realisticWorkloadRange.maxMinutes}m realistic`;
    const deadline = element(documentRef, "dashboardDailyExecutiveBriefDeadline");
    if (deadline) deadline.textContent = `Deadline risk: ${brief.plan.deadlineRisk.toLowerCase()}`;
    const action = element(documentRef, "dashboardDailyExecutiveBriefAction");
    if (brief.nextBestAction && action) {
      action.setAttribute("data-daily-executive-brief-task-id", brief.nextBestAction.taskId);
      action.setAttribute("data-daily-executive-brief-recommendation-id", brief.nextBestAction.recommendationId);
      const title = element(documentRef, "dashboardDailyExecutiveBriefActionTitle");
      if (title) title.textContent = brief.nextBestAction.title;
      const firstStep = element(documentRef, "dashboardDailyExecutiveBriefActionFirstStep");
      if (firstStep) firstStep.textContent = brief.nextBestAction.firstAction || "Start with the smallest visible step.";
      const clarify = documentRef.createElement("button");
      clarify.className = "btn btn-ghost";
      clarify.type = "button";
      clarify.textContent = "Clarify task";
      clarify.setAttribute("data-daily-executive-brief", "clarify");
      clarify.hidden = !brief.clarificationTaskIds.includes(brief.nextBestAction.taskId);
      action.appendChild(clarify);
      setHidden(action, false);
    } else setHidden(action, true);
    const adjustments = element(documentRef, "dashboardDailyExecutiveBriefAdjustments");
    if (adjustments) {
      adjustments.replaceChildren();
      const activeAdjustments = brief.plan.adjustments.filter((item) => item.status === "ACTIVE");
      if (!activeAdjustments.length) adjustments.textContent = "No adjustments suggested.";
      else {
        const heading = documentRef.createElement("span");
        heading.textContent = "Suggested adjustments:";
        adjustments.appendChild(heading);
        activeAdjustments.forEach((item) => {
          const row = documentRef.createElement("span");
          row.textContent = `${item.type.toLowerCase()} task ${item.taskId}: ${item.explanation}`;
          const dismiss = documentRef.createElement("button");
          dismiss.className = "btn btn-ghost";
          dismiss.type = "button";
          dismiss.textContent = "Dismiss";
          dismiss.setAttribute("data-daily-executive-brief-dismiss", item.adjustmentId);
          row.appendChild(dismiss);
          adjustments.appendChild(row);
        });
      }
      setHidden(adjustments, false);
    }
    setState(brief.status === "READY" ? "ready" : brief.status === "EMPTY" ? "empty" : "insufficient", brief.status === "EMPTY" ? "No active tasks to plan today." : brief.status === "INSUFFICIENT_DATA" ? "Add task estimates to build a realistic plan." : "Daily brief ready");
    void trackDailyExecutiveBrief(brief.status === "READY" ? "loaded" : brief.status === "EMPTY" ? "empty" : "insufficient_data", { planHealth: brief.plan.planHealth, deadlineRisk: brief.plan.deadlineRisk });
  }

  async function getIdToken() { return options.getIdToken ? options.getIdToken() : getFirebaseAuthClient()?.currentUser?.getIdToken() ?? null; }

  async function dismissAdjustment(target: HTMLElement) {
    const adjustmentId = asString(target.getAttribute("data-daily-executive-brief-dismiss"), 320);
    if (!adjustmentId || !currentBrief) return;
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const response = await fetchImpl(getApiUrl(`/api/daily-executive-brief/adjustments/${adjustmentId}/dismiss`), { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": idToken }, body: JSON.stringify({ date: currentBrief.date }) });
      if (!response.ok) throw new Error(asString((await response.json().catch(() => ({})) as Record<string, unknown>).error, 240) || "Could not dismiss that adjustment.");
      const button = target as HTMLButtonElement;
      button.disabled = true;
      button.textContent = "Dismissed";
      const row = button.parentElement;
      const item = currentBrief.plan.adjustments.find((candidate) => candidate.adjustmentId === adjustmentId);
      void trackDailyExecutiveBrief("adjustment_dismissed", { adjustmentType: item?.type });
      if (item) item.status = "DISMISSED";
      if (row) row.setAttribute("data-adjustment-status", "DISMISSED");
    } catch (error) {
      setState("error", error instanceof Error ? error.message : "Could not dismiss that adjustment.");
    }
  }

  async function startRecommendation() {
    const recommendation = currentBrief?.nextBestAction;
    if (!recommendation) return;
    setState("loading", "Revalidating the recommended task...");
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const response = await fetchImpl(getApiUrl(`/api/recommendations/next-best-action/${encodeURIComponent(recommendation.recommendationId)}/start`), { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": idToken }, body: "{}" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>).error, 240) || "This recommendation can no longer be started.");
      dispatchTaskClarificationStartTaskEvent({ taskId: recommendation.taskId });
      void trackDailyExecutiveBrief("started", { planHealth: currentBrief?.plan.planHealth });
      setState("ready", "Task started from the daily brief.");
    } catch (error) {
      setState("stale", error instanceof Error ? error.message : "Could not start the recommended task.");
    }
  }

  function clarifyRecommendation() {
    const recommendation = currentBrief?.nextBestAction;
    if (!recommendation) return;
    dispatchTaskClarificationOpenEvent({ taskId: recommendation.taskId, title: recommendation.title });
  }

  function getSelectedMinutes() {
    const value = (element(documentRef, "dashboardDailyExecutiveBriefTimeSelect") as HTMLSelectElement | null)?.value;
    return value && value !== "any" ? Number(value) : null;
  }

  async function refresh(forceRefresh = false, selectedMinutes = getSelectedMinutes()) {
    if (options.getCurrentAppPage() !== "dashboard" || !card) return;
    abortController?.abort(); abortController = new AbortController(); const sequence = ++requestSequence;
    setState("loading", "Loading your daily brief...");
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const body: Record<string, unknown> = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, forceRefresh };
      if (selectedMinutes != null) body.availableMinutes = selectedMinutes;
      const response = await fetchImpl(getApiUrl("/api/daily-executive-brief"), { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": idToken }, body: JSON.stringify(body), signal: abortController.signal });
      const payload = await response.json().catch(() => ({}));
      if (sequence !== requestSequence) return;
      if (!response.ok) throw new Error(asString((payload as Record<string, unknown>)?.error, 240) || "Could not load the daily brief.");
      const parsed = parseBriefResponse(payload);
      if (parsed.kind === "brief") render(parsed.brief); else setState(parsed.kind === "stale" ? "stale" : "error", parsed.kind === "stale" ? "This brief is out of date. Refresh to try again." : "Could not read the daily brief.");
    } catch (error) {
      if (abortController.signal.aborted || sequence !== requestSequence) return;
      setState("error", error instanceof Error ? error.message : "Could not load the daily brief.");
    }
  }

  function toggle() {
    expanded = !expanded;
    const content = element(documentRef, "dashboardDailyExecutiveBriefContent");
    setHidden(content, !expanded);
    const toggleButton = element(documentRef, "dashboardDailyExecutiveBriefToggle");
    toggleButton?.setAttribute("aria-expanded", String(expanded));
    if (toggleButton) toggleButton.textContent = expanded ? "Collapse" : "Expand";
  }

  function register() {
    if (!card) return;
    documentRef.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-daily-executive-brief]");
      const action = target?.getAttribute("data-daily-executive-brief");
      const dismissTarget = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-daily-executive-brief-dismiss]");
      if (dismissTarget) { void dismissAdjustment(dismissTarget); return; }
      if (action === "start") { void startRecommendation(); return; }
      if (action === "clarify") { clarifyRecommendation(); return; }
      if (action === "toggle") toggle();
      if (action === "refresh") void refresh(true);
    });
    documentRef.addEventListener("change", (event) => {
      if ((event.target as HTMLElement | null)?.id === "dashboardDailyExecutiveBriefTimeSelect") void refresh(true);
    });
    windowRef.addEventListener("tasklaunch:app-page-changed", (event) => { if ((event as CustomEvent<{ page?: string }>).detail?.page === "dashboard") void refresh(); });
    windowRef.addEventListener("tasklaunch:schedule-repair-applied", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(true); });
    windowRef.addEventListener("tasklaunch:schedule-repair-undone", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(true); });
    windowRef.addEventListener("tasklaunch:recovery-applied", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(true); });
    windowRef.addEventListener("tasklaunch:recovery-undone", () => { if (options.getCurrentAppPage() === "dashboard") void refresh(true); });
    if (options.getCurrentAppPage() === "dashboard") void refresh();
  }
  function destroy() { abortController?.abort(); requestSequence += 1; }
  return { register, refresh, destroy, parseBriefResponse };
}

export { parseBriefResponse };
