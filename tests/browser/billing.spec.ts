import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("loads the shared layout, page templates, local framework, and install icons", async ({ page }) => {
    await page.goto("/");

    const manifestResponse = await page.request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect((await page.request.get("/css/app.css")).ok()).toBeTruthy();
    for (const pageName of ["dashboard", "billing", "bills", "customers", "products"]) {
        expect((await page.request.get(`/pages/${pageName}.html`)).ok()).toBeTruthy();
    }
    await expect(page.locator("#page-dashboard")).toBeAttached();
    await expect(page.locator("#page-products")).toBeAttached();
    await page.locator('.sidebar [data-page="products"]').click();
    await expect(page.locator("#page-products")).toBeVisible();
    expect(manifest.icons.some((icon: { src: string }) => icon.src === "/icons/icon-192.png")).toBeTruthy();
    expect((await page.request.get("/icons/icon-192.png")).ok()).toBeTruthy();
    expect((await page.request.get("/vendor/bootstrap.min.css")).ok()).toBeTruthy();
    expect((await page.request.get("/vendor/bootstrap-icons/bootstrap-icons.min.css")).ok()).toBeTruthy();
    expect((await page.request.get("/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2")).ok()).toBeTruthy();
    expect((await page.request.get("/bill-pdf.js")).ok()).toBeTruthy();
    expect((await page.request.get("/pb-logo.gif")).ok()).toBeTruthy();
    await expect(page.locator("#save-button")).toHaveClass(/btn/);
    await expect(page.locator(".sidebar .nav-button.active .bi")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check("16px bootstrap-icons"))).toBeTruthy();
    const wordExamples = await page.evaluate(() => {
        const billPdf = (window as Window & { BillPdf: { amountInWords: (value: number) => string } }).BillPdf;
        return [billPdf.amountInWords(102000), billPdf.amountInWords(1250.5)];
    });
    expect(wordExamples).toEqual([
        "Rupees One Lakh Two Thousand Only",
        "Rupees One Thousand Two Hundred Fifty and Paise Fifty Only",
    ]);
});

test("previews a draft and downloads a readable PDF", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create new bill" }).click();
    await page.locator("#bill-number").fill("DRAFT-100");
    await page.locator("#bill-date").fill("2026-11-24");
    await page.locator("#customer-select").selectOption("1");
    await page.locator('.item-row select[data-field="productName"]').selectOption("1");
    await page.locator('.item-row input[data-field="imei"]').fill("123456789012345");
    await page.locator('.item-row input[data-field="amount"]').fill("1250");
    await page.getByRole("button", { name: "Add item to table" }).click();
    await page.getByRole("button", { name: "Preview bill" }).click();

    await expect(page.locator("#preview-dialog")).toBeVisible();
    await expect(page.locator("#preview-content")).toContainText("DRAFT-100");
    await expect(page.locator("#preview-content")).toContainText("Sample Customer");
    await expect(page.locator("#preview-content .bill-print-header")).toContainText("Pabitra's Online Services");
    await expect(page.locator("#preview-content .bill-amount-words")).toContainText("Rupees One Thousand Two Hundred Fifty Only");

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#download-preview").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("billwise-DRAFT-100.pdf");
    const path = await download.path();
    expect(path).toBeTruthy();
    const pdf = await readFile(path!);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.includes(Buffer.from("NotoSans"))).toBeTruthy();
    expect(pdf.includes(Buffer.from("/Subtype /Image"))).toBeTruthy();
    expect(pdf.toString("latin1")).toContain("Pabitra's Online Services - Bill DRAFT-100");
    expect(pdf.toString("latin1")).toContain("20B9");

    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#preview-dialog")).toBeVisible();
    await expect(page.locator("#preview-dialog .bill-output-actions")).toHaveCSS("display", "none");
});

test("downloads saved bills with multiple pages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "View details for bill INV-40" }).click();
    await expect(page.locator("#bill-detail-dialog")).toBeVisible();
    await expect(page.locator("#bill-detail-content")).toContainText("Sample Phone 40");

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#download-saved-bill").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("billwise-INV-40.pdf");
    const path = await download.path();
    expect(path).toBeTruthy();
    const pdf = await readFile(path!);
    const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pageCount).toBeGreaterThan(1);
});
