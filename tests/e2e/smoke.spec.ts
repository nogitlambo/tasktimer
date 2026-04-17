import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/tasklaunch",
  "/dashboard",
  "/friends",
  "/settings",
  "/history-manager",
  "/feedback",
  "/user-guide",
];

test.describe("public entrypoints", () => {
  test("landing page renders a sign-in path", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: /login|sign in|get started/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("web sign-in page renders auth controls", async ({ page }) => {
    await page.goto("/web-sign-in");

    await expect(page.getByText("YOUR DAILY PRODUCTIVITY ENGINE")).toBeVisible();
    await expect(page.getByRole("button", { name: "Login with email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Login with Google" })).toBeVisible();
  });
});

test.describe("protected route redirects", () => {
  for (const route of protectedRoutes) {
    test(`${route} redirects anonymous users to landing`, async ({ page }) => {
      await page.goto(route);

      await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
      await expect(
        page.getByRole("link", { name: /login|sign in|get started/i }).first()
      ).toBeVisible();
    });
  }
});
