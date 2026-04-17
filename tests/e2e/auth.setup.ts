import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { AUTH_STATE_PATH } from "./auth.shared";

test("@auth-setup capture authenticated storage state", async ({ page }) => {
  mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  await page.goto("/web-sign-in");
  await expect(page.getByText("YOUR DAILY PRODUCTIVITY ENGINE")).toBeVisible();

  console.log("");
  console.log("Playwright auth setup:");
  console.log("1. Use the opened browser to complete sign-in.");
  console.log("2. Wait until the app lands on /dashboard, /tasklaunch, or another protected route.");
  console.log("3. The test will save the authenticated session automatically.");
  console.log("");

  await expect
    .poll(() => {
      const pathname = new URL(page.url()).pathname;
      return ["/dashboard", "/tasklaunch", "/friends", "/settings", "/history-manager", "/feedback", "/user-guide"].includes(pathname);
    }, { timeout: 10 * 60 * 1000, message: "Timed out waiting for a successful sign-in redirect to a protected route." })
    .toBe(true);

  await page.context().storageState({ path: AUTH_STATE_PATH });
});
