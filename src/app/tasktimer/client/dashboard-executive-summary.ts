import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getApiUrl } from "../lib/apiClient";
import { dispatchTaskClarificationStartTaskEvent } from "./task-clarification-events";
import { loadExecutiveData, type ExecutiveDataSnapshot } from "./executive-data";
import { TASK_COMPLETION_CHANGED_EVENT } from "./task-completion-events";

type Options = {
  documentRef?: Document;
  windowRef?: Window;
  getCurrentAppPage: () => string;
  canUseExecutiveFunction?: () => boolean;
  showUpgradePrompt?: (featureName: string, plan?: "plus") => void;
  getIdToken?: () => Promise<string | null>;
};

function getElement(documentRef: Document, id: string) {
  return documentRef.getElementById(id);
}

function setHidden(element: HTMLElement | null, hidden: boolean) {
  if (!element) return;
  element.hidden = hidden;
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
}

function formatRange(min: number, max: number) {
  return `${min}-${max} min remaining`;
}

function formatPlanHealthLabel(planHealth: string) {
  return planHealth
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function setPlainStatus(status: HTMLElement | null, message: string) {
  if (!status) return;
  status.textContent = message;
  status.removeAttribute("data-plan-health");
}

function setPlanHealthStatus(status: HTMLElement | null, planHealth: string) {
  if (!status) return;
  const normalizedPlanHealth = planHealth.trim();
  if (!normalizedPlanHealth || normalizedPlanHealth === "INSUFFICIENT_DATA") {
    setPlainStatus(status, normalizedPlanHealth ? formatPlanHealthLabel(normalizedPlanHealth) : "Plan health is unavailable.");
    return;
  }
  status.textContent = formatPlanHealthLabel(normalizedPlanHealth);
  status.setAttribute("data-plan-health", normalizedPlanHealth);
}

export function renderDashboardExecutiveSummary(documentRef: Document, snapshot: ExecutiveDataSnapshot) {
  const card = getElement(documentRef, "dashboardExecutiveSummary");
  if (!card) return;
  const content = getElement(documentRef, "dashboardExecutiveSummaryContent");
  const fallback = getElement(documentRef, "dashboardExecutiveSummaryFallback");
  const status = getElement(documentRef, "dashboardExecutiveSummaryStatus");
  const brief = snapshot.brief.status === "ready" ? snapshot.brief.value : null;
  const capacity = snapshot.capacity.status === "ready" ? snapshot.capacity.value : null;
  const nba = snapshot.nba.status === "ready" ? snapshot.nba.value : null;
  const hasPlan = Boolean(brief || capacity || nba);
  card.setAttribute("data-executive-summary-state", hasPlan ? "ready" : "fallback");
  setHidden(content, !hasPlan);
  setHidden(fallback, hasPlan);
  if (brief) setPlanHealthStatus(status, brief.plan.planHealth);
  else setPlainStatus(status, hasPlan ? "Today's executive summary is ready." : "Executive data is unavailable right now.");
  const health = getElement(documentRef, "dashboardExecutiveSummaryPlanHealth");
  if (health) health.textContent = brief ? brief.summary : "Plan health is unavailable.";
  const range = getElement(documentRef, "dashboardExecutiveSummaryCapacity");
  if (range) range.textContent = capacity ? formatRange(capacity.remainingRange.min, capacity.remainingRange.max) : "Capacity unavailable";
  const workload = getElement(documentRef, "dashboardExecutiveSummaryWorkload");
  if (workload) workload.textContent = brief ? `${brief.plan.remainingMinutes}m work remaining` : "Plan workload unavailable";
  const next = getElement(documentRef, "dashboardExecutiveSummaryNext");
  setHidden(next, !nba);
  const title = getElement(documentRef, "dashboardExecutiveSummaryNextTitle");
  if (title) title.textContent = nba?.title || "";
  const firstAction = getElement(documentRef, "dashboardExecutiveSummaryNextFirstAction");
  if (firstAction) firstAction.textContent = nba ? `${nba.estimatedMinutes} min` : "";
  const start = getElement(documentRef, "dashboardExecutiveSummaryStart") as HTMLButtonElement | null;
  if (start) {
    start.disabled = !nba;
    start.hidden = !nba;
    start.textContent = "Start now";
    if (nba) {
      start.dataset.taskId = nba.taskId;
      start.dataset.recommendationId = nba.recommendationId;
    }
  }
}

export function createDashboardExecutiveSummary(options: Options) {
  const documentRef = options.documentRef ?? document;
  const windowRef = options.windowRef ?? window;
  const card = getElement(documentRef, "dashboardExecutiveSummary");
  let requestSequence = 0;

  async function getIdToken() {
    return options.getIdToken ? options.getIdToken() : getFirebaseAuthClient()?.currentUser?.getIdToken() ?? null;
  }

  async function refresh() {
    if (!card || options.getCurrentAppPage() !== "dashboard") return;
    if (options.canUseExecutiveFunction?.() === false) {
      const status = getElement(documentRef, "dashboardExecutiveSummaryStatus");
      setPlainStatus(status, "Upgrade to PLUS to use Executive Function features.");
      card.setAttribute("data-executive-summary-state", "locked");
      return;
    }
    const sequence = ++requestSequence;
    const status = getElement(documentRef, "dashboardExecutiveSummaryStatus");
    setPlainStatus(status, "Loading today's plan...");
    try {
      const snapshot = await loadExecutiveData({
        getIdToken,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      if (sequence !== requestSequence) return;
      renderDashboardExecutiveSummary(documentRef, snapshot);
    } catch {
      if (sequence !== requestSequence) return;
      renderDashboardExecutiveSummary(documentRef, { brief: { status: "error", message: "" }, capacity: { status: "error", message: "" }, nba: { status: "error", message: "" }, repair: { status: "error", message: "" }, recovery: { status: "error", message: "" } });
    }
  }

  async function start() {
    const button = getElement(documentRef, "dashboardExecutiveSummaryStart") as HTMLButtonElement | null;
    const recommendationId = button?.dataset.recommendationId;
    const taskId = button?.dataset.taskId;
    if (!recommendationId || !taskId) return;
    if (options.canUseExecutiveFunction?.() === false) {
      options.showUpgradePrompt?.("Next Best Action", "plus");
      return;
    }
    button.disabled = true;
    try {
      const token = await getIdToken();
      if (!token) throw new Error("missing-session");
      const response = await fetch(getApiUrl(`/api/recommendations/next-best-action/${encodeURIComponent(recommendationId)}/start`), { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": token }, body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }) });
      if (!response.ok) throw new Error("recommendation-stale");
      dispatchTaskClarificationStartTaskEvent({ taskId });
      button.textContent = "In Progress";
      button.disabled = true;
      button.hidden = false;
      const status = getElement(documentRef, "dashboardExecutiveSummaryStatus");
      setPlainStatus(status, "Task in progress.");
    } catch {
      const status = getElement(documentRef, "dashboardExecutiveSummaryStatus");
      setPlainStatus(status, "That recommendation is no longer available. Refresh the dashboard to choose again.");
      button.disabled = false;
    }
  }

  function register() {
    if (!card) return;
    documentRef.addEventListener("click", (event) => {
      if ((event.target as HTMLElement | null)?.closest?.("#dashboardExecutiveSummaryStart")) void start();
    });
    windowRef.addEventListener("tasklaunch:app-page-changed", (event) => {
      if ((event as CustomEvent<{ page?: string }>).detail?.page === "dashboard") void refresh();
    });
    windowRef.addEventListener(TASK_COMPLETION_CHANGED_EVENT, () => {
      if (options.getCurrentAppPage() === "dashboard") void refresh();
    });
    if (options.getCurrentAppPage() === "dashboard") void refresh();
  }

  function destroy() {
    requestSequence += 1;
  }

  return { register, refresh, destroy };
}
