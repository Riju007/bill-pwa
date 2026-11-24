import { expect, test } from "@playwright/test";

test("requires credentials before loading the workspace and shows a read-only account", async ({ page }) => {
    await page.route("**/api/auth/session", (route) => route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false, configured: true }),
    }));
    await page.route("**/api/auth/login", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: true }),
    }));

    await page.goto("/");
    await expect(page.locator("#login-screen")).toBeVisible();
    await expect(page.locator(".app")).toBeHidden();

    await page.locator("#login-username").fill("owner@example.test");
    await page.locator("#login-password").fill("test-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.locator("#login-screen")).toBeHidden();
    await expect(page.locator("#page-dashboard")).toBeVisible();

    await page.locator("#account-menu-toggle").click();
    await expect(page.locator("#account-menu")).toBeVisible();
    await page.getByRole("button", { name: "View account" }).click();
    await expect(page.locator("#account-dialog")).toBeVisible();
    await expect(page.locator("#account-dialog")).toContainText("Pabitra Betal");
    await expect(page.locator("#account-dialog")).toContainText("Arambagh, West Bengal");
});
