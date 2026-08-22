import { beforeEach, describe, expect, it, vi } from "vitest";

import { TASKTIMER_PLAN_CHANGED_EVENT } from "../lib/entitlements";
import { createExecutiveSurface } from "./executive-surface";
import { loadExecutiveData } from "./executive-data";

vi.mock("./executive-data", () => ({
  loadExecutiveData: vi.fn(),
}));

class TestElement {
  id = "";
  textContent = "";
  helper: TestElement | null = null;
  private attrs = new Map<string, string>();
  private classes = new Set<string>();
  private listeners = new Map<string, EventListener[]>();
  classList = {
    add: (...tokens: string[]) => tokens.forEach((token) => this.classes.add(token)),
    remove: (...tokens: string[]) => tokens.forEach((token) => this.classes.delete(token)),
    contains: (token: string) => this.classes.has(token),
    toggle: (token: string, force?: boolean) => {
      const shouldAdd = force ?? !this.classes.has(token);
      if (shouldAdd) this.classes.add(token);
      else this.classes.delete(token);
      return shouldAdd;
    },
  };

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attrs.delete(name);
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((candidate) => candidate !== listener));
  }

  dispatch(type: string, event: Event = new Event(type)) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  contains(node: Node | null) {
    return node === (this as unknown as Node) || node === (this.helper as unknown as Node);
  }

  querySelector<T extends Element>(selector: string) {
    return (selector === ".executiveMetricHelper" ? this.helper : null) as T | null;
  }
}

function makeDocument() {
  const elements = new Map<string, TestElement>();
  for (const id of ["appPageExecutive", "executivePlanHealth", "executiveCapacityRange", "executiveWorkRemaining", "executiveTodayDate"]) {
    const element = new TestElement();
    element.id = id;
    elements.set(id, element);
  }
  const helperCards = ["plan-health", "remaining-capacity", "work-remaining"].map((key) => {
    const card = new TestElement();
    card.id = `executiveMetricCard-${key}`;
    card.helper = new TestElement();
    return card;
  });
  const documentListeners = new Map<string, EventListener[]>();
  return {
    getElementById: (id: string) => elements.get(id) ?? null,
    querySelectorAll: (selector: string) => selector === "[data-executive-metric-helper-card]" ? helperCards : [],
    addEventListener: (type: string, listener: EventListener) => documentListeners.set(type, [...(documentListeners.get(type) || []), listener]),
    removeEventListener: (type: string, listener: EventListener) => documentListeners.set(type, (documentListeners.get(type) || []).filter((candidate) => candidate !== listener)),
    dispatch: (type: string, event: Event = new Event(type)) => (documentListeners.get(type) || []).forEach((listener) => listener(event)),
    elements,
    helperCards,
  } as unknown as Document & { elements: Map<string, TestElement>; helperCards: TestElement[]; dispatch: (type: string, event?: Event) => void };
}

function makeWindow() {
  const listeners = new Map<string, EventListener[]>();
  return {
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, [...(listeners.get(type) || []), listener]),
    removeEventListener: (type: string, listener: EventListener) => listeners.set(type, (listeners.get(type) || []).filter((candidate) => candidate !== listener)),
    setTimeout,
    clearTimeout,
    matchMedia: () => ({ matches: false }),
  } as unknown as Window;
}

describe("createExecutiveSurface", () => {
  beforeEach(() => {
    vi.mocked(loadExecutiveData).mockReset();
  });

  it("marks the Executive plan health text with the loaded plan health state", async () => {
    const documentRef = makeDocument();
    const listeners = new Map<string, EventListener>();
    const windowRef = {
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    } as unknown as Window;

    vi.mocked(loadExecutiveData).mockResolvedValue({
      brief: {
        status: "ready",
        value: {
          date: "2026-08-10",
          status: "READY",
          plan: {
            planHealth: "SLIGHTLY_OVERLOADED",
            deadlineRisk: "LOW",
            plannedMinutes: 90,
            completedMinutes: 15,
            remainingMinutes: 75,
            realisticWorkloadRange: { minMinutes: 30, maxMinutes: 60 },
            adjustments: [],
          },
          summary: "A little overloaded.",
          nextBestAction: null,
          clarificationTaskIds: [],
          expiresAt: "2026-08-10T12:00:00.000Z",
        },
      },
      capacity: {
        status: "ready",
        value: {
          localDate: "2026-08-10",
          remainingRange: { min: 30, max: 60 },
          state: "STANDARD",
          confidence: "HIGH",
          primarySource: "DEFAULT",
          sourceSignals: [],
          completedMinutesToday: 15,
          availableMinutesCeiling: null,
          manualOverride: null,
        },
      },
      nba: { status: "error", message: "" },
      repair: { status: "error", message: "" },
      recovery: { status: "error", message: "" },
    });

    const surface = createExecutiveSurface({
      documentRef,
      windowRef,
      getCurrentAppPage: () => "executive",
      getIdToken: async () => null,
    });

    surface.register();
    await Promise.resolve();

    const planHealth = documentRef.elements.get("executivePlanHealth")!;
    expect(planHealth.textContent).toBe("Slightly Overloaded");
    expect(planHealth.getAttribute("data-plan-health")).toBe("SLIGHTLY_OVERLOADED");
    expect(documentRef.elements.get("executiveCapacityRange")!.textContent).toBe("30-60 min");
  });

  it("collapses equal remaining capacity bounds into a single approximate value", async () => {
    const documentRef = makeDocument();
    vi.mocked(loadExecutiveData).mockResolvedValue({
      brief: { status: "error", message: "" },
      capacity: {
        status: "ready",
        value: {
          localDate: "2026-08-10",
          remainingRange: { min: 40, max: 40 },
          state: "USER_DEFINED",
          confidence: "HIGH",
          primarySource: "USER_CUSTOM",
          sourceSignals: [],
          completedMinutesToday: 15,
          availableMinutesCeiling: null,
          manualOverride: null,
        },
      },
      nba: { status: "error", message: "" },
      repair: { status: "error", message: "" },
      recovery: { status: "error", message: "" },
    });

    createExecutiveSurface({
      documentRef,
      windowRef: makeWindow(),
      getCurrentAppPage: () => "executive",
      getIdToken: async () => null,
    }).register();
    await Promise.resolve();

    expect(documentRef.elements.get("executiveCapacityRange")!.textContent).toBe("~40 min");
  });

  it("keeps the plan health metric loading when Executive Function is plan-locked", () => {
    const documentRef = makeDocument();
    const windowRef = {
      addEventListener: vi.fn(),
    } as unknown as Window;
    const planHealth = documentRef.elements.get("executivePlanHealth")!;
    planHealth.setAttribute("data-plan-health", "REALISTIC");

    const surface = createExecutiveSurface({
      documentRef,
      windowRef,
      getCurrentAppPage: () => "executive",
      canUseExecutiveFunction: () => false,
    });

    surface.register();

    expect(planHealth.textContent).toBe("Loading");
    expect(planHealth.getAttribute("data-plan-health")).toBeNull();
    expect(documentRef.elements.get("appPageExecutive")!.classList.contains("isExecutiveFunctionDisabled")).toBe(false);
  });

  it("keeps metric cards in their loading state while initial entitlement hydration is incomplete", () => {
    const documentRef = makeDocument();
    documentRef.elements.get("executivePlanHealth")!.textContent = "Loading";
    const windowRef = {
      addEventListener: vi.fn(),
    } as unknown as Window;

    const surface = createExecutiveSurface({
      documentRef,
      windowRef,
      getCurrentAppPage: () => "executive",
      canUseExecutiveFunction: () => false,
      getExecutiveFunctionUnavailableMessage: () => "Upgrade to PLUS to use Executive Function features.",
    });

    surface.register();

    expect(documentRef.elements.get("executivePlanHealth")!.textContent).toBe("Loading");
    expect(documentRef.elements.get("appPageExecutive")!.classList.contains("isExecutiveFunctionDisabled")).toBe(false);
  });

  it("refreshes the Executive metrics when the hydrated plan grants access", async () => {
    const documentRef = makeDocument();
    const listeners = new Map<string, EventListener>();
    const windowRef = {
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    } as unknown as Window;
    let canUseExecutiveFunction = false;
    vi.mocked(loadExecutiveData).mockResolvedValue({
      brief: { status: "error", message: "" },
      capacity: { status: "error", message: "" },
      nba: { status: "error", message: "" },
      repair: { status: "error", message: "" },
      recovery: { status: "error", message: "" },
    });

    const surface = createExecutiveSurface({
      documentRef,
      windowRef,
      getCurrentAppPage: () => "executive",
      canUseExecutiveFunction: () => canUseExecutiveFunction,
      getExecutiveFunctionUnavailableMessage: () => "Upgrade to PLUS to use Executive Function features.",
    });

    surface.register();
    expect(documentRef.elements.get("executivePlanHealth")!.textContent).toBe("Loading");

    canUseExecutiveFunction = true;
    listeners.get(TASKTIMER_PLAN_CHANGED_EVENT)?.(new Event(TASKTIMER_PLAN_CHANGED_EVENT));
    await Promise.resolve();

    expect(loadExecutiveData).toHaveBeenCalledTimes(1);
    expect(documentRef.elements.get("executivePlanHealth")!.textContent).toBe("Unavailable");
  });

  it("marks the Executive page disabled when Executive Function is turned off in Settings", () => {
    const documentRef = makeDocument();
    const windowRef = {
      addEventListener: vi.fn(),
    } as unknown as Window;

    const surface = createExecutiveSurface({
      documentRef,
      windowRef,
      getCurrentAppPage: () => "executive",
      canUseExecutiveFunction: () => false,
      getExecutiveFunctionUnavailableMessage: () => "Executive Function is turned off in Settings.",
    });

    surface.register();

    expect(documentRef.elements.get("appPageExecutive")!.classList.contains("isExecutiveFunctionDisabled")).toBe(true);
  });

  it("shows and hides the matching metric helper on desktop hover and keyboard focus", () => {
    const documentRef = makeDocument();
    const surface = createExecutiveSurface({
      documentRef,
      windowRef: makeWindow(),
      getCurrentAppPage: () => "dashboard",
      isTouchRuntime: () => false,
    });
    const planHealthCard = documentRef.helperCards[0];

    surface.register();
    planHealthCard.dispatch("pointerenter");
    expect(planHealthCard.classList.contains("isHelperVisible")).toBe(true);
    expect(planHealthCard.getAttribute("aria-expanded")).toBe("true");
    expect(planHealthCard.helper?.getAttribute("aria-hidden")).toBe("false");

    planHealthCard.dispatch("pointerleave");
    expect(planHealthCard.classList.contains("isHelperVisible")).toBe(false);

    planHealthCard.dispatch("focus");
    expect(planHealthCard.classList.contains("isHelperVisible")).toBe(true);
    documentRef.dispatch("keydown", { key: "Escape" } as KeyboardEvent);
    expect(planHealthCard.classList.contains("isHelperVisible")).toBe(false);
  });

  it("toggles touch helpers and dismisses them outside the card or after ten seconds", () => {
    vi.useFakeTimers();
    const documentRef = makeDocument();
    const surface = createExecutiveSurface({
      documentRef,
      windowRef: makeWindow(),
      getCurrentAppPage: () => "dashboard",
      isTouchRuntime: () => true,
    });
    const [planHealthCard, capacityCard] = documentRef.helperCards;

    surface.register();
    planHealthCard.dispatch("click");
    expect(planHealthCard.classList.contains("isHelperVisible")).toBe(true);

    capacityCard.dispatch("click");
    expect(planHealthCard.classList.contains("isHelperVisible")).toBe(false);
    expect(capacityCard.classList.contains("isHelperVisible")).toBe(true);

    documentRef.dispatch("pointerdown", { target: null } as Event);
    expect(capacityCard.classList.contains("isHelperVisible")).toBe(false);

    planHealthCard.dispatch("click");
    vi.advanceTimersByTime(10_000);
    expect(planHealthCard.classList.contains("isHelperVisible")).toBe(false);
    surface.destroy();
    vi.useRealTimers();
  });
});
