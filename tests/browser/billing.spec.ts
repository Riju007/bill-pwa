import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("loads the PB Ledger shell, page templates, local framework, and install icons", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    await expect(page).toHaveTitle("PB Ledger");
    await expect(page.locator(".brand-name")).toHaveText("PB Ledger");
    await expect(page.locator(".business-heading-name")).toHaveText("Pabitra's Online Services");
    await expect(page.locator(".business-heading-type")).toHaveText("ONLINE MOBILE WHOLESALE");
    await expect(page.locator(".business-heading-address")).toHaveText("Arambagh Link Road, West Bengal");
    const headerCenter = await page.locator(".business-heading").evaluate((heading) => {
        const headingRect = heading.getBoundingClientRect();
        const headerRect = heading.parentElement!.getBoundingClientRect();
        return Math.abs(headingRect.left + headingRect.width / 2 - (headerRect.left + headerRect.width / 2));
    });
    expect(headerCenter).toBeLessThan(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".business-heading")).toBeVisible();
    const mobileHeaderCenter = await page.locator(".business-heading").evaluate((heading) => {
        const headingRect = heading.getBoundingClientRect();
        const headerRect = heading.parentElement!.getBoundingClientRect();
        return Math.abs(headingRect.left + headingRect.width / 2 - (headerRect.left + headerRect.width / 2));
    });
    expect(mobileHeaderCenter).toBeLessThan(2);
    await page.setViewportSize({ width: 1280, height: 800 });
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
    expect(await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor)).toBe("rgb(8, 9, 11)");
    const themeIconAlignment = await page.locator("#theme-toggle .bi").evaluate((icon) => {
        const iconRect = icon.getBoundingClientRect();
        const buttonRect = icon.parentElement!.getBoundingClientRect();
        return Math.abs(iconRect.top + iconRect.height / 2 - (buttonRect.top + buttonRect.height / 2));
    });
    expect(themeIconAlignment).toBeLessThan(2);
    expect(manifest.icons.some((icon: { src: string }) => icon.src === "/icons/icon-192.png")).toBeTruthy();
    expect((await page.request.get("/icons/icon-192.png")).ok()).toBeTruthy();
    expect((await page.request.get("/vendor/bootstrap.min.css")).ok()).toBeTruthy();
    expect((await page.request.get("/vendor/bootstrap-icons/bootstrap-icons.min.css")).ok()).toBeTruthy();
    expect((await page.request.get("/vendor/fonts/NotoSans-Variable.ttf")).ok()).toBeTruthy();
    expect((await page.request.get("/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2")).ok()).toBeTruthy();
    expect((await page.request.get("/bill-pdf.js")).ok()).toBeTruthy();
    expect((await page.request.get("/icons/pb-ledger.svg")).ok()).toBeTruthy();
    await expect(page.locator("#save-button")).toHaveClass(/btn/);
    await expect(page.locator(".sidebar .nav-button.active .bi")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check("16px bootstrap-icons"))).toBeTruthy();
    await page.evaluate(() => document.fonts.load('600 16px "Noto Sans"'));
    expect(await page.evaluate(() => document.fonts.check('600 16px "Noto Sans"'))).toBeTruthy();
    expect(await page.locator("body").evaluate((body) => getComputedStyle(body).fontFamily)).toContain('"Noto Sans"');
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
    await expect(page.getByRole("button", { name: "Scan IMEI barcode" })).toHaveCount(1);
    await fields[0].fill("Manual Phone");
    await fields[1].fill("MAN-001");
    await fields[2].fill("12345678901234A");
    await expect(fields[2]).toHaveValue("12345678901234");
    await fields[3].fill("999");
    const addItemAction = page.locator("#item-rows .draft-action.accept");
    const cancelItemAction = page.locator("#item-rows .draft-action.reject");
    await expect(addItemAction).toHaveText("Add item");
    await expect(cancelItemAction).toHaveText("Cancel");
    expect(await addItemAction.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe("rgb(20, 122, 85)");
    expect(await cancelItemAction.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe("rgb(189, 71, 86)");
    await expect(page.locator("#item-rows .required-mark")).toHaveCount(4);
    const actionLayout = await page.locator(".item-row").evaluate((row) => {
        const actions = row.querySelector(".draft-actions")!.getBoundingClientRect();
        const itemFields = [...row.querySelectorAll(".item-field")];
        const fieldsBottom = Math.max(...itemFields.map((field) => field.getBoundingClientRect().bottom));
        const buttons = [...row.querySelectorAll(".draft-action")].map((button) => button.getBoundingClientRect());
        return {
            actionsTop: actions.top,
            actionsRight: actions.right,
            actionsWidth: actions.width,
            fieldsBottom,
            rowRight: row.getBoundingClientRect().right,
            buttonWidths: buttons.map((button) => button.width),
        };
    });
    expect(actionLayout.actionsTop).toBeGreaterThanOrEqual(actionLayout.fieldsBottom);
    expect(actionLayout.actionsRight).toBeLessThanOrEqual(actionLayout.rowRight);
    expect(Math.abs(actionLayout.buttonWidths[0] - actionLayout.buttonWidths[1])).toBeLessThan(1);
    expect(actionLayout.buttonWidths[0] + actionLayout.buttonWidths[1]).toBeGreaterThan(actionLayout.actionsWidth - 10);
    const amountTopBeforeValidation = await page.locator(".item-row").evaluate((row) => {
        const amount = row.querySelector('input[data-field="amount"]')!;
        return amount.getBoundingClientRect().top - row.getBoundingClientRect().top;
    });
    await page.locator("#item-rows .draft-action.accept").click();
    await expect(page.locator('.item-field:has(input[data-field="imei"]) .item-field-error'))
        .toHaveText("IMEI must be exactly 15 digits (0-9 only).");
    await expect(page.locator('.item-field:has(input[data-field="amount"]) .item-field-error'))
        .toHaveText("Amount must be between ₹1,000 and ₹5,00,000.");
    const amountTopAfterValidation = await page.locator(".item-row").evaluate((row) => {
        const amount = row.querySelector('input[data-field="amount"]')!;
        return amount.getBoundingClientRect().top - row.getBoundingClientRect().top;
    });
    expect(Math.abs(amountTopAfterValidation - amountTopBeforeValidation)).toBeLessThan(1);
    await fields[2].fill("123456789012345");
    await fields[3].fill("1250");
    await page.locator("#item-rows .draft-action.accept").click();

    let row = page.locator("#added-items-body tr").first();
    await expect(row.locator("td")).toHaveText(["1", "Manual Phone", "MAN-001", "123456789012345", "₹1,250.00", ""]);
    await page.locator("#add-item").click();
    await page.locator('#item-rows input[data-field="productName"]').fill("Duplicate Phone");
    await page.locator('#item-rows input[data-field="productCode"]').fill("MAN-002");
    await page.locator('#item-rows input[data-field="imei"]').fill("123456789012345");
    await page.locator('#item-rows input[data-field="amount"]').fill("1500");
    await page.locator("#item-rows .draft-action.accept").click();
    await expect(page.locator('.item-field:has(input[data-field="imei"]) .item-field-error'))
        .toHaveText("This IMEI is already used by another item in this bill.");
    await page.locator("#item-rows .draft-action.reject").click();

    await row.getByRole("button", { name: "Edit Manual Phone" }).click();
    await expect(page.locator('#item-rows input[data-field="productName"]')).toHaveValue("Manual Phone");
    await page.locator('#item-rows input[data-field="amount"]').fill("1800");
    await page.getByRole("button", { name: "Save changes" }).click();
    row = page.locator("#added-items-body tr").first();
    await expect(row.locator("td").nth(4)).toHaveText("₹1,800.00");
    await row.getByRole("button", { name: "Delete Manual Phone" }).click();
    await expect(page.locator("#added-items-body")).toContainText("No items added yet.");
});

test("scans a 15-digit IMEI barcode into the item form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create a bill" }).click();
    await page.locator("#add-item").click();
    await page.evaluate(() => {
        Object.defineProperty(window, "BarcodeDetector", {
            configurable: true,
            value: class {
                static async getSupportedFormats() {
                    return ["code_128"];
                }

                async detect() {
                    return [{ rawValue: "IMEI: 123456789012345" }];
                }
            },
        });
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: { getUserMedia: async () => new MediaStream() },
        });
        Object.defineProperty(HTMLMediaElement.prototype, "play", {
            configurable: true,
            value: () => Promise.resolve(),
        });
    });

    await page.getByRole("button", { name: "Scan IMEI barcode" }).click();
    await expect(page.locator('#item-rows input[data-field="imei"]')).toHaveValue("123456789012345");
    await expect(page.locator("#imei-scanner-dialog")).not.toBeVisible();
    await expect(page.locator("#toast-region")).toContainText("IMEI scanned.");
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
    await page.locator("#item-rows .draft-action.accept").click();
    await page.getByRole("button", { name: "Preview bill" }).click();

    await expect(page.locator("#preview-dialog")).toBeVisible();
    await expect(page.locator("#preview-content")).toContainText("DRAFT-100");
    await expect(page.locator("#preview-content")).toContainText("Sample Customer");
    await expect(page.locator("#preview-content .preview-meta")).not.toContainText("Payment due date");
    await expect(page.locator("#preview-content .preview-items")).toContainText("Product Name");
    await expect(page.locator("#preview-content .preview-items")).toContainText("P001");
    await expect(page.locator("#preview-content .bill-print-header")).toContainText("Pabitra's Online Services");
    await expect(page.locator("#preview-content .bill-amount-words")).toContainText("Rupees One Thousand Two Hundred Fifty Only");
    await expect(page.locator("#preview-content .preview-items th:first-child")).toHaveCSS("position", "sticky");
    await expect(page.locator("#preview-content .preview-items th:first-child")).toHaveCSS("left", "0px");

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

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
        Object.defineProperty(navigator, "canShare", {
            configurable: true,
            value: (data: { files?: File[] }) => Boolean(data.files?.length),
        });
        Object.defineProperty(navigator, "share", {
            configurable: true,
            value: async (data: { files: File[] }) => {
                (window as Window & { sharedPdfName?: string }).sharedPdfName = data.files[0].name;
            },
        });
    });
    await page.locator("#share-preview").click();
    await expect(page.locator("#preview-feedback")).toHaveText("PDF shared. Choose WhatsApp from the share menu.");
    expect(await page.evaluate(() => (window as Window & { sharedPdfName?: string }).sharedPdfName))
        .toBe("pb-ledger-DRAFT-100.pdf");

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

test("expands the PDF bill-to block for long addresses", async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
        type PdfApi = {
            autoTable(this: unknown, options: { startY: number }): unknown;
            save(this: unknown, ...args: unknown[]): unknown;
        };
        const pdfWindow = window as Window & {
            jspdf: { jsPDF: { API: PdfApi } };
            BillPdf: { download: (bill: Record<string, unknown>) => Promise<void> };
        };
        const api = pdfWindow.jspdf.jsPDF.API;
        const originalAutoTable = api.autoTable;
        const originalSave = api.save;
        const starts: number[] = [];
        api.autoTable = function (options) {
            starts.push(options.startY);
            return originalAutoTable.call(this, options);
        };
        api.save = function () {
            return this;
        };
        const bill = {
            billNo: "LAYOUT-TEST",
            billDate: "2026-11-24",
            dueDate: null,
            customerName: "Sample Customer",
            customerMobile: "9876543210",
            items: [{ productName: "Phone", productCode: "P001", imei: "123456789012345", amount: 1200 }],
            total: 1200,
            paid: 0,
            due: 1200,
        };
        try {
            await pdfWindow.BillPdf.download({ ...bill, customerAddress: "Short Road" });
            await pdfWindow.BillPdf.download({ ...bill, customerAddress: "Long address, ".repeat(20) });
            return starts;
        } finally {
            api.autoTable = originalAutoTable;
            api.save = originalSave;
        }
    });

    expect(result[1]).toBeGreaterThan(result[0]);
});

test("creates a customer from the directory and shows a confirmation", async ({ page }) => {
    await page.goto("/");
    await page.locator('.sidebar [data-page="customers"]').click();
    await page.locator("#new-customer-button").click();
    await expect(page.locator("#customer-dialog")).toBeVisible();
    await page.locator("#new-customer-name").fill("New Customer Test");
    await expect(page.locator("#new-customer-mobile")).toHaveAttribute("required", "");
    await expect(page.locator("#new-customer-address")).toHaveAttribute("maxlength", "200");
    await page.locator("#save-customer-button").click();
    await expect(page.locator("#customer-dialog")).toBeVisible();
    await expect(page.locator("#new-customer-mobile")).toHaveAttribute("aria-invalid", "true");
    await page.locator("#new-customer-mobile").fill("9000000000");
    await page.locator("#save-customer-button").click();

    await expect(page.locator("#customer-dialog")).not.toBeVisible();
    await expect(page.locator("#customer-list")).toContainText("New Customer Test");
    await expect(page.locator("#toast-region .app-toast")).toContainText("Customer saved successfully.");
    await page.locator('.sidebar [data-page="create"]').click();
    await expect(page.locator("#customer-select")).toContainText("New Customer Test");
});

test("customer names open a detail popup with the creation date", async ({ page }) => {
    await page.goto("/");
    await page.locator('.sidebar [data-page="customers"]').click();
    await expect(page.locator("#page-customers thead th")).toHaveText([
        "Name",
        "Customer code",
        "Mobile",
        "Address",
        "Actions",
    ]);

    const name = page.locator("#customer-list .customer-name-link");
    await expect(name).toHaveText("Sample Customer");
    const address = page.locator("#customer-list .customer-address-cell");
    await expect(address).toHaveAttribute("title", /Example Road/);
    await expect(address).toHaveCSS("text-overflow", "ellipsis");
    await name.click();

    await expect(page.locator("#customer-detail-dialog")).toBeVisible();
    await expect(page.locator("#customer-detail-content")).toContainText("9876543210");
    await expect(page.locator("#customer-detail-content")).toContainText("Example Road");
    await expect(page.locator("#customer-detail-content")).toContainText("Created on");
    await expect(page.locator("#customer-detail-content")).toContainText("23 Nov 2026");
});

test("customer directory paginates results and resets pagination for search", async ({ page }) => {
    const customers = Array.from({ length: 12 }, (_, index) => ({
        id: index + 1,
        code: `C${String(index + 1).padStart(3, "0")}`,
        name: `Pagination Customer ${index + 1}`,
        mobile: `900000${String(index + 1).padStart(4, "0")}`,
        address: "Example Road",
    }));
    await page.route("**/api/customers?page=*", async (route) => {
        const url = new URL(route.request().url());
        const query = url.searchParams.get("q")?.toLowerCase();
        const matches = customers.filter((customer) => !query || customer.name.toLowerCase().includes(query));
        const pageSize = 10;
        const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
        const currentPage = Math.min(Number(url.searchParams.get("page")), pageCount);
        await route.fulfill({
            json: {
                items: matches.slice((currentPage - 1) * pageSize, currentPage * pageSize),
                page: currentPage,
                pageSize,
                total: matches.length,
                pageCount,
            },
        });
    });
    await page.goto("/");
    await page.locator('.sidebar [data-page="customers"]').click();

    await expect(page.locator("#customer-list tr")).toHaveCount(10);
    await expect(page.locator("#customer-page-status")).toContainText("Page 1 of 2");
    await expect(page.locator("#customer-previous-page")).toBeDisabled();
    await page.locator("#customer-next-page").click();
    await expect(page.locator("#customer-list tr")).toHaveCount(2);
    await expect(page.locator("#customer-list")).toContainText("Pagination Customer 11");
    await expect(page.locator("#customer-page-status")).toContainText("Page 2 of 2");
    await page.locator("#customer-search").fill("Pagination Customer 12");
    await expect(page.locator("#customer-list tr")).toHaveCount(1);
    await expect(page.locator("#customer-page-status")).toContainText("Page 1 of 1");
    await expect(page.locator("#customer-pagination")).toBeHidden();
});

test("shows customer totals and every bill item across multiple bills", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#recent-bills").locator("..")).toContainText("Due date");
    await expect(page.locator("#recent-bills")).toContainText("02 Dec 2026");
    const customerCard = page.locator(".customer-billing-card");
    await expect(customerCard).toContainText("2 bills");
    await expect(customerCard).toContainText("₹49,500.00");
    await expect(customerCard).toContainText("₹10,500.00");
    await expect(customerCard).toContainText("₹39,000.00");
    await customerCard.locator("summary").click();
    await expect(customerCard).toContainText("INV-41");
    await expect(customerCard).toContainText("Second Phone");
    await expect(customerCard).toContainText("222222222222222");
    await expect(customerCard).toContainText("Sample Phone 40");
});

test("refreshes the bill summary when editing a saved bill", async ({ page }) => {
    await page.goto("/");
    await page.locator('.sidebar [data-page="bills"]').click();
    await page.getByRole("button", { name: "Edit bill INV-40" }).click();

    await expect(page.locator("#create-title")).toHaveText("Edit bill INV-40");
    await expect(page.locator("#item-count")).toHaveText("40");
    await expect(page.locator("#bill-total")).toHaveText("₹48,000.00");
    await expect(page.locator("#paid-amount")).toHaveValue("10000");
    await expect(page.locator("#bill-due")).toHaveText("₹38,000.00");
});

test("suggests saved product names and codes below their inputs without restricting manual entry", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create a bill" }).click();
    await page.locator("#add-item").click();

    const productName = page.locator('#item-rows input[data-field="productName"]');
    await productName.fill("sample");
    const nameSuggestions = page.locator('.item-field:has(input[data-field="productName"]) .item-suggestions');
    await expect(nameSuggestions).toBeVisible();
    await expect(nameSuggestions.getByRole("option", { name: "Sample Phone" })).toBeVisible();
    const nameInputBounds = await productName.boundingBox();
    const namePopupBounds = await nameSuggestions.boundingBox();
    expect(nameInputBounds).not.toBeNull();
    expect(namePopupBounds).not.toBeNull();
    expect(namePopupBounds!.y).toBeGreaterThanOrEqual(nameInputBounds!.y + nameInputBounds!.height);
    expect(Math.abs(namePopupBounds!.x - nameInputBounds!.x)).toBeLessThan(1);
    await nameSuggestions.getByRole("option", { name: "Sample Phone" }).click();
    await expect(productName).toHaveValue("Sample Phone");

    const productCode = page.locator('#item-rows input[data-field="productCode"]');
    await productCode.fill("P0");
    const codeSuggestions = page.locator('.item-field:has(input[data-field="productCode"]) .item-suggestions');
    await expect(codeSuggestions).toBeVisible();
    await expect(codeSuggestions.getByRole("option")).toHaveCount(2);
    const codeInputBounds = await productCode.boundingBox();
    const codePopupBounds = await codeSuggestions.boundingBox();
    expect(codeInputBounds).not.toBeNull();
    expect(codePopupBounds).not.toBeNull();
    expect(codePopupBounds!.y).toBeGreaterThanOrEqual(codeInputBounds!.y + codeInputBounds!.height);
    expect(Math.abs(codePopupBounds!.x - codeInputBounds!.x)).toBeLessThan(1);
    await productCode.fill("CUSTOM-CODE");
    await expect(productCode).toHaveValue("CUSTOM-CODE");
});
