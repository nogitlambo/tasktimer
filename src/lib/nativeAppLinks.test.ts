import { describe, expect, it } from "vitest";
import { buildNativeAppRouteUrl, resolveNativeAppRoute } from "./nativeAppLinks";

describe("nativeAppLinks", () => {
  it("builds custom-scheme routes for native app returns", () => {
    expect(buildNativeAppRouteUrl("/account?checkout=success")).toBe("com.tasklaunch.app://account?checkout=success");
    expect(buildNativeAppRouteUrl("/settings?page=general&checkout=cancelled")).toBe(
      "com.tasklaunch.app://settings?page=general&checkout=cancelled"
    );
  });

  it("resolves custom-scheme routes back to in-app paths", () => {
    expect(resolveNativeAppRoute("com.tasklaunch.app://account?checkout=success")).toBe("/account?checkout=success");
    expect(resolveNativeAppRoute("com.tasklaunch.app://settings?page=general")).toBe("/settings?page=general");
  });

  it("resolves hosted tasklaunch.app billing return routes back to in-app paths", () => {
    expect(resolveNativeAppRoute("https://tasklaunch.app/account?checkout=success")).toBe("/account?checkout=success");
    expect(resolveNativeAppRoute("https://tasklaunch.app/settings?page=general&checkout=cancelled")).toBe(
      "/settings?page=general&checkout=cancelled"
    );
  });

  it("ignores unrelated web routes", () => {
    expect(resolveNativeAppRoute("https://tasklaunch.app/privacy")).toBe("");
  });
});
