import { afterEach, describe, expect, it, vi } from "vitest";

import { createDashboardExecutiveSummary, renderDashboardExecutiveSummary } from "./dashboard-executive-summary";
import type { ExecutiveDataSnapshot } from "./executive-data";
import { TASK_COMPLETION_CHANGED_EVENT } from "./task-completion-events";

class FakeElement {
  textContent = "";
  hidden = false;
  disabled = false;
  dataset: Record<string, string> = {};
  labelElement: { textContent: string } | null = null;
  private attributes = new Map<string, string>();

  constructor(readonly id: string) {}

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
      delete this.dataset[key];
    }
  }

  querySelector(selector: string) {
    return selector === ".dashboardStartNowButtonLabel" ? this.labelElement : null;
  }
}

function createDocumentHarness() {
  const listeners = new Map<string, (event: Event) => void>();
  const ids = [
    "dashboardExecutiveSummary",
    "dashboardExecutiveSummaryContent",
    "dashboardExecutiveSummaryFallback",
    "dashboardExecutiveSummaryStatus",
    "dashboardExecutiveSummaryPlanHealth",
    "dashboardExecutiveSummaryCapacity",
    "dashboardExecutiveSummaryWorkload",
  ];
  const byId = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const documentRef = {
    getElementById: (id: string) => byId.get(id) ?? null,
    addEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, listener),
  } as unknown as Document;
  return { byId, documentRef, listeners };
}

function readySnapshot(planHealth: string): ExecutiveDataSnapshot {
  return {
    brief: {
      status: "ready",
      value: {
        date: "2026-08-10",
        status: "READY",
        plan: {
          planHealth,
          deadlineRisk: "WATCH",
          plannedMinutes: 130,
          completedMinutes: 10,
          remainingMinutes: 120,
          realisticWorkloadRange: { minMinutes: 45, maxMinutes: 75 },
          adjustments: [],
        },
        summary: "Move flexible work later and protect the first focus block.",
        nextBestAction: null,
        clarificationTaskIds: [],
        expiresAt: "2026-08-10T12:00:00.000Z",
      },
    },
    capacity: {
      status: "ready",
      value: {
        localDate: "2026-08-10",
        remainingRange: { min: 45, max: 75 },
        state: "STANDARD",
        confidence: "MEDIUM",
        primarySource: "DEFAULT",
        sourceSignals: ["DEFAULT_BASELINE"],
        availableMinutesCeiling: null,
        isProductivityDay: true,
        completedMinutesToday: 10,
        manualOverride: null,
      },
    },
    nba: {
      status: "ready",
      value: {
        recommendationId: "recommendation-1",
        type: "NEXT_BEST_ACTION",
        taskId: "task-1",
        title: "Tidy small area",
        firstAction: "Clear the nearest surface.",
        estimatedMinutes: 11,
        expiresAt: "2026-08-10T12:00:00.000Z",
      },
    },
    repair: { status: "empty" },
    recovery: { status: "empty" },
  };
}

function readySnapshotWithoutNextBestAction(): ExecutiveDataSnapshot {
  return {
    ...readySnapshot("REALISTIC"),
    nba: { status: "empty" },
  };
}

function fallbackSnapshot(): ExecutiveDataSnapshot {
  return {
    brief: { status: "error", message: "" },
    capacity: { status: "error", message: "" },
    nba: { status: "error", message: "" },
    repair: { status: "error", message: "" },
    recovery: { status: "error", message: "" },
  };
}

describe("renderDashboardExecutiveSummary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders significantly overloaded plan health as a status pill", () => {
    const { byId, documentRef } = createDocumentHarness();

    renderDashboardExecutiveSummary(documentRef, readySnapshot("SIGNIFICANTLY_OVERLOADED"));

    const status = byId.get("dashboardExecutiveSummaryStatus")!;
    expect(status.textContent).toBe("Significantly Overloaded");
    expect(status.getAttribute("data-plan-health")).toBe("SIGNIFICANTLY_OVERLOADED");
    expect(byId.get("dashboardExecutiveSummaryPlanHealth")!.textContent).toBe(
      "Move flexible work later and protect the first focus block."
    );
    expect(byId.get("dashboardExecutiveSummaryCapacity")!.textContent).toBe("45-75 min remaining");
  });

  it("shows one approximate remaining capacity value when both bounds match", () => {
    const { byId, documentRef } = createDocumentHarness();
    const snapshot = readySnapshot("REALISTIC");
    if (snapshot.capacity.status === "ready") snapshot.capacity.value.remainingRange = { min: 40, max: 40 };

    renderDashboardExecutiveSummary(documentRef, snapshot);

    expect(byId.get("dashboardExecutiveSummaryCapacity")!.textContent).toBe("~40 min remaining");
  });

  it("renders rest day copy and suppresses capacity and workload numbers", () => {
    const { byId, documentRef } = createDocumentHarness();
    const snapshot = readySnapshot("REALISTIC");
    if (snapshot.capacity.status === "ready") snapshot.capacity.value.isProductivityDay = false;
    const status = byId.get("dashboardExecutiveSummaryStatus")!;
    status.setAttribute("data-plan-health", "REALISTIC");

    renderDashboardExecutiveSummary(documentRef, snapshot);

    expect(status.textContent).toBe("Rest Day");
    expect(status.getAttribute("data-plan-health")).toBeNull();
    expect(byId.get("dashboardExecutiveSummaryPlanHealth")!.textContent).toBe("Today is outside your productivity days.");
    expect(byId.get("dashboardExecutiveSummaryCapacity")!.textContent).toBe("N/A");
    expect(byId.get("dashboardExecutiveSummaryWorkload")!.textContent).toBe("N/A");
  });

  it("keeps the summary content visible when no next best action exists", () => {
    const { byId, documentRef } = createDocumentHarness();

    renderDashboardExecutiveSummary(documentRef, readySnapshotWithoutNextBestAction());

    expect(byId.get("dashboardExecutiveSummaryContent")!.hidden).toBe(false);
  });

  it("clears the plan health pill attribute for fallback status text", () => {
    const { byId, documentRef } = createDocumentHarness();
    const status = byId.get("dashboardExecutiveSummaryStatus")!;
    status.setAttribute("data-plan-health", "SIGNIFICANTLY_OVERLOADED");

    renderDashboardExecutiveSummary(documentRef, fallbackSnapshot());

    expect(status.textContent).toBe("Executive data is unavailable right now.");
    expect(status.getAttribute("data-plan-health")).toBeNull();
  });

  it("refreshes after a persisted task completion event", async () => {
    const { documentRef } = createDocumentHarness();
    const windowListeners = new Map<string, (event: Event) => void>();
    let page = "other";
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchImpl);
    const api = createDashboardExecutiveSummary({
      documentRef,
      windowRef: { addEventListener: (type: string, listener: (event: Event) => void) => windowListeners.set(type, listener) } as unknown as Window,
      getCurrentAppPage: () => page,
      getIdToken: async () => "token",
    });

    api.register();
    page = "dashboard";
    windowListeners.get(TASK_COMPLETION_CHANGED_EVENT)?.(new Event(TASK_COMPLETION_CHANGED_EVENT));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
});
