import { afterEach, describe, expect, it, vi } from "vitest";
import { createTaskTimerAppShell } from "./app-shell";

function createShell() {
  const context = {
    initialAppPage: "tasks",
    getCurrentAppPage: () => "tasks",
    els: {},
    runtime: { destroyed: false },
  } as unknown as Parameters<typeof createTaskTimerAppShell>[0];
  return createTaskTimerAppShell(context);
}

function stubLocation(pathname: string, search = "", protocol = "http:") {
  vi.stubGlobal("window", {
    location: {
      pathname,
      search,
      protocol,
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createTaskTimerAppShell notes routing", () => {
  it("resolves the Notes app page from the /notes route", () => {
    stubLocation("/notes");

    expect(createShell().getInitialAppPageFromLocation()).toBe("notes");
  });

  it("resolves the Notes app page from the page query", () => {
    stubLocation("/tasklaunch", "?page=notes");

    expect(createShell().getInitialAppPageFromLocation()).toBe("notes");
  });

  it("does not treat /session-notes as a TaskTimer main app route", () => {
    const shell = createShell();

    expect(shell.isTaskTimerMainAppPath("/session-notes")).toBe(false);
    expect(shell.parseAppPageFromToken("app:tasktimer|page=session-notes")).toBeNull();
  });
});
