import { expect, test } from "@playwright/test";
import { AUTH_STATE_PATH, hasAuthState } from "./auth.shared";
import {
  createDailyScheduledTask,
  createFlexibleUnscheduledTask,
  uniqueTaskName,
  waitForTaskTimerApp,
} from "./tasktimer.helpers";

test.use({ storageState: AUTH_STATE_PATH });

test.describe("mobile schedule interactions", () => {
  test.skip(!hasAuthState(), "Run `npm run test:e2e:auth:setup` first to capture an authenticated Playwright session.");

  test("@mobile schedule view opens with mobile day tabs", async ({ page }) => {
    await page.goto("/tasklaunch");
    await waitForTaskTimerApp(page);

    await page.locator("#openScheduleBtn").click();

    await expect(page).toHaveURL(/\/tasklaunch(?:\?page=schedule)?$/);
    await expect(page.locator("#appPageSchedule")).toBeVisible();
    await expect(page.locator("#scheduleMobileDayTabs")).toBeVisible();
    await expect(page.locator(".schedulePlanner.isMobile")).toBeVisible();
  });

  test("@mobile tapping a scheduled card does not duplicate it", async ({ page }) => {
    const taskName = uniqueTaskName("Playwright Mobile Schedule");

    await page.goto("/tasklaunch");
    await createDailyScheduledTask(page, taskName);

    await page.locator("#openScheduleBtn").click();
    await expect(page.locator("#appPageSchedule")).toBeVisible();

    const scheduleCard = page.locator(".scheduleTaskCard", { hasText: taskName }).first();
    await expect(scheduleCard).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".scheduleTaskCard", { hasText: taskName })).toHaveCount(1);
    await expect(page.locator(".scheduleTrayTask", { hasText: taskName })).toHaveCount(0);

    await scheduleCard.tap();

    await expect(page.locator(".scheduleTaskCard", { hasText: taskName })).toHaveCount(1);
    await expect(page.locator(".scheduleTrayTask", { hasText: taskName })).toHaveCount(0);
    await expect(page.locator("#appPageSchedule")).toBeVisible();
  });

  test("@mobile tapping an unscheduled tray task does not duplicate or place it", async ({ page }) => {
    const taskName = uniqueTaskName("Playwright Mobile Tray");

    await page.goto("/tasklaunch");
    await createFlexibleUnscheduledTask(page, taskName);

    await page.locator("#openScheduleBtn").click();
    await expect(page.locator("#appPageSchedule")).toBeVisible();

    const trayTask = page.locator(".scheduleTrayTask", { hasText: taskName }).first();
    await expect(trayTask).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".scheduleTrayTask", { hasText: taskName })).toHaveCount(1);
    await expect(page.locator(".scheduleTaskCard", { hasText: taskName })).toHaveCount(0);

    await trayTask.tap();

    await expect(page.locator(".scheduleTrayTask", { hasText: taskName })).toHaveCount(1);
    await expect(page.locator(".scheduleTaskCard", { hasText: taskName })).toHaveCount(0);
    await expect(page.locator("#appPageSchedule")).toBeVisible();
  });

  test("@mobile footer navigation reaches dashboard and settings", async ({ page }) => {
    await page.goto("/tasklaunch");
    await waitForTaskTimerApp(page);

    await page.locator("#footerDashboardBtn").click();
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);

    await page.locator("#footerSettingsBtn").click();
    await expect(page).toHaveURL(/\/settings(?:\?.*)?$/);
    await expect(page.getByLabel("Settings navigation")).toBeVisible();
  });
});
