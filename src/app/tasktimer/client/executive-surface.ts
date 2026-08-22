import { loadExecutiveData } from "./executive-data";
import type { ExecutiveRequestCoordinator } from "./executive-request-coordinator";
import { TASKTIMER_PLAN_CHANGED_EVENT } from "../lib/entitlements";
import { EXECUTIVE_FUNCTION_DISABLED_MESSAGE } from "../lib/executiveFunctionAvailability";
import { isNativeOrFileRuntime } from "@/lib/firebaseClient";

type Options = {
  documentRef?: Document;
  windowRef?: Window;
  getCurrentAppPage: () => string;
  canUseExecutiveFunction?: () => boolean;
  isTouchRuntime?: () => boolean;
  getExecutiveFunctionUnavailableMessage?: () => string;
  getIdToken?: () => Promise<string | null>;
  requestCoordinator?: ExecutiveRequestCoordinator;
};

function element(documentRef: Document, id: string) {
  return documentRef.getElementById(id);
}

function setMetricText(elementRef: HTMLElement | null, value: string) {
  if (!elementRef) return;
  elementRef.textContent = value;
  if (value === "Loading")
    elementRef.setAttribute("data-executive-metric-loading", "true");
  else elementRef.removeAttribute("data-executive-metric-loading");
}

function formatPlanHealthLabel(planHealth: string) {
  return planHealth
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function formatCapacityRange(min: number, max: number) {
  return min === max ? `~${min} min` : `${min}-${max} min`;
}

function setExecutivePlanHealth(
  elementRef: HTMLElement | null,
  planHealth: string | null,
) {
  if (!elementRef) return;
  const normalizedPlanHealth = String(planHealth || "").trim();
  if (!normalizedPlanHealth) {
    setMetricText(elementRef, "Unavailable");
    elementRef.removeAttribute("data-plan-health");
    return;
  }
  setMetricText(elementRef, formatPlanHealthLabel(normalizedPlanHealth));
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
  let helperDismissTimer: number | null = null;
  const metricHelperCards = Array.from(
    documentRef.querySelectorAll<HTMLElement>(
      "[data-executive-metric-helper-card]",
    ),
  );
  const usesTouchMetricHelpers = () =>
    options.isTouchRuntime?.() ??
    (isNativeOrFileRuntime() ||
      windowRef.matchMedia?.("(hover: none), (pointer: coarse)").matches ===
        true);

  function clearHelperDismissTimer() {
    if (helperDismissTimer == null) return;
    windowRef.clearTimeout(helperDismissTimer);
    helperDismissTimer = null;
  }

  function setActiveMetricHelper(
    activeCard: HTMLElement | null,
    opts?: { scheduleDismiss?: boolean },
  ) {
    clearHelperDismissTimer();
    metricHelperCards.forEach((card) => {
      const isActive = card === activeCard;
      card.classList.toggle("isHelperVisible", isActive);
      card.setAttribute("aria-expanded", String(isActive));
      card
        .querySelector<HTMLElement>(".executiveMetricHelper")
        ?.setAttribute("aria-hidden", String(!isActive));
    });
    if (activeCard && opts?.scheduleDismiss) {
      helperDismissTimer = windowRef.setTimeout(
        () => setActiveMetricHelper(null),
        10_000,
      );
    }
  }

  const metricCardListeners = metricHelperCards.map((card) => {
    const handlePointerEnter = () => {
      if (!usesTouchMetricHelpers()) setActiveMetricHelper(card);
    };
    const handlePointerLeave = () => {
      if (!usesTouchMetricHelpers()) setActiveMetricHelper(null);
    };
    const handleFocus = () => {
      if (!usesTouchMetricHelpers()) setActiveMetricHelper(card);
    };
    const handleBlur = (event: FocusEvent) => {
      if (
        !usesTouchMetricHelpers() &&
        !card.contains(event.relatedTarget as Node | null)
      )
        setActiveMetricHelper(null);
    };
    const handleClick = () => {
      if (!usesTouchMetricHelpers()) return;
      setActiveMetricHelper(
        card.classList.contains("isHelperVisible") ? null : card,
        { scheduleDismiss: true },
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setActiveMetricHelper(
        card.classList.contains("isHelperVisible") ? null : card,
        { scheduleDismiss: usesTouchMetricHelpers() },
      );
    };
    card.addEventListener("pointerenter", handlePointerEnter);
    card.addEventListener("pointerleave", handlePointerLeave);
    card.addEventListener("focus", handleFocus);
    card.addEventListener("blur", handleBlur);
    card.addEventListener("click", handleClick);
    card.addEventListener("keydown", handleKeyDown);
    return {
      card,
      handlePointerEnter,
      handlePointerLeave,
      handleFocus,
      handleBlur,
      handleClick,
      handleKeyDown,
    };
  });

  const handleDocumentPointerDown = (event: Event) => {
    if (
      !usesTouchMetricHelpers() ||
      metricHelperCards.some((card) =>
        card.contains(event.target as Node | null),
      )
    )
      return;
    setActiveMetricHelper(null);
  };
  const handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") setActiveMetricHelper(null);
  };
  const handleAppPageChanged = (event: Event) => {
    if ((event as CustomEvent<{ page?: string }>).detail?.page === "executive")
      void refresh();
  };
  const handlePlanChanged = () => {
    if (options.getCurrentAppPage() === "executive") void refresh();
  };

  function render(snapshot: Awaited<ReturnType<typeof loadExecutiveData>>) {
    page?.classList.remove("isExecutiveFunctionDisabled");
    const brief =
      snapshot.brief.status === "ready" ? snapshot.brief.value : null;
    const capacity =
      snapshot.capacity.status === "ready" ? snapshot.capacity.value : null;
    const planHealth = element(documentRef, "executivePlanHealth");
    setExecutivePlanHealth(planHealth, brief?.plan.planHealth || null);
    const capacityRange = element(documentRef, "executiveCapacityRange");
    setMetricText(
      capacityRange,
      capacity
        ? formatCapacityRange(
            capacity.remainingRange.min,
            capacity.remainingRange.max,
          )
        : "Unavailable",
    );
    const work = element(documentRef, "executiveWorkRemaining");
    setMetricText(
      work,
      brief ? `${brief.plan.remainingMinutes} min` : "Unavailable",
    );
    const date = element(documentRef, "executiveTodayDate");
    if (date)
      date.textContent = brief?.date || capacity?.localDate || "Current plan";
  }

  async function refresh() {
    if (!page || options.getCurrentAppPage() !== "executive") return;
    const current = ++sequence;
    if (options.canUseExecutiveFunction?.() === false) {
      const unavailableMessage =
        options.getExecutiveFunctionUnavailableMessage?.() || "PLUS feature";
      page.classList.toggle(
        "isExecutiveFunctionDisabled",
        isDisabledBySettings(unavailableMessage),
      );
      const planHealth = element(documentRef, "executivePlanHealth");
      if (planHealth) {
        setMetricText(
          planHealth,
          isDisabledBySettings(unavailableMessage)
            ? unavailableMessage
            : "Loading",
        );
        planHealth.removeAttribute("data-plan-health");
      }
      return;
    }
    page.classList.remove("isExecutiveFunctionDisabled");
    try {
      const snapshot = await loadExecutiveData({
        getIdToken: options.getIdToken || (async () => null),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        requestCoordinator: options.requestCoordinator,
      });
      if (current === sequence) render(snapshot);
    } catch {
      if (current !== sequence) return;
      render({
        brief: { status: "error", message: "" },
        capacity: { status: "error", message: "" },
        nba: { status: "error", message: "" },
        repair: { status: "error", message: "" },
        recovery: { status: "error", message: "" },
      });
    }
  }

  function register() {
    if (!page) return;
    windowRef.addEventListener(
      "tasklaunch:app-page-changed",
      handleAppPageChanged,
    );
    windowRef.addEventListener(TASKTIMER_PLAN_CHANGED_EVENT, handlePlanChanged);
    documentRef.addEventListener(
      "pointerdown",
      handleDocumentPointerDown,
      true,
    );
    documentRef.addEventListener("keydown", handleDocumentKeyDown);
    if (options.getCurrentAppPage() === "executive") void refresh();
  }

  function destroy() {
    sequence += 1;
    setActiveMetricHelper(null);
    windowRef.removeEventListener(
      "tasklaunch:app-page-changed",
      handleAppPageChanged,
    );
    windowRef.removeEventListener(
      TASKTIMER_PLAN_CHANGED_EVENT,
      handlePlanChanged,
    );
    documentRef.removeEventListener(
      "pointerdown",
      handleDocumentPointerDown,
      true,
    );
    documentRef.removeEventListener("keydown", handleDocumentKeyDown);
    metricCardListeners.forEach(
      ({
        card,
        handlePointerEnter,
        handlePointerLeave,
        handleFocus,
        handleBlur,
        handleClick,
        handleKeyDown,
      }) => {
        card.removeEventListener("pointerenter", handlePointerEnter);
        card.removeEventListener("pointerleave", handlePointerLeave);
        card.removeEventListener("focus", handleFocus);
        card.removeEventListener("blur", handleBlur);
        card.removeEventListener("click", handleClick);
        card.removeEventListener("keydown", handleKeyDown);
      },
    );
  }

  return { register, refresh, destroy };
}
