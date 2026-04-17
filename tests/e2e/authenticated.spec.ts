import { expect, test } from "@playwright/test";
import { hasAuthState, AUTH_STATE_PATH } from "./auth.shared";

test.use({ storageState: AUTH_STATE_PATH });

test.describe("authenticated app routes", () => {
  test.skip(!hasAuthState(), "Run `npm run test:e2e:auth:setup` first to capture an authenticated Playwright session.");

  test("tasklaunch loads the tasks page", async ({ page }) => {
    await page.goto("/tasklaunch");

    await expect(page.locator("#appPageTasks")).toBeVisible();
    await expect(page.locator("#openAddTaskBtn")).toBeVisible();
    await expect(page.locator("#footerTasksBtn")).toHaveClass(/isOn/);
  });

  test("footer navigation reaches dashboard, friends, and settings", async ({ page }) => {
    await page.goto("/tasklaunch");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard\/?(?:\?.*)?$/);

    await page.goto("/friends");
    await expect(page).toHaveURL(/\/friends\/?(?:\?.*)?$/);
    await expect(page.locator("#groupsFriendsSection")).toBeVisible();

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/?(?:\?.*)?$/);
    await expect(page.getByLabel("Settings navigation")).toBeVisible();
  });

  test("dashboard uses a loading gate and clears refresh pending automatically", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#initialAuthBusyOverlay")).toBeVisible();
    await expect(page.locator("#appPageDashboard")).toBeVisible();

    await expect(page.locator("#initialAuthBusyOverlay")).toBeHidden({ timeout: 15000 });
    await expect(page.locator("#dashboardRefreshBtn")).not.toHaveClass(/isPending/);
    await expect(page.locator("#dashboardWeeklyGoalsValue")).toBeVisible();
  });
});
