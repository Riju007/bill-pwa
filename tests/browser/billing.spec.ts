import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("loads the PB Ledger shell, page templates, local framework, and install icons", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    await expect(page).toHaveTitle("PB Ledger");
    await expect(page.locator(".brand-name")).toHaveText("PB Ledger");
    await expect(page.locator(".sidebar-note")).toHaveCount(0);
    await expect(page.locator("#today-label")).toHaveCount(0);
    await expect(page.locator(".owner-label")).toHaveCount(0);
    await expect(page.locator('img[src$=".gif"]')).toHaveCount(0);
    const manifestResponse = await page.request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest.name).toBe("PB Ledger");
    expect(manifest.short_name).toBe("PB Ledger");
    expect((await page.request.get("/css/app.css")).ok()).toBeTruthy();
    expect((await page.request.get("/icons/pb-ledger.svg")).ok()).toBeTruthy();
    for (const pageName of ["dashboard", "billing", "bills", "customers"]) {
        expect((await page.request.get(`/pages/${pageName}.html`)).ok()).toBeTruthy();
    }
    const productPageResponse = await page.request.get("/pages/products.html");
    expect(productPageResponse.ok()).toBeTruthy();
    expect(await productPageResponse.text()).toContain('id="page-products"');
    await expect(page.locator("#page-dashboard")).toBeAttached();
    await expect(page.locator("#page-products")).toHaveCount(0);
    await expect(page.locator("#latest-products")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Products" })).toHaveCount(0);
    const sidebarToggle = page.locator("#sidebar-toggle");
    await expect(sidebarToggle).toHaveAttribute("aria-expanded", "true");
    await sidebarToggle.click();
    await expect(page.locator(".app")).toHaveClass(/sidebar-collapsed/);
    await expect(sidebarToggle).toHaveAttribute("aria-expanded", "false");
    await expect(sidebarToggle).toHaveAttribute("aria-label", "Show sidebar");
    await sidebarToggle.click();
    await expect(page.locator(".app")).not.toHaveClass(/sidebar-collapsed/);
    const primaryButton = page.locator("#page-dashboard .button.primary");
    const initialTheme = await page.locator("html").getAttribute("data-theme");
    const initialButtonColor = await primaryButton.evaluate((button) => getComputedStyle(button).backgroundColor);
    await page.locator("#theme-toggle").click();
    const toggledTheme = await page.locator("html").getAttribute("data-theme");
    const toggledButtonColor = await primaryButton.evaluate((button) => getComputedStyle(button).backgroundColor);
    expect(toggledTheme).not.toBe(initialTheme);
    expect(toggledButtonColor).toBe(initialButtonColor);
    expect(manifest.icons.some((icon: { src: string }) => icon.src === "/icons/icon-192.png")).toBeTruthy();
    expect((await page.request.get("/icons/icon-192.png")).ok()).toBeTruthy();
    expect((await page.request.get("/vendor/bootstrap.min.css")).ok()).toBeTruthy();
    expect((await page.request.get("/vendor/bootstrap-icons/bootstrap-icons.min.css")).ok()).toBeTruthy();
    expect((await page.request.get("/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2")).ok()).toBeTruthy();
    expect((await page.request.get("/bill-pdf.js")).ok()).toBeTruthy();
    expect((await page.request.get("/icons/pb-ledger.svg")).ok()).toBeTruthy();
    await expect(page.locator("#save-button")).toHaveClass(/btn/);
    await expect(page.locator(".sidebar .nav-button.active .bi")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check("16px bootstrap-icons"))).toBeTruthy();
    const wordExamples = await page.evaluate(() => {
        const billPdf = (window as Window & { BillPdf: { amountInWords: (value: number) => string } }).BillPdf;
        return [
            billPdf.amountInWords(102000),
            billPdf.amountInWords(1250.5),
            billPdf.amountInWords(99999999999),
        ];
    });
    expect(wordExamples).toEqual([
        "Rupees One Lakh Two Thousand Only",
        "Rupees One Thousand Two Hundred Fifty and Paise Fifty Only",
        "Rupees Ninety Nine Arab Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Only",
    ]);
});

test("adds, edits, and deletes manually entered bill items", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create a bill" }).click();
    await expect(page.locator("#item-rows .item-row")).toHaveCount(0);

    await page.locator("#add-item").click();
    await expect(page.locator("#item-rows select")).toHaveCount(0);
    const fields = [
        page.locator('#item-rows input[data-field="productName"]'),
        page.locator('#item-rows input[data-field="productCode"]'),
        page.locator('#item-rows input[data-field="imei"]'),
        page.locator('#item-rows input[data-field="amount"]'),
    ];
    for (const field of fields) await expect(field).toHaveAttribute("required", "");
    await fields[0].fill("Manual Phone");
    await fields[1].fill("MAN-001");
    await fields[2].fill("123456789012345");
    await fields[3].fill("1250");
    await page.getByRole("button", { name: "Save item" }).click();

    let row = page.locator("#added-items-body tr").first();
    await expect(row.locator("td")).toHaveText(["1", "Manual Phone", "MAN-001", "123456789012345", "₹1,250.00", ""]);
    await row.getByRole("button", { name: "Edit Manual Phone" }).click();
    await expect(page.locator('#item-rows input[data-field="productName"]')).toHaveValue("Manual Phone");
    await page.locator('#item-rows input[data-field="amount"]').fill("1800");
    await page.getByRole("button", { name: "Save item" }).click();
    row = page.locator("#added-items-body tr").first();
    await expect(row.locator("td").nth(4)).toHaveText("₹1,800.00");
    await row.getByRole("button", { name: "Delete Manual Phone" }).click();
    await expect(page.locator("#added-items-body")).toContainText("No items added yet.");
});

test("announces validation errors inline", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: "Create a bill" }).click();
    await page.locator("#save-button").click();

    await expect(page.locator("#form-message")).toHaveText("Please correct the highlighted fields.");
    await expect(page.locator("#form-message")).toHaveAttribute("role", "alert");
    await expect(page.locator("#customer-select").locator("..").locator(".field-error")).toBeVisible();
});

test("previews a draft and downloads a readable PDF", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create new bill" }).click();
    await page.locator("#bill-number").fill("DRAFT-100");
    await page.locator("#bill-date").fill("2026-11-24");
    await page.locator("#customer-select").selectOption("1");
    await page.locator("#add-item").click();
    await page.locator('.item-row input[data-field="productName"]').fill("Sample Phone");
    await page.locator('.item-row input[data-field="productCode"]').fill("P001");
    await page.locator('.item-row input[data-field="imei"]').fill("123456789012345");
    await page.locator('.item-row input[data-field="amount"]').fill("1250");
    await page.getByRole("button", { name: "Save item" }).click();
    await page.getByRole("button", { name: "Preview bill" }).click();

    await expect(page.locator("#preview-dialog")).toBeVisible();
    await expect(page.locator("#preview-content")).toContainText("DRAFT-100");
    await expect(page.locator("#preview-content")).toContainText("Sample Customer");
    await expect(page.locator("#preview-content .preview-items")).toContainText("Product Name");
    await expect(page.locator("#preview-content .preview-items")).toContainText("P001");
    await expect(page.locator("#preview-content .bill-print-header")).toContainText("Pabitra's Online Services");
    await expect(page.locator("#preview-content .bill-amount-words")).toContainText("Rupees One Thousand Two Hundred Fifty Only");

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#download-preview").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("pb-ledger-DRAFT-100.pdf");
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
    expect(download.suggestedFilename()).toBe("pb-ledger-INV-40.pdf");
    const path = await download.path();
    expect(path).toBeTruthy();
    const pdf = await readFile(path!);
    const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pageCount).toBeGreaterThan(1);
});
