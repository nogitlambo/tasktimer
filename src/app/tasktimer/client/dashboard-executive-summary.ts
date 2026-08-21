import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { loadExecutiveData, type ExecutiveDataSnapshot } from "./executive-data";
import type { ExecutiveRequestCoordinator } from "./executive-request-coordinator";
import { TASK_COMPLETION_CHANGED_EVENT } from "./task-completion-events";

type Options = {
  documentRef?: Document;
  windowRef?: Window;
  getCurrentAppPage: () => string;
  canUseExecutiveFunction?: () => boolean;
  getExecutiveFunctionUnavailableMessage?: () => string;
  getIdToken?: () => Promise<string | null>;
  requestCoordinator?: ExecutiveRequestCoordinator;
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
  const hasPlan = Boolean(brief || capacity);
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
      setPlainStatus(status, options.getExecutiveFunctionUnavailableMessage?.() || "Upgrade to PLUS to use Executive Function features.");
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
        requestCoordinator: options.requestCoordinator,
      });
      if (sequence !== requestSequence) return;
      renderDashboardExecutiveSummary(documentRef, snapshot);
    } catch {
      if (sequence !== requestSequence) return;
      renderDashboardExecutiveSummary(documentRef, { brief: { status: "error", message: "" }, capacity: { status: "error", message: "" }, nba: { status: "error", message: "" }, repair: { status: "error", message: "" }, recovery: { status: "error", message: "" } });
    }
  }

  function register() {
    if (!card) return;
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
