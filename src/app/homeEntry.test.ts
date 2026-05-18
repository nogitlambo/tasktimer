import { describe, expect, it } from "vitest";
import { resolveHomeEntry } from "./homeEntry";

describe("resolveHomeEntry", () => {
  it("uses the login page as the native app home entry", () => {
    expect(
      resolveHomeEntry({
        host: "tasklaunch.app",
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
        isNativeRuntime: true,
      })
    ).toEqual({ action: "redirect", href: "/login" });
  });

  it("shows landing soon for mobile web navigation", () => {
    expect(
      resolveHomeEntry({
        host: "tasklaunch.app",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        isNativeRuntime: false,
      })
    ).toEqual({ action: "render", variant: "landingsoon" });
  });

  it("preserves the desktop landing variant decision", () => {
    expect(
      resolveHomeEntry({
        host: "example.test",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        isNativeRuntime: false,
      })
    ).toEqual({ action: "render", variant: "landing" });
  });
});
