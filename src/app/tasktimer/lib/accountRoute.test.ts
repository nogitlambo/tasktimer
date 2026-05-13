import { describe, expect, it } from "vitest";

import { getAccountBackRoute } from "./accountRoute";

describe("account route helpers", () => {
  const currentHref = "https://tasklaunch.test/account";

  it("returns the same-origin TaskTimer referrer route", () => {
    expect(getAccountBackRoute("https://tasklaunch.test/tasklaunch?page=schedule", currentHref)).toBe(
      "/tasklaunch?page=schedule"
    );
    expect(getAccountBackRoute("https://tasklaunch.test/dashboard/", currentHref)).toBe("/dashboard");
  });

  it("falls back to dashboard for account redirects and unsafe referrers", () => {
    expect(getAccountBackRoute("https://tasklaunch.test/settings?pane=general", currentHref)).toBe("/dashboard");
    expect(getAccountBackRoute("https://example.test/dashboard", currentHref)).toBe("/dashboard");
    expect(getAccountBackRoute("https://tasklaunch.test/account", currentHref)).toBe("/dashboard");
  });
});
