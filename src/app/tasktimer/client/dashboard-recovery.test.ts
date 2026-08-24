import { afterEach, describe, expect, it, vi } from "vitest";

import { createDashboardRecovery, parseRecoveryResponse } from "./dashboard-recovery";

const action = {
  id: "defer:task-1",
  type: "DEFER_TO_LATER_DAY",
  taskId: "task-1",
  taskVersion: "v1",
  toDate: "2026-08-10",
  reasonCodes: ["SAFE_TO_DEFER"],
  selected: false,
  status: "PROPOSED",
  classification: "FLEXIBLE",
};

describe("parseRecoveryResponse", () => {
  it("accepts a server-owned session and preserves safe action selection state", () => {
    const parsed = parseRecoveryResponse({
      ok: true,
      session: {
        id: "recovery-1",
        status: "ACTIVE",
        backlogCount: 8,
        overdueCount: 2,
        urgentCount: 3,
        flexibleCount: 4,
        staleCount: 1,
        remainingCapacity: { min: 15, max: 30 },
        restartTaskId: "task-1",
        actions: [action],
      },
    });

    expect(parsed).toMatchObject({ kind: "session", session: { id: "recovery-1", restartTaskId: "task-1", actions: [{ taskId: "task-1", selected: false }] } });
  });

  it("recognises an explicit no-recovery response", () => {
    expect(parseRecoveryResponse({ ok: true, empty: true, session: null })).toEqual({ kind: "empty" });
  });

  it("rejects malformed or non-active sessions", () => {
    expect(parseRecoveryResponse({ ok: true, session: { id: "recovery-1", status: "COMPLETED", actions: [action] } })).toEqual({ kind: "invalid" });
  });
});

describe("Recovery Mode launcher", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the modal immediately while a user-requested recovery refresh is pending", () => {
    class FakeElement {
      style: Record<string, string> = { display: "none" };
      attributes = new Map<string, string>();
      classList = { toggle: vi.fn() };
      disabled = false;
      hidden = false;
      textContent = "";

      setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
      }

      removeAttribute(name: string) {
        this.attributes.delete(name);
      }

      querySelector() {
        return null;
      }

      focus() {}
    }

    vi.stubGlobal("HTMLElement", FakeElement);
    const card = new FakeElement();
    const overlay = new FakeElement();
    const status = new FakeElement();
    const modalStatus = new FakeElement();
    const elements = new Map<string, FakeElement>([
      ["dashboardRecoveryCard", card],
      ["dashboardRecoveryOverlay", overlay],
      ["dashboardRecoveryStatus", status],
      ["dashboardRecoveryModalStatus", modalStatus],
    ]);
    const listeners = new Map<string, (event: Event) => void>();
    const openButton = {
      getAttribute: (name: string) => (name === "data-recovery" ? "open" : null),
    };
    let currentPage = "other";
    const documentRef = {
      activeElement: null,
      getElementById: (id: string) => elements.get(id) || null,
      addEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, listener),
      querySelector: () => null,
    } as unknown as Document;
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const api = createDashboardRecovery({
      documentRef,
      windowRef: {
        fetch: fetchImpl,
        addEventListener: vi.fn(),
      } as unknown as Window,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCurrentAppPage: () => currentPage,
      getTasks: () => [],
      getIdToken: async () => "token",
    });
    api.register();
    currentPage = "executive";

    listeners.get("click")?.({
      target: {
        closest: (selector: string) => selector === "[data-recovery]" ? openButton : null,
      },
    } as unknown as Event);

    expect(overlay.style.display).toBe("flex");
    expect(overlay.attributes.get("aria-hidden")).toBe("false");
    expect(modalStatus.textContent).toBe("Checking whether Recovery Mode can help...");
  });

  it("closes immediately when Recovery Mode is dismissed", async () => {
    class FakeElement {
      style: Record<string, string> = { display: "none" };
      attributes = new Map<string, string>();
      classList = { toggle: vi.fn() };
      disabled = false;
      hidden = false;
      textContent = "";

      setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
      }

      removeAttribute(name: string) {
        this.attributes.delete(name);
      }

      querySelector() {
        return null;
      }

      focus() {}
    }

    vi.stubGlobal("HTMLElement", FakeElement);
    const overlay = new FakeElement();
    const elements = new Map<string, FakeElement>([
      ["dashboardRecoveryCard", new FakeElement()],
      ["dashboardRecoveryOverlay", overlay],
      ["dashboardRecoveryStatus", new FakeElement()],
      ["dashboardRecoveryModalStatus", new FakeElement()],
    ]);
    const listeners = new Map<string, (event: Event) => void>();
    const openButton = { getAttribute: (name: string) => (name === "data-recovery" ? "open" : null) };
    const dismissButton = { getAttribute: (name: string) => (name === "data-recovery" ? "dismiss" : null) };
    const documentRef = {
      activeElement: null,
      getElementById: (id: string) => elements.get(id) || null,
      addEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, listener),
      querySelector: () => null,
    } as unknown as Document;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            session: {
              id: "recovery-1",
              status: "ACTIVE",
              actions: [action],
            },
          }),
        ),
      )
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    const api = createDashboardRecovery({
      documentRef,
      windowRef: { fetch: fetchImpl, addEventListener: vi.fn() } as unknown as Window,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCurrentAppPage: () => "executive",
      getTasks: () => [],
      getIdToken: async () => "token",
    });
    api.register();

    listeners.get("click")?.({
      target: { closest: (selector: string) => (selector === "[data-recovery]" ? openButton : null) },
    } as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    listeners.get("click")?.({
      target: { closest: (selector: string) => (selector === "[data-recovery]" ? dismissButton : null) },
    } as unknown as Event);

    expect(overlay.style.display).toBe("none");
    expect(overlay.attributes.get("aria-hidden")).toBe("true");
  });
});
