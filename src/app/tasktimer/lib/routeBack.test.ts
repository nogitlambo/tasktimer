import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStandaloneRouteBackTarget } from "./routeBack";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("standalone route back navigation", () => {
  it("normalizes a retired Schedule referrer to the clean Tasks route", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/feedback",
        search: "",
        hash: "",
        href: "https://tasklaunch.test/feedback",
        origin: "https://tasklaunch.test",
      },
      localStorage: { getItem: () => null },
    });
    vi.stubGlobal("document", { referrer: "https://tasklaunch.test/tasklaunch?page=schedule&highlight=task-1" });

    expect(resolveStandaloneRouteBackTarget("/dashboard")).toBe("/tasklaunch");
  });

  it("normalizes a retired Schedule nav-stack target to Tasks", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/feedback",
        search: "",
        hash: "",
      },
      localStorage: {
        getItem: () => JSON.stringify(["app:tasktimer|page=schedule"]),
      },
    });
    vi.stubGlobal("document", { referrer: "" });

    expect(resolveStandaloneRouteBackTarget("/dashboard")).toBe("/tasklaunch");
  });
});
