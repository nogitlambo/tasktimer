import { loadExecutiveData } from "./executive-data";
import { EXECUTIVE_FUNCTION_DISABLED_MESSAGE } from "../lib/executiveFunctionAvailability";

type Options = {
  documentRef?: Document;
  windowRef?: Window;
  getCurrentAppPage: () => string;
  canUseExecutiveFunction?: () => boolean;
  getExecutiveFunctionUnavailableMessage?: () => string;
  getIdToken?: () => Promise<string | null>;
};

function element(documentRef: Document, id: string) {
  return documentRef.getElementById(id);
}

function formatPlanHealthLabel(planHealth: string) {
  return planHealth
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function setExecutivePlanHealth(elementRef: HTMLElement | null, planHealth: string | null) {
  if (!elementRef) return;
  const normalizedPlanHealth = String(planHealth || "").trim();
  if (!normalizedPlanHealth) {
    elementRef.textContent = "Unavailable";
    elementRef.removeAttribute("data-plan-health");
    return;
  }
  elementRef.textContent = formatPlanHealthLabel(normalizedPlanHealth);
  elementRef.setAttribute("data-plan-health", normalizedPlanHealth);
}

function isDisabledBySettings(message: string | null | undefined) {
  return String(message || "") === EXECUTIVE_FUNCTION_DISABLED_MESSAGE;
}

export function createExecutiveSurface(options: Options) {
  const documentRef = options.documentRef ?? document;
  const windowRef = options.windowRef ?? window;
  const page = element(documentRef, "appPageExecutive");
  let sequence = 0;

  function render(snapshot: Awaited<ReturnType<typeof loadExecutiveData>>) {
    page?.classList.remove("isExecutiveFunctionDisabled");
    const brief = snapshot.brief.status === "ready" ? snapshot.brief.value : null;
    const capacity = snapshot.capacity.status === "ready" ? snapshot.capacity.value : null;
    const planHealth = element(documentRef, "executivePlanHealth");
    setExecutivePlanHealth(planHealth, brief?.plan.planHealth || null);
    const capacityRange = element(documentRef, "executiveCapacityRange");
    if (capacityRange) capacityRange.textContent = capacity ? `${capacity.remainingRange.min}-${capacity.remainingRange.max} min` : "Unavailable";
    const work = element(documentRef, "executiveWorkRemaining");
    if (work) work.textContent = brief ? `${brief.plan.remainingMinutes} min` : "Unavailable";
    const date = element(documentRef, "executiveTodayDate");
    if (date) date.textContent = brief?.date || capacity?.localDate || "Current plan";
  }

  async function refresh() {
    if (!page || options.getCurrentAppPage() !== "executive") return;
    const current = ++sequence;
    if (options.canUseExecutiveFunction?.() === false) {
      const unavailableMessage = options.getExecutiveFunctionUnavailableMessage?.() || "PLUS feature";
      page.classList.toggle("isExecutiveFunctionDisabled", isDisabledBySettings(unavailableMessage));
      const planHealth = element(documentRef, "executivePlanHealth");
      if (planHealth) {
        planHealth.textContent = unavailableMessage;
        planHealth.removeAttribute("data-plan-health");
      }
      return;
    }
    page.classList.remove("isExecutiveFunctionDisabled");
    try {
      const snapshot = await loadExecutiveData({ getIdToken: options.getIdToken || (async () => null), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });
      if (current === sequence) render(snapshot);
    } catch {
      if (current !== sequence) return;
      render({ brief: { status: "error", message: "" }, capacity: { status: "error", message: "" }, nba: { status: "error", message: "" }, repair: { status: "error", message: "" }, recovery: { status: "error", message: "" } });
    }
  }

  function register() {
    if (!page) return;
    windowRef.addEventListener("tasklaunch:app-page-changed", (event) => {
      if ((event as CustomEvent<{ page?: string }>).detail?.page === "executive") void refresh();
    });
    if (options.getCurrentAppPage() === "executive") void refresh();
  }

  function destroy() {
    sequence += 1;
  }

  return { register, refresh, destroy };
}
