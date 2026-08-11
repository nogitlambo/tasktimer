import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExecutiveSurface } from "./executive-surface";
import { loadExecutiveData } from "./executive-data";

vi.mock("./executive-data", () => ({
  loadExecutiveData: vi.fn(),
}));

class TestElement {
  id = "";
  textContent = "";
  private attrs = new Map<string, string>();
  private classes = new Set<string>();
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
}

function makeDocument() {
  const elements = new Map<string, TestElement>();
  for (const id of ["appPageExecutive", "executivePlanHealth", "executiveCapacityRange", "executiveWorkRemaining", "executiveTodayDate"]) {
    const element = new TestElement();
    element.id = id;
    elements.set(id, element);
  }
  return {
    getElementById: (id: string) => elements.get(id) ?? null,
    elements,
  } as unknown as Document & { elements: Map<string, TestElement> };
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
      capacity: { status: "error", message: "" },
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
  });

  it("clears plan health styling when Executive Function is locked", () => {
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

    expect(planHealth.textContent).toBe("PLUS feature");
    expect(planHealth.getAttribute("data-plan-health")).toBeNull();
    expect(documentRef.elements.get("appPageExecutive")!.classList.contains("isExecutiveFunctionDisabled")).toBe(false);
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
});
