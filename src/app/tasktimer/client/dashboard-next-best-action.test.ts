import { describe, expect, it, vi } from "vitest";

import {
  createDashboardNextBestAction,
  formatNextBestActionDuration,
  formatNextBestActionDailyProgressPill,
  formatNextBestActionExplanation,
  formatNextBestActionTimeGoalPill,
  getNextBestActionTimeOptions,
  parseNextBestActionDashboardResponse,
} from "./dashboard-next-best-action";
import { TASK_COMPLETION_CHANGED_EVENT } from "./task-completion-events";
import { EXECUTIVE_FUNCTION_DISABLED_MESSAGE } from "../lib/executiveFunctionAvailability";

describe("dashboard Next Best Action contract", () => {
  it("accepts a safe recommendation response and formats its duration", () => {
    const result = parseNextBestActionDashboardResponse(
      {
        ok: true,
        recommendation: {
          recommendationId: "recommendation-1",
          type: "NEXT_BEST_ACTION",
          taskId: "task-1",
          title: "Prepare launch notes",
          firstAction: "Open the outline",
          estimatedMinutes: 20,
          durationSource: "HISTORICAL_ESTIMATE",
          timeGoalMinutes: 45,
          dailyProgressPercent: 67,
          latestHistoryEntry: {
            ts: Date.parse("2026-08-07T12:00:00.000Z"),
            ms: 30 * 60000,
          },
          confidence: "high",
          reasonCodes: ["DUE_SOON"],
          explanation: "It is due soon.",
          createdAt: "2026-08-07T09:00:00.000Z",
          expiresAt: "2026-08-07T09:30:00.000Z",
        },
      },
      Date.parse("2026-08-07T09:10:00.000Z"),
    );

    expect(result.kind).toBe("recommendation");
    if (result.kind !== "recommendation") return;
    expect(result.recommendation.title).toBe("Prepare launch notes");
    expect(formatNextBestActionExplanation(result.recommendation)).toBe(
      "It is due soon. Estimated effort: 20 minutes, historical estimate duration. Last history entry: 30 minutes on Friday, August 7, 2026. Recommendation confidence: high confidence.",
    );
    expect(
      formatNextBestActionTimeGoalPill(result.recommendation.timeGoalMinutes),
    ).toBe("45 minutes");
    expect(formatNextBestActionDailyProgressPill(result.recommendation.dailyProgressPercent)).toBe("67% today");
    expect(formatNextBestActionDailyProgressPill(null)).toBe("");
    expect(formatNextBestActionDuration(result.recommendation)).toBe(
      "20m · historical estimate",
    );
  });

  it("turns absent and expired responses into explicit dashboard states", () => {
    expect(
      parseNextBestActionDashboardResponse(
        { ok: true, recommendation: null },
        Date.now(),
      ),
    ).toEqual({ kind: "empty" });
    expect(
      parseNextBestActionDashboardResponse(
        {
          ok: true,
          recommendation: {
            recommendationId: "r",
            type: "NEXT_BEST_ACTION",
            taskId: "t",
            title: "Task",
            estimatedMinutes: 10,
            expiresAt: "2026-08-07T09:00:00.000Z",
          },
        },
        Date.parse("2026-08-07T09:01:00.000Z"),
      ),
    ).toEqual({ kind: "stale" });
  });

  it("keeps available-time choices bounded and deterministic", () => {
    expect(getNextBestActionTimeOptions()).toEqual([10, 20, 30, 60, null]);
  });

  it("refreshes with the selected available-time pill", async () => {
    const clickListeners: Array<(event: Event) => void> = [];
    const select = { value: "any" };
    const card = {
      classList: { toggle: vi.fn() },
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };
    const pill = (value: string) => {
      const attrs = new Map<string, string>([
        ["data-next-best-action-time", value],
        ["aria-pressed", value === "any" ? "true" : "false"],
      ]);
      return {
        getAttribute: (key: string) => attrs.get(key) ?? null,
        setAttribute: (key: string, next: string) => attrs.set(key, next),
        attrs,
      };
    };
    const pills = [pill("10"), pill("20"), pill("30"), pill("60"), pill("any")];
    const documentRef = {
      getElementById: (id: string) =>
        id === "dashboardNextBestActionCard"
          ? card
          : id === "dashboardNextBestActionTimeSelect"
            ? select
            : null,
      querySelectorAll: (selector: string) =>
        selector === "[data-next-best-action-time]" ? pills : [],
      addEventListener: (type: string, listener: (event: Event) => void) => {
        if (type === "click") clickListeners.push(listener);
      },
    } as unknown as Document;
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, recommendation: null }), {
          status: 200,
        }),
    ) as unknown as typeof fetch & {
      mock: { calls: Array<Parameters<typeof fetch>> };
    };
    const api = createDashboardNextBestAction({
      documentRef,
      windowRef: {
        fetch: fetchImpl,
        addEventListener: vi.fn(),
      } as unknown as Window,
      fetchImpl,
      getCurrentAppPage: () => "executive",
      getIdToken: async () => "token",
    });

    api.register();
    clickListeners.forEach((listener) =>
      listener({
        target: {
          closest: (selector: string) =>
            selector === "[data-next-best-action-time]" ? pills[2] : null,
        },
      } as unknown as Event),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(select.value).toBe("30");
    expect(pills[2].attrs.get("aria-pressed")).toBe("true");
    expect(pills[4].attrs.get("aria-pressed")).toBe("false");
    expect(
      JSON.parse(String(fetchImpl.mock.calls.at(-1)?.[1]?.body)),
    ).toMatchObject({ availableMinutes: 30 });
  });

  it("renders a locked state without fetching when executive function is unavailable", async () => {
    const attrs = new Map<string, string>();
    const statusAttrs = new Map<string, string>();
    const status = {
      textContent: "",
      hidden: false,
      setAttribute: (key: string, value: string) => statusAttrs.set(key, value),
    };
    const card = {
      classList: { toggle: vi.fn() },
      setAttribute: (key: string, value: string) => attrs.set(key, value),
      removeAttribute: (key: string) => attrs.delete(key),
      querySelector: () => null,
    };
    const documentRef = {
      getElementById: (id: string) =>
        id === "dashboardNextBestActionCard"
          ? card
          : id === "dashboardNextBestActionStatus"
            ? status
            : null,
      querySelectorAll: () => [],
      addEventListener: vi.fn(),
    } as unknown as Document;
    const fetchImpl = vi.fn();
    const api = createDashboardNextBestAction({
      documentRef,
      windowRef: {
        fetch: fetchImpl,
        addEventListener: vi.fn(),
      } as unknown as Window,
      fetchImpl,
      getCurrentAppPage: () => "dashboard",
      canUseExecutiveFunction: () => false,
    });

    await api.refresh();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(status.textContent).toBe(
      "Upgrade to PLUS to use executive function features.",
    );
    expect(status.hidden).toBe(true);
    expect(statusAttrs.get("aria-hidden")).toBe("true");
    expect(attrs.get("data-next-best-action-state")).toBe("locked");
    expect(attrs.get("data-plan-locked")).toBe("executiveFunction");
  });

  it("does not show an upgrade button label when a PLUS user has executive function disabled", async () => {
    const retry = {
      textContent: "",
      hidden: false,
      disabled: true,
      dataset: {} as Record<string, string>,
    };
    const status = { textContent: "", hidden: false, setAttribute: vi.fn() };
    const card = {
      classList: { toggle: vi.fn() },
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      querySelector: () => null,
    };
    const documentRef = {
      getElementById: (id: string) =>
        id === "dashboardNextBestActionCard"
          ? card
          : id === "dashboardNextBestActionStatus"
            ? status
            : id === "dashboardNextBestActionRetry"
              ? retry
              : null,
      querySelectorAll: () => [],
      addEventListener: vi.fn(),
    } as unknown as Document;
    const fetchImpl = vi.fn();
    const api = createDashboardNextBestAction({
      documentRef,
      windowRef: {
        fetch: fetchImpl,
        addEventListener: vi.fn(),
      } as unknown as Window,
      fetchImpl,
      getCurrentAppPage: () => "executive",
      canUseExecutiveFunction: () => false,
      getExecutiveFunctionUnavailableMessage: () =>
        EXECUTIVE_FUNCTION_DISABLED_MESSAGE,
    });

    await api.refresh();

    expect(status.textContent).toBe(EXECUTIVE_FUNCTION_DISABLED_MESSAGE);
    expect(retry.textContent).toBe("Retry");
    expect(retry.textContent).not.toBe("Upgrade to PLUS");
  });

  it("shows the status text while loading and hides it when a recommendation is ready", async () => {
    const elements = new Map<
      string,
      {
        textContent: string;
        hidden: boolean;
        dataset: Record<string, string>;
        setAttribute: (key: string, value: string) => void;
        addEventListener: () => void;
      }
    >();
    const attrs = new Map<string, string>();
    const card = {
      classList: { toggle: vi.fn() },
      setAttribute: (key: string, value: string) => attrs.set(key, value),
      removeAttribute: (key: string) => attrs.delete(key),
    };
    const getOrCreateElement = (id: string) => {
      if (!elements.has(id)) {
        elements.set(id, {
          textContent: "",
          hidden: false,
          dataset: {},
          setAttribute(key, value) {
            if (key === "aria-hidden") this.dataset.ariaHidden = value;
          },
          addEventListener: vi.fn(),
        });
      }
      return elements.get(id);
    };
    const documentRef = {
      getElementById: (id: string) =>
        id === "dashboardNextBestActionCard" ? card : getOrCreateElement(id),
      querySelectorAll: () => [],
      addEventListener: vi.fn(),
    } as unknown as Document;
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            recommendation: {
              recommendationId: "recommendation-1",
              type: "NEXT_BEST_ACTION",
              taskId: "task-1",
              title: "Prepare launch notes",
              estimatedMinutes: 20,
              durationSource: "HISTORICAL_ESTIMATE",
              timeGoalMinutes: 45,
              dailyProgressPercent: 67,
              latestHistoryEntry: {
                ts: Date.parse("2026-08-07T12:00:00.000Z"),
                ms: 30 * 60000,
              },
              confidence: "HIGH",
              explanation: "It is due soon.",
              expiresAt: "2099-08-07T09:30:00.000Z",
            },
          }),
          { status: 200 },
        ),
    );
    const api = createDashboardNextBestAction({
      documentRef,
      windowRef: {
        fetch: fetchImpl,
        addEventListener: vi.fn(),
      } as unknown as Window,
      fetchImpl,
      getCurrentAppPage: () => "executive",
      getIdToken: async () => "token",
    });

    const refreshPromise = api.refresh();
    expect(elements.get("dashboardNextBestActionStatus")).toMatchObject({
      textContent: "Loading your next best action...",
      hidden: false,
    });
    await refreshPromise;

    expect(elements.get("dashboardNextBestActionStatus")).toMatchObject({
      textContent: "Recommendation ready",
      hidden: true,
    });
    expect(elements.get("dashboardNextBestActionTimeGoal")).toMatchObject({
      textContent: "45 minutes",
      hidden: false,
    });
    expect(
      elements.get("dashboardNextBestActionTimeGoal")?.dataset.ariaHidden,
    ).toBe("false");
    expect(elements.get("dashboardNextBestActionDailyProgress")).toMatchObject({
      textContent: "67% today",
      hidden: false,
    });
    expect(
      elements.get("dashboardNextBestActionExplanation")?.textContent,
    ).toBe(
      "It is due soon. Estimated effort: 20 minutes, historical estimate duration. Last history entry: 30 minutes on Friday, August 7, 2026. Recommendation confidence: high confidence.",
    );
    expect(
      elements.get("dashboardNextBestActionExplanation")?.textContent,
    ).not.toContain("Current time goal");
    expect(
      elements.get("dashboardNextBestActionStatus")?.dataset.ariaHidden,
    ).toBe("true");
    expect(attrs.get("data-next-best-action-state")).toBe("ready");
  });

  it("sends Not now to the server-owned dismissal endpoint", async () => {
    const listeners = new Map<string, (event: Event) => void>();
    const cardListeners = new Map<string, (event: Event) => void>();
    const elements = new Map<
      string,
      {
        textContent: string;
        hidden: boolean;
        value?: string;
        dataset: Record<string, string>;
        setAttribute: (key: string, value: string) => void;
        addEventListener: () => void;
      }
    >();
    const cardAttrs = new Map<string, string>();
    const button = (textContent: string, attrs: Array<[string, string]>) => {
      const attrMap = new Map<string, string>(attrs);
      const labelElement =
        attrMap.get("data-next-best-action-action") === "start"
          ? { textContent }
          : null;
      return {
        textContent,
        labelElement,
        hidden: false,
        disabled: false,
        querySelector: (selector: string) =>
          selector === ".dashboardStartNowButtonLabel" ? labelElement : null,
        getAttribute: (key: string) => attrMap.get(key) ?? null,
        setAttribute: (key: string, value: string) => attrMap.set(key, value),
      };
    };
    const actionButtons = [
      button("LAUNCH", [
        ["data-next-best-action-action", "start"],
        ["data-next-best-action-task-id", "task-1"],
        ["data-next-best-action-recommendation-id", "recommendation-1"],
      ]),
      button("Alternative", [["data-next-best-action-action", "alternative"]]),
      button("Not now", [
        ["data-next-best-action-action", "dismiss"],
        ["data-next-best-action-recommendation-id", "recommendation-1"],
      ]),
    ];
    const documentRef = {
      getElementById: (id: string) => {
        if (id === "dashboardNextBestActionCard")
          return {
            classList: { toggle: vi.fn() },
            setAttribute: (key: string, value: string) =>
              cardAttrs.set(key, value),
            removeAttribute: (key: string) => cardAttrs.delete(key),
            addEventListener: (
              type: string,
              listener: (event: Event) => void,
            ) => cardListeners.set(type, listener),
          };
        if (!elements.has(id))
          elements.set(id, {
            textContent: "",
            hidden: false,
            dataset: {},
            setAttribute: vi.fn(),
            addEventListener: vi.fn(),
          });
        return elements.get(id);
      },
      querySelectorAll: (selector: string) =>
        selector === "[data-next-best-action-action]" ? actionButtons : [],
      addEventListener: (type: string, listener: (event: Event) => void) =>
        listeners.set(type, listener),
    } as unknown as Document;
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const startTaskById = vi.fn(() => "started" as const);
    const api = createDashboardNextBestAction({
      documentRef,
      windowRef: {
        fetch: fetchImpl,
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as Window,
      fetchImpl,
      getCurrentAppPage: () => "other",
      getIdToken: async () => "token",
      startTaskById,
    });

    api.register();
    expect(cardListeners.get("click")).toBeTypeOf("function");
    cardListeners.get("click")?.({
      target: { closest: () => actionButtons[2] },
    } as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/recommendations/next-best-action/recommendation-1/dismiss",
      expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
    );
    expect(elements.get("dashboardNextBestActionStatus")?.textContent).toBe(
      "Task hidden for an hour, or until another task is completed. Refresh then to choose again.",
    );
    expect(startTaskById).not.toHaveBeenCalled();
  });

  it("refreshes after a persisted task completion event", async () => {
    const windowListeners = new Map<string, (event: Event) => void>();
    let page = "other";
    const card = {
      classList: { toggle: vi.fn() },
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };
    const documentRef = {
      getElementById: (id: string) =>
        id === "dashboardNextBestActionCard" ? card : null,
      querySelectorAll: () => [],
      addEventListener: vi.fn(),
    } as unknown as Document;
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, recommendation: null }), {
          status: 200,
        }),
    );
    const api = createDashboardNextBestAction({
      documentRef,
      windowRef: {
        fetch: fetchImpl,
        addEventListener: (type: string, listener: (event: Event) => void) =>
          windowListeners.set(type, listener),
      } as unknown as Window,
      fetchImpl,
      getCurrentAppPage: () => page,
      getIdToken: async () => "token",
    });

    api.register();
    page = "dashboard";
    windowListeners.get(TASK_COMPLETION_CHANGED_EVENT)?.(
      new CustomEvent(TASK_COMPLETION_CHANGED_EVENT, { detail: { taskId: "task-2" } }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "/api/recommendations/next-best-action/suppressions/release",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ completedTaskId: "task-2" }),
      }),
    );
  });
});
