import { expect, type Page } from "@playwright/test";

export async function waitForTaskTimerApp(page: Page) {
  await expect(page.locator("#app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#appPageTasks")).toBeVisible({ timeout: 15_000 });
}

export async function createDailyScheduledTask(page: Page, taskName: string) {
  await createTaskWithScheduleOptions(page, taskName, { flexible: false });
}

export async function createFlexibleUnscheduledTask(page: Page, taskName: string) {
  await createTaskWithScheduleOptions(page, taskName, { flexible: true });
}

async function createTaskWithScheduleOptions(page: Page, taskName: string, options: { flexible: boolean }) {
  await waitForTaskTimerApp(page);

  await page.locator("#openAddTaskBtn").click();
  await expect(page.getByRole("dialog", { name: "Add Task" })).toBeVisible();

  await page.locator("#addTaskName").fill(taskName);
  await page.locator("#addTaskStep1NextBtn").click();

  await expect(page.locator("#addTaskStep2")).toHaveClass(/isActive/);
  await page.locator("#addTaskDurationValueInput").fill("1");
  await page.locator("#addTaskDurationPeriodDay").click();
  await page.locator("#addTaskStep2NextBtn").click();

  await expect(page.locator("#addTaskStep3")).toHaveClass(/isActive/);
  await page.locator("#addTaskPlannedStartHourSelect").selectOption("09");
  await page.locator("#addTaskPlannedStartMinuteSelect").selectOption("00");
  await page.locator("#addTaskPlannedStartMeridiemSelect").selectOption("AM");
  if (options.flexible) {
    await page.locator("#addTaskPlannedStartOpenEnded").check();
  }
  await page.locator("#addTaskStep3NextBtn").click();

  await expect(page.locator("#addTaskStep4")).toHaveClass(/isActive/);
  await page.locator("#addTaskConfirmBtn").click();

  await expect(page.getByRole("dialog", { name: "Add Task" })).toBeHidden({ timeout: 15_000 });
}

export function uniqueTaskName(prefix: string) {
  return `${prefix} ${Date.now()}`;
}
