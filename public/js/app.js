const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
});
const form = document.querySelector("#bill-form");
const itemRows = document.querySelector("#item-rows");
const message = document.querySelector("#form-message");
const customerSelect = document.querySelector("#customer-select");
const money = (value) => currency.format(Number(value) || 0);
let customers = [];
let products = [];
let productCodes = [];
let productNames = [];
let addedItems = [];
let customerSearchTimer;
let productSearchTimer;
let itemSearchTimer;
let customerDirectoryQuery = "";
let customerDirectoryPage = 1;
let billDirectoryQuery = "";
let billDirectoryPage = 1;
let productDirectoryQuery = "";
let productDirectoryPage = 1;
let itemDirectoryQuery = "";
let itemDirectoryPage = 1;
let imeiScanStream = null;
let imeiScanFrame = null;
let imeiScanToken = 0;
let editingBillId = null;
let formSavedBillData = null;
let savedBillSnapshot = null;
let previewBillData = null;
let savedBillData = null;
let confirmResolver = null;
const themeToggle = document.querySelector("#theme-toggle");
const sidebar = document.querySelector("#app-sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");

function setTheme(theme, persist = false) {
    const dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    themeToggle.setAttribute("aria-pressed", String(dark));
    themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} theme`);
    themeToggle.title = `Switch to ${dark ? "light" : "dark"} theme`;
    themeToggle.innerHTML = dark
        ? '<i class="bi bi-sun" aria-hidden="true"></i><span class="theme-toggle-label">Light theme</span>'
        : '<i class="bi bi-moon" aria-hidden="true"></i><span class="theme-toggle-label">Dark theme</span>';
    document.querySelector('meta[name="theme-color"]').content = dark ? "#08090b" : "#f5f8f6";
    if (persist) localStorage.setItem("billwise-theme", dark ? "dark" : "light");
}

setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
themeToggle.addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
});

function setSidebarVisible(visible) {
    document.querySelector(".app").classList.toggle("sidebar-collapsed", !visible);
    sidebar.inert = !visible;
    sidebar.setAttribute("aria-hidden", String(!visible));
    sidebarToggle.setAttribute("aria-expanded", String(visible));
    const label = `${visible ? "Hide" : "Show"} sidebar`;
    sidebarToggle.setAttribute("aria-label", label);
    sidebarToggle.title = label;
    sidebarToggle.innerHTML = `<i class="bi ${visible ? "bi-layout-sidebar-inset" : "bi-layout-sidebar"}" aria-hidden="true"></i>`;
}

sidebarToggle.addEventListener("click", () => {
    setSidebarVisible(sidebarToggle.getAttribute("aria-expanded") !== "true");
});

async function api(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
        },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.error || `Request failed (${response.status})`);
    }
    return payload;
}

function setMessage(text, kind = "") {
    message.textContent = text;
    message.className = `form-message${kind ? ` ${kind}` : ""}`;
    message.setAttribute("role", kind === "error" ? "alert" : "status");
}

function showToast(text, kind = "success") {
    if (!text) return;
    const region = document.querySelector("#toast-region");
    const toast = document.createElement("div");
    toast.className = `app-toast${kind ? ` ${kind}` : ""}`;
    toast.setAttribute("role", kind === "error" ? "alert" : "status");

    const message = document.createElement("span");
    message.textContent = text;
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "toast-dismiss";
    dismiss.setAttribute("aria-label", "Dismiss notification");
    dismiss.textContent = "×";
    toast.append(message, dismiss);
    region.append(toast);

    const timeout = window.setTimeout(() => toast.remove(), 5000);
    dismiss.addEventListener("click", () => {
        window.clearTimeout(timeout);
        toast.remove();
    });
}

function fieldIsValid(field) {
    return field.validity.valid && !(field.required && !String(field.value).trim());
}

function validateItemRow(row, focusInvalid = true) {
    const fields = [...row.querySelectorAll("input, select, textarea")].filter((field) => field.willValidate);
    const editingIndex = row.dataset.editingIndex === undefined ? null : Number(row.dataset.editingIndex);
    const errors = new Map(fields.map((field) => [field, itemFieldError(field, editingIndex)]));
    const invalidFields = fields.filter((field) => errors.get(field));
    for (const field of fields) {
        const error = field.closest(".item-field").querySelector(".item-field-error");
        error.textContent = errors.get(field);
        error.hidden = !errors.get(field);
        if (error.hidden) {
            field.removeAttribute("aria-invalid");
            field.removeAttribute("aria-describedby");
        } else {
            field.setAttribute("aria-invalid", "true");
            field.setAttribute("aria-describedby", error.id);
        }
    }

    if (focusInvalid && invalidFields[0]) invalidFields[0].focus();
    return invalidFields.length === 0;
}

function itemFieldError(field, editingIndex = null) {
    const value = String(field.value).trim();
    const label = field.closest(".item-field").querySelector("label").textContent.replace(/\s*\*$/, "").trim();

    if (field.dataset.field === "imei") {
        if (!value) return "IMEI is required and must be exactly 15 digits (0-9 only).";
        if (!/^\d{15}$/.test(value)) return "IMEI must be exactly 15 digits (0-9 only).";
        return addedItems.some((item, index) => index !== editingIndex && item.imei === value)
            ? "This IMEI is already used by another item in this bill."
            : "";
    }
    if (field.dataset.field === "amount" && field.validity.badInput) return "Enter a valid amount.";
    if (!value) return `${label} is required.`;
    if (field.dataset.field === "amount") {
        if (!Number.isFinite(Number(value))) return "Enter a valid amount.";
        const amount = Number(value);
        if (amount < 1000 || amount > 500000) return "Amount must be between ₹1,000 and ₹5,00,000.";
        if (field.validity.stepMismatch) return "Amount can include up to 2 decimal places.";
    }
    if (!field.validity.valid) return field.validationMessage || `${label} is invalid.`;
    return "";
}

function validateFormFields(target, focusInvalid = true, markAttempt = true) {
    if (markAttempt) target.dataset.validationAttempted = "true";
    let firstInvalid = null;
    const rows = new Set();
    for (const field of target.querySelectorAll("input, select, textarea")) {
        if (!field.willValidate) continue;
        const invalid = !fieldIsValid(field);
        if (invalid && !firstInvalid) firstInvalid = field;
        if (invalid) field.setAttribute("aria-invalid", "true");
        else field.removeAttribute("aria-invalid");

        const group = field.closest(".field, .summary-paid");
        if (group) {
            let error = group.querySelector(".field-error");
            if (!error) {
                error = document.createElement("span");
                error.className = "field-error";
                error.id = `${field.id || "field"}-error`;
                error.setAttribute("role", "alert");
                group.append(error);
            }
            error.textContent = field.validationMessage || "This field is required.";
            error.hidden = !invalid;
            if (error.hidden) field.removeAttribute("aria-describedby");
            else field.setAttribute("aria-describedby", error.id);
        } else {
            const row = field.closest(".item-row");
            if (row) rows.add(row);
        }
    }

    for (const row of rows) {
        validateItemRow(row, false);
    }

    if (focusInvalid && firstInvalid) firstInvalid.focus();
    return !firstInvalid;
}

function enableLiveValidation(target) {
    const refresh = () => {
        if (target.dataset.validationAttempted !== "true") return;
        const valid = validateFormFields(target, false, false);
        if (valid) {
            const status = target.querySelector(".dialog-message");
            if (status) status.textContent = "";
            if (target === form) setMessage("");
        }
    };
    target.addEventListener("input", refresh);
    target.addEventListener("change", refresh);
    target.addEventListener("reset", () => {
        delete target.dataset.validationAttempted;
        queueMicrotask(() => {
            for (const field of target.querySelectorAll("[aria-invalid]")) {
                field.removeAttribute("aria-invalid");
                field.removeAttribute("aria-describedby");
            }
            target.querySelectorAll(".field-error, .item-validation").forEach((error) => {
                error.hidden = true;
            });
        });
    });
}

function setOperationFeedback(selector, text, kind = "") {
    const target = document.querySelector(selector);
    target.textContent = text;
    target.className = `operation-feedback${kind ? ` ${kind}` : ""}`;
    target.setAttribute("role", kind === "error" ? "alert" : "status");
    showToast(text, kind || "success");
}

enableLiveValidation(form);
enableLiveValidation(document.querySelector("#customer-form"));
enableLiveValidation(document.querySelector("#product-form"));

async function saveDirectoryEntry(event, options) {
    event.preventDefault();
    const target = event.currentTarget;
    const button = document.querySelector(options.button);
    const status = document.querySelector(options.status);
    const recordId = target.dataset.recordId;
    const buttonText = recordId ? options.updateText : options.buttonText;
    if (!validateFormFields(target)) {
        status.textContent = "Please correct the highlighted fields.";
        return;
    }

    status.textContent = "";
    button.disabled = true;
    button.textContent = options.savingText;

    try {
        await api(recordId ? `${options.endpoint}/${encodeURIComponent(recordId)}` : options.endpoint, {
            method: recordId ? "PUT" : "POST",
            body: JSON.stringify(Object.fromEntries(new FormData(target))),
        });
    } catch (error) {
        status.textContent = error.message;
        showToast(error.message, "error");
        button.disabled = false;
        button.textContent = buttonText;
        return;
    }

    target.reset();
    delete target.dataset.recordId;
    document.querySelector(options.dialog).close();
    document.querySelector(options.search).value = "";
    await options.reload();
    let refreshError = "";
    try {
        await loadLookups();
        await loadDashboard();
    } catch (error) {
        refreshError = error.message;
    }
    button.disabled = false;
    button.textContent = buttonText;
    setOperationFeedback(
        options.feedback,
        refreshError ? `${options.entity} saved, but billing data could not refresh: ${refreshError}` : `${options.entity} saved successfully.`,
        refreshError ? "error" : "success",
    );
}

function setNavigation(page) {
    document.querySelectorAll(".page").forEach((section) => {
        section.classList.toggle("active", section.id === `page-${page}`);
    });
    document.querySelectorAll(".nav-button[data-page]").forEach((button) => {
        const active = button.dataset.page === page;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
    if (page === "bills") loadBills(billDirectoryQuery, billDirectoryPage);
    if (page === "dashboard") loadDashboard();
    if (page === "customers") {
        loadCustomerDirectory(document.querySelector("#customer-search").value.trim());
    }
    if (page === "products") {
        loadItemDirectory(itemDirectoryQuery, itemDirectoryPage);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function itemInput(field, placeholder, type = "text") {
    const input = document.createElement("input");
    input.className = "form-control";
    input.type = type;
    input.dataset.field = field;
    input.placeholder = placeholder;
    input.setAttribute("aria-label", placeholder);
    input.required = true;
    input.setAttribute("aria-required", "true");
    if (field === "productName") input.maxLength = 100;
    if (field === "productCode") input.maxLength = 20;
    if (field === "amount") {
        input.min = "1000";
        input.max = "500000";
        input.step = "0.01";
        input.inputMode = "decimal";
    }
    if (field === "imei") {
        input.minLength = 15;
        input.maxLength = 15;
        input.inputMode = "numeric";
        input.pattern = "[0-9]{15}";
    }
    /*
    if (field === "productName") {
        const select = document.createElement("select");
        select.className = "form-select";
        select.dataset.field = "productName";
        select.required = true;
        select.setAttribute("aria-required", "true");
        select.setAttribute("aria-label", "Product");
        select.add(new Option("Select a product", ""));
        for (const product of products) {
            select.add(new Option(product.code ? `${product.name} (${product.code})` : product.name, String(product.id)));
        }
        select.addEventListener("change", (event) => {
            const row = event.currentTarget.closest(".item-row");
            const product = products.find((entry) => String(entry.id) === event.currentTarget.value);
            const code = row.querySelector('[data-field="productCode"]');
            code.value = product?.code || "";
            updateTotals();
        });
        return select;
    }
    if (field === "productCode") {
        input.maxLength = 20;
        input.readOnly = true;
        input.setAttribute("aria-label", "Selected product code");
    }
    if (field === "imei") {
        input.maxLength = 15;
        input.pattern = "[0-9]{15}";
    }
    */
    input.addEventListener("input", () => {
        if (field === "imei") input.value = input.value.replace(/[^0-9]/g, "").slice(0, 15);
        updateTotals();
    });
    return input;
}

function attachItemSuggestions(input, wrapper, field) {
    const list = document.createElement("div");
    list.className = "item-suggestions";
    list.id = `${input.id}-suggestions`;
    list.setAttribute("role", "listbox");
    list.hidden = true;
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("aria-expanded", "false");
    wrapper.append(list);

    let activeIndex = -1;
    let options = [];
    const hide = () => {
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        activeIndex = -1;
    };
    const select = (value) => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        hide();
        input.focus();
    };
    const render = () => {
        const source = field === "productName" ? productNames : productCodes;
        const query = input.value.trim().toLocaleLowerCase();
        options = query
            ? [...new Set(source)].filter((value) => value.toLocaleLowerCase().includes(query)).slice(0, 8)
            : [];
        list.replaceChildren();
        activeIndex = -1;
        input.removeAttribute("aria-activedescendant");
        if (!options.length) {
            hide();
            return;
        }

        options.forEach((value, index) => {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "item-suggestion";
            option.id = `${list.id}-option-${index}`;
            option.setAttribute("role", "option");
            option.setAttribute("aria-selected", "false");
            option.textContent = value;
            option.addEventListener("mousedown", (event) => event.preventDefault());
            option.addEventListener("click", () => select(value));
            list.append(option);
        });
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
    };

    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("blur", () => window.setTimeout(hide, 120));
    input.addEventListener("keydown", (event) => {
        if (list.hidden || !options.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            activeIndex = (activeIndex + direction + options.length) % options.length;
            const optionButtons = [...list.querySelectorAll(".item-suggestion")];
            optionButtons.forEach((option, index) => {
                const active = index === activeIndex;
                option.classList.toggle("active", active);
                option.setAttribute("aria-selected", String(active));
            });
            input.setAttribute("aria-activedescendant", optionButtons[activeIndex].id);
            optionButtons[activeIndex].scrollIntoView({ block: "nearest" });
        } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            select(options[activeIndex]);
        } else if (event.key === "Escape") {
            hide();
        }
    });
}

function stopImeiScanner() {
    imeiScanToken++;
    if (imeiScanFrame !== null) cancelAnimationFrame(imeiScanFrame);
    imeiScanFrame = null;
    if (imeiScanStream) imeiScanStream.getTracks().forEach((track) => track.stop());
    imeiScanStream = null;
    const video = document.querySelector("#imei-scanner-video");
    video.pause();
    video.srcObject = null;
}

async function startImeiScanner(input) {
    const BarcodeScanner = window.BarcodeDetector;
    if (typeof BarcodeScanner !== "function" || !navigator.mediaDevices?.getUserMedia) {
        showToast("Camera barcode scanning is not supported here. Enter the 15-digit IMEI manually.", "error");
        return;
    }

    let detector;
    try {
        if (typeof BarcodeScanner.getSupportedFormats === "function") {
            const available = await BarcodeScanner.getSupportedFormats();
            const formats = ["code_128", "qr_code", "data_matrix", "pdf417", "ean_13"]
                .filter((format) => available.includes(format));
            if (!formats.length) throw new Error("No supported IMEI barcode formats were found.");
            detector = new BarcodeScanner({ formats });
        } else {
            detector = new BarcodeScanner();
        }
    } catch (error) {
        showToast(`Could not initialize the barcode scanner: ${error.message}`, "error");
        return;
    }

    stopImeiScanner();
    const token = imeiScanToken;
    const dialog = document.querySelector("#imei-scanner-dialog");
    const video = document.querySelector("#imei-scanner-video");
    const status = document.querySelector("#imei-scanner-status");
    status.textContent = "Allow camera access, then point the camera at the IMEI barcode.";
    dialog.showModal();

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" } },
        });
        if (token !== imeiScanToken) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }
        imeiScanStream = stream;
        video.srcObject = stream;
        await video.play();
        status.textContent = "Point the camera at the 15-digit IMEI barcode.";

        const scanFrame = async () => {
            if (token !== imeiScanToken || !imeiScanStream) return;
            try {
                const barcodes = await detector.detect(video);
                const rawValue = barcodes.find((barcode) => barcode.rawValue)?.rawValue;
                if (rawValue) {
                    const digits = rawValue.replace(/\D/g, "");
                    if (/^\d{15}$/.test(digits)) {
                        input.value = digits;
                        input.dispatchEvent(new Event("input", { bubbles: true }));
                        stopImeiScanner();
                        dialog.close();
                        input.focus();
                        showToast("IMEI scanned.");
                        return;
                    }
                    status.textContent = "That barcode does not contain exactly 15 IMEI digits. Try another label.";
                }
            } catch (error) {
                if (token === imeiScanToken) {
                    stopImeiScanner();
                    dialog.close();
                    showToast(`Could not scan the barcode: ${error.message}`, "error");
                }
                return;
            }
            if (token === imeiScanToken) imeiScanFrame = requestAnimationFrame(scanFrame);
        };
        scanFrame();
    } catch (error) {
        if (token === imeiScanToken) {
            stopImeiScanner();
            dialog.close();
            showToast(`Could not access the camera: ${error.message}`, "error");
        }
    }
}

function addItem(values = {}, editingIndex = null) {
    const existingRow = itemRows.firstElementChild;
    if (existingRow) {
        existingRow.querySelector("input")?.focus();
        return;
    }

    const row = document.createElement("div");
    row.className = "item-row";
    if (editingIndex !== null) row.dataset.editingIndex = String(editingIndex);
    const addField = (field, label, control) => {
        const wrapper = document.createElement("div");
        wrapper.className = "item-field";
        const labelElement = document.createElement("label");
        const controlId = `item-${Date.now()}-${field}`;
        labelElement.htmlFor = controlId;
        labelElement.append(document.createTextNode(label));
        const requiredMark = document.createElement("span");
        requiredMark.className = "required-mark";
        requiredMark.setAttribute("aria-hidden", "true");
        requiredMark.textContent = "*";
        labelElement.append(" ", requiredMark);
        control.id = controlId;
        const error = document.createElement("span");
        error.className = "field-error item-field-error";
        error.id = `${controlId}-error`;
        error.setAttribute("role", "alert");
        error.hidden = true;
        if (field === "imei") {
            const inputAction = document.createElement("div");
            inputAction.className = "item-input-action";
            const scan = document.createElement("button");
            scan.className = "imei-scan-button";
            scan.type = "button";
            scan.setAttribute("aria-label", "Scan IMEI barcode");
            scan.title = "Scan IMEI barcode";
            scan.innerHTML = '<i class="bi bi-upc-scan" aria-hidden="true"></i>';
            scan.addEventListener("click", () => startImeiScanner(control));
            inputAction.append(control, scan);
            wrapper.append(labelElement, inputAction, error);
        } else {
            wrapper.append(labelElement, control, error);
        }
        if (field === "productName" || field === "productCode") {
            attachItemSuggestions(control, wrapper, field);
        }
        row.append(wrapper);
    };

    addField("productName", "Product Name", itemInput("productName", "Enter product name"));
    addField("productCode", "Product Code", itemInput("productCode", "Enter product code"));
    addField("imei", "IMEI Number", itemInput("imei", "15 digits"));
    addField("amount", "Amount (₹)", itemInput("amount", "0.00", "number"));

    for (const field of ["productName", "productCode", "imei", "amount"]) {
        row.querySelector(`[data-field="${field}"]`).value = values[field] ?? "";
    }
    const actions = document.createElement("div");
    actions.className = "draft-actions";
    const save = document.createElement("button");
    save.className = "draft-action accept";
    save.type = "button";
    const saveLabel = editingIndex === null ? "Add item" : "Save changes";
    save.setAttribute("aria-label", saveLabel);
    save.title = saveLabel;
    const addIcon = document.createElement("i");
    addIcon.className = "bi bi-plus-lg";
    addIcon.setAttribute("aria-hidden", "true");
    const saveText = document.createElement("span");
    saveText.textContent = saveLabel;
    save.append(addIcon, saveText);
    save.addEventListener("click", () => {
        if (!validateItemRow(row)) {
            setMessage("Please complete all required item fields.", "error");
            return;
        }
        const item = {
            productName: row.querySelector('[data-field="productName"]').value.trim(),
            productCode: row.querySelector('[data-field="productCode"]').value.trim(),
            imei: row.querySelector('[data-field="imei"]').value.trim(),
            amount: Number(row.querySelector('[data-field="amount"]').value),
        };
        const action = editingIndex === null ? "added to" : "updated in";
        if (editingIndex === null) addedItems.push(item);
        else addedItems.splice(editingIndex, 1, item);
        row.remove();
        setMessage("");
        renderAddedItems();
        updateTotals();
        showToast(`${item.productName} ${action} the bill.`);
    });
    const cancel = document.createElement("button");
    cancel.className = "draft-action reject";
    cancel.type = "button";
    const cancelLabel = editingIndex === null ? "Cancel" : "Cancel edit";
    cancel.setAttribute("aria-label", cancelLabel);
    cancel.title = cancelLabel;
    const cancelIcon = document.createElement("i");
    cancelIcon.className = "bi bi-x-lg";
    cancelIcon.setAttribute("aria-hidden", "true");
    const cancelText = document.createElement("span");
    cancelText.textContent = cancelLabel;
    cancel.append(cancelIcon, cancelText);
    cancel.addEventListener("click", () => {
        row.remove();
        renderAddedItems();
        setMessage("");
        refreshSavedBillActions();
    });
    actions.append(save, cancel);
    row.append(actions);
    itemRows.append(row);
    updateTotals();
    updateItemLabels();
    renderAddedItems();
    if (form.dataset.validationAttempted === "true") validateFormFields(form, false, false);
    row.querySelector("input").focus();
}

function updateItemLabels() {
    const title = document.querySelector(".items-head-title");
    if (title) {
        title.textContent = addedItems.length === 1 ? "1 item" : `${addedItems.length} items`;
    }
}

function renderAddedItems() {
    const body = document.querySelector("#added-items-body");
    body.replaceChildren();
    if (!addedItems.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.className = "empty-state";
        cell.textContent = "No items added yet.";
        row.append(cell);
        body.append(row);
        updateItemLabels();
        return;
    }
    for (let index = 0; index < addedItems.length; index++) {
        const item = addedItems[index];
        const row = document.createElement("tr");
        appendCell(row, String(index + 1));
        appendCell(row, item.productName);
        appendCell(row, item.productCode);
        appendCell(row, item.imei);
        appendCell(row, money(item.amount));
        appendActions(row, [
            { name: "edit", label: `Edit ${item.productName}`, onClick: () => addItem(item, index) },
            {
                name: "delete",
                label: `Delete ${item.productName}`,
                onClick: () => {
                    const [removedItem] = addedItems.splice(index, 1);
                    renderAddedItems();
                    updateTotals();
                    showToast(`${removedItem.productName} removed from the bill.`);
                },
            },
        ]);
        if (itemRows.childElementCount > 0) {
            row.querySelectorAll("button").forEach((button) => {
                button.disabled = true;
            });
        }
        body.append(row);
    }
    updateItemLabels();
}

function readItems() {
    return addedItems.map((item) => ({ ...item }));
}

function currentFormSnapshot() {
    return JSON.stringify({
        billNo: document.querySelector("#bill-number").value.trim(),
        billDate: document.querySelector("#bill-date").value,
        dueDate: document.querySelector("#due-date").value || null,
        customerId: customerSelect.value || null,
        paid: Number(document.querySelector("#paid-amount").value) || 0,
        items: readItems(),
    });
}

function currentFormBillData() {
    const customer = customers.find((entry) => String(entry.id) === customerSelect.value);
    const items = readItems();
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const paid = Number(document.querySelector("#paid-amount").value) || 0;
    return {
        id: editingBillId,
        billNo: document.querySelector("#bill-number").value.trim(),
        billDate: document.querySelector("#bill-date").value,
        dueDate: document.querySelector("#due-date").value || null,
        customerName: customer?.name || "",
        customerMobile: customer?.mobile || null,
        customerAddress: customer?.address || null,
        items,
        total,
        paid,
        due: Math.max(total - paid, 0),
    };
}

function refreshSavedBillActions() {
    const unchanged = Boolean(
        formSavedBillData
        && savedBillSnapshot !== null
        && itemRows.childElementCount === 0
        && currentFormSnapshot() === savedBillSnapshot,
    );
    document.querySelector("#saved-bill-form-actions").hidden = !unchanged;
    if (!unchanged) document.querySelector("#saved-bill-form-feedback").textContent = "";
}

function updateTotals() {
    const items = readItems();
    const total = items.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
    const paidInput = document.querySelector("#paid-amount");
    const paid = Number(paidInput.value) || 0;
    document.querySelector("#item-count").textContent = String(items.filter((item) => item.productName).length);
    document.querySelector("#bill-total").textContent = money(total);
    document.querySelector("#bill-due").textContent = money(Math.max(total - paid, 0));
    paidInput.max = total.toFixed(2);
    paidInput.setCustomValidity(paid > total ? "Paid amount cannot be greater than the total." : "");
    refreshSavedBillActions();
}

function appendCell(row, value, className = "") {
    const cell = document.createElement("td");
    cell.textContent = value ?? "—";
    if (className) cell.className = className;
    row.append(cell);
    return cell;
}

function createBillPrintHeader() {
    const header = document.createElement("header");
    header.className = "bill-print-header";
    const logo = document.createElement("img");
    logo.src = "/icons/pb-ledger.svg";
    logo.alt = "Pabitra's PB logo";
    const name = document.createElement("h3");
    name.textContent = window.BillPdf.shopInfo.name;
    const business = document.createElement("p");
    business.textContent = window.BillPdf.shopInfo.business;
    const address = document.createElement("p");
    address.textContent = window.BillPdf.shopInfo.address;
    const mobile = document.createElement("p");
    mobile.textContent = `Mobile: ${window.BillPdf.shopInfo.mobile}`;
    header.append(logo, name, business, address, mobile);
    return header;
}

function createAmountWords(total) {
    const words = document.createElement("p");
    words.className = "bill-amount-words";
    const label = document.createElement("strong");
    label.textContent = "Amount in Words:";
    words.append(label, document.createTextNode(window.BillPdf.amountInWords(total)));
    return words;
}

function showBillDetails(bill) {
    savedBillData = bill;
    document.querySelector("#bill-detail-feedback").textContent = "";
    document.querySelector("#download-saved-bill").disabled = false;
    document.querySelector("#share-saved-bill").disabled = false;
    document.querySelector("#email-saved-bill").disabled = false;
    const content = document.querySelector("#bill-detail-content");
    content.replaceChildren();

    const metadata = document.createElement("div");
    metadata.className = "preview-meta";
    const fields = [
        ["Bill number", bill.billNo],
        ["Bill date", dateLabel(bill.billDate)],
        ["Customer", bill.customerName],
        ["Mobile", bill.customerMobile || "—"],
        ["Address", bill.customerAddress || "—"],
    ];
    if (bill.dueDate) fields.splice(2, 0, ["Payment Due date", dateLabel(bill.dueDate)]);
    for (const [label, value] of fields) {
        const block = document.createElement("div");
        block.textContent = label;
        const strong = document.createElement("strong");
        strong.textContent = value;
        block.append(strong);
        metadata.append(block);
    }

    const table = document.createElement("table");
    table.className = "preview-items";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["#", "Product Name", "Product Code", "IMEI Number", "Amount (₹)"]) {
        const cell = document.createElement("th");
        cell.textContent = label;
        headRow.append(cell);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (const [index, item] of bill.items.entries()) {
        const row = document.createElement("tr");
        appendCell(row, String(index + 1));
        appendCell(row, item.productName);
        appendCell(row, item.productCode);
        appendCell(row, item.imei);
        appendCell(row, money(item.amount));
        body.append(row);
    }
    table.append(head, body);
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";
    tableWrap.append(table);

    const totals = document.createElement("div");
    totals.className = "preview-total";
    for (const [label, value] of [
        ["Total", money(bill.total)],
        ["Paid", money(bill.paid)],
    ]) {
        const line = document.createElement("span");
        line.textContent = `${label} ${value}`;
        totals.append(line);
    }
    const due = document.createElement("strong");
    due.textContent = `Due ${money(bill.due)}`;
    totals.append(due);
    content.append(createBillPrintHeader(), metadata, tableWrap, totals, createAmountWords(bill.total));
}

async function openBillDetails(billId) {
    const dialog = document.querySelector("#bill-detail-dialog");
    const content = document.querySelector("#bill-detail-content");
    savedBillData = null;
    document.querySelector("#download-saved-bill").disabled = true;
    document.querySelector("#share-saved-bill").disabled = true;
    document.querySelector("#email-saved-bill").disabled = true;
    document.querySelector("#bill-detail-feedback").textContent = "";
    content.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "latest-empty";
    loading.textContent = "Loading bill details…";
    content.append(loading);
    dialog.showModal();
    try {
        const bill = await api(`/api/bills/${encodeURIComponent(billId)}`);
        showBillDetails(bill);
    } catch (error) {
        content.replaceChildren();
        const status = document.createElement("p");
        status.className = "dialog-message";
        status.textContent = `Could not load bill details: ${error.message}`;
        content.append(status);
    }
}

function dateLabel(value) {
    if (!value) return "—";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date);
}

function createdAtLabel(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    }).format(date);
}

function paymentStatus(bill) {
    return Number(bill.due) <= 0 ? ["Paid", "paid"] : ["Payment due", "due"];
}

function appendActions(row, actions) {
    const cell = document.createElement("td");
    const group = document.createElement("div");
    group.className = "action-buttons";
    const icons = {
        view: '<i class="bi bi-eye" aria-hidden="true"></i>',
        edit: '<i class="bi bi-pencil" aria-hidden="true"></i>',
        delete: '<i class="bi bi-trash" aria-hidden="true"></i>',
    };
    for (const action of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `action-button${action.name === "delete" ? " delete" : ""}`;
        button.setAttribute("aria-label", action.label);
        button.title = action.label;
        button.innerHTML = icons[action.name];
        button.addEventListener("click", action.onClick);
        group.append(button);
    }
    cell.append(group);
    row.append(cell);
}

function showRecordDetails(contentId, fields) {
    const content = document.querySelector(contentId);
    content.replaceChildren();
    const metadata = document.createElement("div");
    metadata.className = "preview-meta";
    for (const [label, value] of fields) {
        const block = document.createElement("div");
        block.textContent = label;
        const strong = document.createElement("strong");
        strong.textContent = value || "—";
        block.append(strong);
        metadata.append(block);
    }
    content.append(metadata);
}

async function openDirectoryDetails(type, id) {
    const settings = type === "customer"
        ? { endpoint: "customers", dialog: "#customer-detail-dialog", content: "#customer-detail-content" }
        : type === "item"
            ? { endpoint: "items", dialog: "#item-detail-dialog", content: "#item-detail-content" }
        : { endpoint: "products", dialog: "#product-detail-dialog", content: "#product-detail-content" };
    const content = document.querySelector(settings.content);
    content.textContent = "Loading details…";
    document.querySelector(settings.dialog).showModal();
    try {
        const entry = await api(`/api/${settings.endpoint}/${encodeURIComponent(id)}`);
        const fields = type === "customer"
            ? [
                ["Name", entry.name],
                ["Customer code", entry.code],
                ["Mobile", entry.mobile],
                ["Address", entry.address],
                ["Created on", createdAtLabel(entry.createdAt)],
            ]
            : type === "item"
                ? [
                    ["Item name", entry.productName],
                    ["Product code", entry.productCode],
                    ["IMEI number", entry.imei],
                    ["Amount", money(entry.amount)],
                    ["Bill number", entry.billNo],
                    ["Bill date", dateLabel(entry.billDate)],
                    ["Customer", entry.customerName],
                    ["Customer mobile", entry.customerMobile],
                    ["Customer address", entry.customerAddress],
                ]
                : [["Product code", entry.code], ["Product name", entry.name]];
        showRecordDetails(settings.content, fields);
    } catch (error) {
        content.textContent = `Could not load details: ${error.message}`;
    }
}

function openDirectoryForm(type) {
    const isCustomer = type === "customer";
    const formId = isCustomer ? "#customer-form" : "#product-form";
    const formElement = document.querySelector(formId);
    formElement.reset();
    delete formElement.dataset.recordId;
    document.querySelector(isCustomer ? "#customer-dialog-title" : "#product-dialog-title").textContent =
        `New ${type}`;
    document.querySelector(isCustomer ? "#save-customer-button" : "#save-product-button").textContent =
        `Save ${type}`;
    document.querySelector(isCustomer ? "#customer-dialog-message" : "#product-dialog-message").textContent = "";
    document.querySelector(isCustomer ? "#customer-dialog" : "#product-dialog").showModal();
    document.querySelector(isCustomer ? "#new-customer-name" : "#new-product-name").focus();
}

async function editDirectoryEntry(type, id) {
    const isCustomer = type === "customer";
    const settings = isCustomer
        ? {
            endpoint: "customers",
            form: "#customer-form",
            dialog: "#customer-dialog",
            title: "#customer-dialog-title",
            save: "#save-customer-button",
            status: "#customer-dialog-message",
            feedback: "#customer-feedback",
        }
        : {
            endpoint: "products",
            form: "#product-form",
            dialog: "#product-dialog",
            title: "#product-dialog-title",
            save: "#save-product-button",
            status: "#product-dialog-message",
            feedback: "#product-feedback",
        };
    try {
        const entry = await api(`/api/${settings.endpoint}/${encodeURIComponent(id)}`);
        const formElement = document.querySelector(settings.form);
        formElement.reset();
        formElement.dataset.recordId = String(id);
        for (const key of isCustomer ? ["name", "code", "mobile", "address"] : ["name", "code"]) {
            formElement.elements.namedItem(key).value = entry[key] || "";
        }
        document.querySelector(settings.title).textContent = `Edit ${type}`;
        document.querySelector(settings.save).textContent = `Update ${type}`;
        document.querySelector(settings.status).textContent = "";
        document.querySelector(settings.dialog).showModal();
        document.querySelector(isCustomer ? "#new-customer-name" : "#new-product-name").focus();
    } catch (error) {
        setOperationFeedback(settings.feedback, `Could not load ${type}: ${error.message}`, "error");
    }
}

async function confirmDeletion(text) {
    const dialog = document.querySelector("#confirm-dialog");
    document.querySelector("#confirm-message").textContent = text;
    return new Promise((resolve) => {
        confirmResolver = resolve;
        dialog.showModal();
    });
}

function resolveDeletion(confirmed) {
    const resolve = confirmResolver;
    confirmResolver = null;
    document.querySelector("#confirm-dialog").close();
    if (resolve) resolve(confirmed);
}

async function deleteDirectoryEntry(type, entry) {
    if (!await confirmDeletion(`Delete ${type} “${entry.name}”? This cannot be undone.`)) return;
    const isCustomer = type === "customer";
    const feedback = isCustomer ? "#customer-feedback" : "#product-feedback";
    const search = isCustomer ? "#customer-search" : "#product-search";
    try {
        await api(`/api/${isCustomer ? "customers" : "products"}/${encodeURIComponent(entry.id)}`, {
            method: "DELETE",
        });
        await (isCustomer ? loadCustomerDirectory(document.querySelector(search).value.trim()) : loadProductDirectory(document.querySelector(search).value.trim()));
        await loadLookups();
        await loadDashboard();
        setOperationFeedback(feedback, `${type[0].toUpperCase()}${type.slice(1)} deleted.`, "success");
    } catch (error) {
        setOperationFeedback(feedback, error.message, "error");
    }
}

function renderBillRows(target, bills, compact = false) {
    target.replaceChildren();
    if (!bills.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = compact ? 6 : 8;
        cell.className = "empty-state";
        cell.innerHTML = "<strong>No bills yet</strong>Once you save a bill, it will show up here.";
        row.append(cell);
        target.append(row);
        return;
    }
    for (const bill of bills) {
        const row = document.createElement("tr");
        const billCell = document.createElement("td");
        const billLink = document.createElement("button");
        billLink.className = "bill-link";
        billLink.type = "button";
        billLink.textContent = bill.billNo;
        billLink.setAttribute("aria-label", `View details for bill ${bill.billNo}`);
        billLink.addEventListener("click", () => openBillDetails(bill.id));
        billCell.append(billLink);
        row.append(billCell);
        appendCell(row, bill.customerName);
        appendCell(row, dateLabel(bill.billDate));
        if (compact) appendCell(row, dateLabel(bill.dueDate));
        appendCell(row, money(bill.total));
        if (compact) {
            const [label, status] = paymentStatus({ due: Number(bill.total) - Number(bill.paid) });
            const cell = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = `status ${status}`;
            badge.textContent = label;
            cell.append(badge);
            row.append(cell);
        } else {
            appendCell(row, money(bill.paid));
            appendCell(row, money(bill.due));
            const cell = document.createElement("td");
            const [label, status] = paymentStatus(bill);
            const badge = document.createElement("span");
            badge.className = `status ${status}`;
            badge.textContent = label;
            cell.append(badge);
            row.append(cell);
            appendActions(row, [
                { name: "view", label: `View bill ${bill.billNo}`, onClick: () => openBillDetails(bill.id) },
                { name: "edit", label: `Edit bill ${bill.billNo}`, onClick: () => editBill(bill.id) },
                { name: "delete", label: `Delete bill ${bill.billNo}`, onClick: () => deleteBill(bill) },
            ]);
        }
        target.append(row);
    }
}

async function loadDashboard() {
    const target = document.querySelector("#recent-bills");
    const customerBilling = document.querySelector("#customer-billing-list");
    try {
        const data = await api("/api/dashboard");
        document.querySelector("#stat-sales").textContent = money(data.summary.totalSales);
        document.querySelector("#stat-due").textContent = money(data.summary.outstanding);
        document.querySelector("#stat-count").textContent = String(data.summary.billCount || 0);
        renderBillRows(target, data.recentBills || [], true);
        renderCustomerBilling(customerBilling, data.customerBilling || []);
    } catch (error) {
        target.replaceChildren();
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.className = "empty-state";
        cell.textContent = `Could not load billing data: ${error.message}`;
        row.append(cell);
        target.append(row);
        renderCustomerBilling(customerBilling, [], error.message);
    }
}

function renderCustomerBilling(target, entries, error = "") {
    target.replaceChildren();
    if (error || !entries.length) {
        const status = document.createElement("p");
        status.className = "latest-empty";
        status.textContent = error ? `Could not load customer billing: ${error}` : "No customer bills saved yet.";
        target.append(status);
        return;
    }

    for (const customer of entries) {
        const card = document.createElement("details");
        card.className = "customer-billing-card";
        const summary = document.createElement("summary");
        const heading = document.createElement("div");
        heading.className = "customer-billing-heading";
        const name = document.createElement("strong");
        name.textContent = customer.customerName;
        const count = document.createElement("span");
        count.textContent = `${customer.billCount} ${customer.billCount === 1 ? "bill" : "bills"}`;
        heading.append(name, count);

        const totals = document.createElement("div");
        totals.className = "customer-billing-totals";
        for (const [label, value, className] of [
            ["Billed", customer.total, ""],
            ["Paid", customer.paid, ""],
            ["Due", customer.due, "due"],
        ]) {
            const total = document.createElement("span");
            if (className) total.className = className;
            total.append(`${label} `);
            const amount = document.createElement("strong");
            amount.textContent = money(value);
            total.append(amount);
            totals.append(total);
        }
        summary.append(heading, totals);
        card.append(summary);

        const bills = document.createElement("div");
        bills.className = "customer-bills";
        for (const bill of customer.bills) {
            const billSection = document.createElement("section");
            billSection.className = "customer-bill";
            const billHeading = document.createElement("div");
            billHeading.className = "customer-bill-heading";
            const billTitle = document.createElement("strong");
            billTitle.textContent = bill.billNo;
            const billDate = document.createElement("span");
            billDate.textContent = bill.billDate || "Date not set";
            const billTotal = document.createElement("span");
            billTotal.textContent = `${money(bill.total)} · Due ${money(bill.due)}`;
            billHeading.append(billTitle, billDate, billTotal);
            billSection.append(billHeading);

            const items = document.createElement("ul");
            items.className = "customer-bill-items";
            for (const item of bill.items) {
                const itemRow = document.createElement("li");
                const detail = document.createElement("span");
                detail.textContent = [
                    item.productName,
                    item.productCode,
                    item.imei ? `IMEI ${item.imei}` : "",
                ].filter(Boolean).join(" · ");
                const amount = document.createElement("strong");
                amount.textContent = money(item.amount);
                itemRow.append(detail, amount);
                items.append(itemRow);
            }
            if (!bill.items.length) {
                const empty = document.createElement("li");
                empty.textContent = "No items recorded for this bill.";
                items.append(empty);
            }
            billSection.append(items);
            bills.append(billSection);
        }
        card.append(bills);
        target.append(card);
    }
}

function renderLatestEntries(target, entries, type, error) {
    target.replaceChildren();
    if (error) {
        const status = document.createElement("p");
        status.className = "latest-empty";
        status.textContent = `Could not load ${type}: ${error}`;
        target.append(status);
        return;
    }
    if (!entries.length) {
        const status = document.createElement("p");
        status.className = "latest-empty";
        status.textContent = `No ${type} saved yet.`;
        target.append(status);
        return;
    }
    for (const entry of entries.slice(0, 5)) {
        const row = document.createElement("div");
        row.className = "latest-entry";
        const details = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = entry.name;
        const subline = document.createElement("span");
        subline.textContent = type === "customers"
            ? [entry.code, entry.mobile].filter(Boolean).join(" · ") || "Customer"
            : entry.code || "Product";
        details.append(name, subline);
        row.append(details);
        target.append(row);
    }
}

async function loadDashboardLists() {
    const [customerResult] = await Promise.allSettled([api("/api/customers")]);
    renderLatestEntries(
        document.querySelector("#latest-customers"),
        customerResult.status === "fulfilled" ? customerResult.value : [],
        "customers",
        customerResult.status === "rejected" ? customerResult.reason.message : "",
    );
    /*
    renderLatestEntries(
        document.querySelector("#latest-products"),
        productResult.status === "fulfilled" ? productResult.value : [],
        "products",
        productResult.status === "rejected" ? productResult.reason.message : "",
    );
    */
}

async function loadBills(query = billDirectoryQuery, page = 1) {
    const target = document.querySelector("#all-bills");
    const count = document.querySelector("#bills-count");
    const pagination = document.querySelector("#bills-pagination");
    const pageStatus = document.querySelector("#bills-page-status");
    billDirectoryQuery = query;
    try {
        const params = new URLSearchParams({ page: String(page) });
        if (query) params.set("q", query);
        const result = await api(`/api/bills?${params}`);
        billDirectoryPage = result.page;
        const first = result.total ? (result.page - 1) * result.pageSize + 1 : 0;
        const last = Math.min(result.page * result.pageSize, result.total);
        count.textContent = `${result.total} ${result.total === 1 ? "bill" : "bills"}`;
        pageStatus.textContent = `Showing ${first}–${last} of ${result.total} · Page ${result.page} of ${result.pageCount}`;
        pagination.hidden = result.pageCount <= 1;
        document.querySelector("#bills-previous-page").disabled = result.page <= 1;
        document.querySelector("#bills-next-page").disabled = result.page >= result.pageCount;
        renderBillRows(target, result.items);
    } catch (error) {
        count.textContent = "";
        pagination.hidden = true;
        target.replaceChildren();
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 8;
        cell.className = "empty-state";
        cell.textContent = `Could not load bills: ${error.message}`;
        row.append(cell);
        target.append(row);
    }
}

function showDirectoryMessage(target, columnCount, text) {
    target.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = columnCount;
    cell.className = "empty-state";
    cell.textContent = text;
    row.append(cell);
    target.append(row);
}

async function loadCustomerDirectory(query = customerDirectoryQuery, page = 1) {
    const target = document.querySelector("#customer-list");
    const count = document.querySelector("#customer-count");
    const pagination = document.querySelector("#customer-pagination");
    const pageStatus = document.querySelector("#customer-page-status");
    customerDirectoryQuery = query;
    try {
        const params = new URLSearchParams({ page: String(page) });
        if (query) params.set("q", query);
        const result = await api(`/api/customers?${params}`);
        customerDirectoryPage = result.page;
        const first = result.total ? (result.page - 1) * result.pageSize + 1 : 0;
        const last = Math.min(result.page * result.pageSize, result.total);
        count.textContent = `${result.total} ${result.total === 1 ? "customer" : "customers"}`;
        pageStatus.textContent = `Showing ${first}–${last} of ${result.total} · Page ${result.page} of ${result.pageCount}`;
        pagination.hidden = result.pageCount <= 1;
        document.querySelector("#customer-previous-page").disabled = result.page <= 1;
        document.querySelector("#customer-next-page").disabled = result.page >= result.pageCount;
        if (!result.items.length) {
            showDirectoryMessage(target, 5, query ? "No customers match your search." : "No customers have been saved yet.");
            return;
        }
        target.replaceChildren();
        for (const customer of result.items) {
            const row = document.createElement("tr");
            const nameCell = document.createElement("td");
            const nameLink = document.createElement("button");
            nameLink.className = "customer-name-link";
            nameLink.type = "button";
            nameLink.textContent = customer.name;
            nameLink.setAttribute("aria-label", `View customer details for ${customer.name}`);
            nameLink.addEventListener("click", () => openDirectoryDetails("customer", customer.id));
            nameCell.append(nameLink);
            row.append(nameCell);
            appendCell(row, customer.code || "—");
            appendCell(row, customer.mobile || "—");
            const addressCell = appendCell(row, customer.address || "—", "customer-address-cell");
            addressCell.title = customer.address || "";
            appendActions(row, [
                { name: "view", label: `View ${customer.name}`, onClick: () => openDirectoryDetails("customer", customer.id) },
                { name: "edit", label: `Edit ${customer.name}`, onClick: () => editDirectoryEntry("customer", customer.id) },
                { name: "delete", label: `Delete ${customer.name}`, onClick: () => deleteDirectoryEntry("customer", customer) },
            ]);
            target.append(row);
        }
    } catch (error) {
        count.textContent = "";
        pagination.hidden = true;
        showDirectoryMessage(target, 5, `Could not load customers: ${error.message}`);
    }
}

async function loadProductDirectory(query = productDirectoryQuery, page = 1) {
    const target = document.querySelector("#product-list");
    if (!target) return;
    const count = document.querySelector("#product-count");
    const pagination = document.querySelector("#product-pagination");
    try {
        productDirectoryQuery = query;
        const params = new URLSearchParams({ page: String(page) });
        if (query) params.set("q", query);
        const result = await api(`/api/products?${params}`);
        productDirectoryPage = result.page;
        count.textContent = `${result.total} item${result.total === 1 ? "" : "s"}`;
        if (!result.items.length) {
            pagination.hidden = true;
            showDirectoryMessage(target, 2, query ? "No items match your search." : "No saved items yet.");
            return;
        }
        target.replaceChildren();
        for (const product of result.items) {
            const row = document.createElement("tr");
            appendCell(row, product.code || "—");
            const nameCell = document.createElement("td");
            const nameButton = document.createElement("button");
            nameButton.className = "directory-name-link";
            nameButton.type = "button";
            nameButton.textContent = product.name;
            nameButton.setAttribute("aria-label", `View ${product.name} details`);
            nameButton.addEventListener("click", () => openDirectoryDetails("product", product.id));
            nameCell.append(nameButton);
            row.append(nameCell);
            target.append(row);
        }
        pagination.hidden = result.pageCount <= 1;
        document.querySelector("#product-page-status").textContent =
            `Page ${result.page} of ${result.pageCount}`;
        document.querySelector("#product-previous-page").disabled = result.page <= 1;
        document.querySelector("#product-next-page").disabled = result.page >= result.pageCount;
    } catch (error) {
        count.textContent = "";
        pagination.hidden = true;
        showDirectoryMessage(target, 2, `Could not load items: ${error.message}`);
    }
}

async function loadItemDirectory(query = itemDirectoryQuery, page = 1) {
    const target = document.querySelector("#item-list");
    const count = document.querySelector("#item-directory-count");
    const pagination = document.querySelector("#item-pagination");
    const pageStatus = document.querySelector("#item-page-status");
    itemDirectoryQuery = query;
    try {
        const params = new URLSearchParams({ page: String(page) });
        if (query) params.set("q", query);
        const result = await api(`/api/items?${params}`);
        itemDirectoryPage = result.page;
        const first = result.total ? (result.page - 1) * result.pageSize + 1 : 0;
        const last = Math.min(result.page * result.pageSize, result.total);
        count.textContent = `${result.total} ${result.total === 1 ? "item" : "items"}`;
        pageStatus.textContent = `Showing ${first}–${last} of ${result.total} · Page ${result.page} of ${result.pageCount}`;
        pagination.hidden = result.pageCount <= 1;
        document.querySelector("#item-previous-page").disabled = result.page <= 1;
        document.querySelector("#item-next-page").disabled = result.page >= result.pageCount;
        if (!result.items.length) {
            showDirectoryMessage(target, 4, query ? "No items match your search." : "No billed items yet.");
            return;
        }

        target.replaceChildren();
        for (const item of result.items) {
            const row = document.createElement("tr");
            const nameCell = document.createElement("td");
            const nameButton = document.createElement("button");
            nameButton.className = "directory-name-link";
            nameButton.type = "button";
            nameButton.textContent = item.productName;
            nameButton.setAttribute("aria-label", `View ${item.productName} item details`);
            nameButton.addEventListener("click", () => openDirectoryDetails("item", item.id));
            nameCell.append(nameButton);
            row.append(nameCell);
            appendCell(row, item.productCode || "—");
            appendCell(row, item.imei || "—");
            appendCell(row, money(item.amount));
            target.append(row);
        }
    } catch (error) {
        count.textContent = "";
        pagination.hidden = true;
        showDirectoryMessage(target, 4, `Could not load items: ${error.message}`);
    }
}

async function loadLookups() {
    const [customerResult, codeResult, nameResult] = await Promise.allSettled([
        api("/api/customers"),
        api("/api/bills/product-codes"),
        api("/api/bills/product-names"),
    ]);
    if (customerResult.status === "rejected") throw customerResult.reason;
    const selectedCustomerId = customerSelect.value;
    customers = customerResult.value;
    if (codeResult.status === "fulfilled") {
        productCodes = codeResult.value;
    } else {
        productCodes = [];
        showToast(`Saved product code suggestions are unavailable: ${codeResult.reason.message}`, "error");
    }
    if (nameResult.status === "fulfilled") {
        productNames = nameResult.value;
    } else {
        productNames = [];
        showToast(`Saved product name suggestions are unavailable: ${nameResult.reason.message}`, "error");
    }
    for (const input of itemRows.querySelectorAll("input[aria-controls]")) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    customerSelect.replaceChildren(new Option("Select a customer", ""));
    for (const customer of customers) {
        const detail = customer.mobile ? ` · ${customer.mobile}` : "";
        customerSelect.add(new Option(`${customer.name}${detail}`, String(customer.id)));
    }
    customerSelect.value = selectedCustomerId;
    selectCustomer();
}

function refreshItemProductOptions() {
    for (const select of itemRows.querySelectorAll('select[data-field="productName"]')) {
        const selected = select.value;
        select.replaceChildren(new Option("Select a product", ""));
        for (const product of products) {
            select.add(new Option(product.code ? `${product.name} (${product.code})` : product.name, String(product.id)));
        }
        select.value = selected;
    }
}

function selectCustomer() {
    const customer = customers.find((entry) => String(entry.id) === customerSelect.value);
    const details = document.querySelector("#selected-customer-details");
    const summary = document.querySelector("#selected-customer-summary");
    if (!customer) {
        details.hidden = true;
        summary.textContent = "";
        return;
    }
    summary.textContent = [
        customer.mobile,
        customer.address,
    ].filter(Boolean).join(" · ");
    details.hidden = false;
}

function localDateISO(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function resetForm() {
    form.reset();
    editingBillId = null;
    formSavedBillData = null;
    savedBillSnapshot = null;
    addedItems = [];
    renderAddedItems();
    document.querySelector("#create-title").textContent = "Create a new bill";
    document.querySelector("#save-button").textContent = "Save bill";
    document.querySelector("#billing-feedback").textContent = "";
    document.querySelector("#saved-bill-form-feedback").textContent = "";
    customerSelect.value = "";
    selectCustomer();
    itemRows.replaceChildren();
    const today = localDateISO();
    document.querySelector("#bill-date").value = today;
    document.querySelector("#bill-number").value = makeBillNumber();
    setMessage("");
    updateTotals();
    refreshSavedBillActions();
}

async function editBill(billId) {
    try {
        const bill = await api(`/api/bills/${encodeURIComponent(billId)}`);
        if (!customers.length) await loadLookups();
        form.reset();
        editingBillId = Number(bill.id);
        document.querySelector("#bill-number").value = bill.billNo;
        document.querySelector("#bill-date").value = bill.billDate;
        document.querySelector("#due-date").value = bill.dueDate || "";
        if (bill.customerId !== null && ![...customerSelect.options].some((option) => option.value === String(bill.customerId))) {
            customerSelect.add(new Option(bill.customerName, String(bill.customerId)));
        }
        customerSelect.value = bill.customerId === null ? "" : String(bill.customerId);
        selectCustomer();
        document.querySelector("#paid-amount").value = bill.paid;
        itemRows.replaceChildren();
        addedItems = bill.items.map((item) => ({ ...item }));
        renderAddedItems();
        updateTotals();
        document.querySelector("#create-title").textContent = `Edit bill ${bill.billNo}`;
        document.querySelector("#save-button").textContent = "Update bill";
        setMessage("");
        document.querySelector("#billing-feedback").textContent = "";
        document.querySelector("#saved-bill-form-feedback").textContent = "";
        formSavedBillData = { ...bill, items: bill.items.map((item) => ({ ...item })) };
        savedBillSnapshot = currentFormSnapshot();
        refreshSavedBillActions();
        setNavigation("create");
    } catch (error) {
        setOperationFeedback("#billing-feedback", `Could not load bill for editing: ${error.message}`, "error");
    }
}

async function deleteBill(bill) {
    if (!await confirmDeletion(`Delete bill ${bill.billNo} and its items? This cannot be undone.`)) return;
    try {
        await api(`/api/bills/${encodeURIComponent(bill.id)}`, { method: "DELETE" });
        await loadBills(document.querySelector("#bill-search").value.trim());
        await loadDashboard();
        setOperationFeedback("#bill-feedback", `Bill ${bill.billNo} deleted.`, "success");
    } catch (error) {
        setOperationFeedback("#bill-feedback", error.message, "error");
    }
}

function makeBillNumber() {
    const day = localDateISO().replaceAll("-", "");
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `POS-${day}-${suffix}`;
}

function previewBill() {
    updateTotals();
    if (!validateFormFields(form)) {
        setMessage("Please correct the highlighted fields.", "error");
        return;
    }
    if (!customerSelect.value) {
        setMessage("Select an existing customer.", "error");
        customerSelect.focus();
        return;
    }
    const items = readItems();
    if (itemRows.childElementCount > 0) {
        setMessage("Save or cancel the open item before previewing the bill.", "error");
        itemRows.querySelector("input")?.focus();
        return;
    }
    if (!items.length || items.some((item) => !item.productName || !item.productCode || !Number.isFinite(item.amount) || item.amount <= 0)) {
        setMessage("Add at least one complete item to the bill.", "error");
        return;
    }
    if (items.some((item) => !/^\d{15}$/.test(item.imei))) {
        setMessage("IMEI / serial must be exactly 15 numeric digits.", "error");
        return;
    }
    const seenImeis = new Set();
    if (items.some((item) => {
        if (seenImeis.has(item.imei)) return true;
        seenImeis.add(item.imei);
        return false;
    })) {
        setMessage("Each IMEI must be unique within the bill.", "error");
        return;
    }
    if (items.some((item) => item.amount < 1000 || item.amount > 500000)) {
        setMessage("Item amount must be between ₹1,000 and ₹5,00,000.", "error");
        return;
    }
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const paid = Number(document.querySelector("#paid-amount").value) || 0;
    if (paid > total) {
        setMessage("Paid amount cannot be greater than the total.", "error");
        return;
    }
    const customer = customers.find((entry) => String(entry.id) === customerSelect.value);
    previewBillData = {
        billNo: document.querySelector("#bill-number").value.trim(),
        billDate: document.querySelector("#bill-date").value,
        dueDate: document.querySelector("#due-date").value || null,
        customerName: customer?.name || "—",
        customerMobile: customer?.mobile || null,
        customerAddress: customer?.address || null,
        items,
        total,
        paid,
        due: total - paid,
    };
    document.querySelector("#preview-feedback").textContent = "";
    document.querySelector("#download-preview").disabled = false;
    document.querySelector("#share-preview").disabled = false;
    document.querySelector("#email-preview").disabled = false;
    const container = document.querySelector("#preview-content");
    container.replaceChildren();
    const metadata = document.createElement("div");
    metadata.className = "preview-meta";
    const fields = [
        ["Bill number", previewBillData.billNo],
        ["Bill date", dateLabel(document.querySelector("#bill-date").value)],
        ["Customer", previewBillData.customerName],
        ["Mobile", previewBillData.customerMobile || "—"],
        ["Address", previewBillData.customerAddress || "—"],
    ];
    if (previewBillData.dueDate) fields.splice(2, 0, ["Payment due date", dateLabel(previewBillData.dueDate)]);
    for (const [label, value] of fields) {
        const block = document.createElement("div");
        block.textContent = label;
        const strong = document.createElement("strong");
        strong.textContent = value;
        block.append(strong);
        metadata.append(block);
    }
    const table = document.createElement("table");
    table.className = "preview-items";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["#", "Product Name", "Product Code", "IMEI Number", "Amount (₹)"]) {
        const cell = document.createElement("th");
        cell.textContent = label;
        headRow.append(cell);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (const [index, item] of items.entries()) {
        const row = document.createElement("tr");
        appendCell(row, String(index + 1));
        appendCell(row, item.productName);
        appendCell(row, item.productCode);
        appendCell(row, item.imei);
        appendCell(row, money(item.amount));
        body.append(row);
    }
    table.append(head, body);
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";
    tableWrap.append(table);
    const totals = document.createElement("div");
    totals.className = "preview-total";
    const totalLabel = document.createElement("span");
    totalLabel.textContent = `Total ${money(total)}`;
    const paidLabel = document.createElement("span");
    paidLabel.textContent = `Paid ${money(paid)} · Due ${money(total - paid)}`;
    const totalStrong = document.createElement("strong");
    totalStrong.textContent = `Balance due ${money(total - paid)}`;
    totals.append(totalLabel, paidLabel, totalStrong);
    container.append(createBillPrintHeader(), metadata, tableWrap, totals, createAmountWords(total));
    document.querySelector("#preview-dialog").showModal();
}

document.querySelectorAll(".nav-button[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
        if (button.dataset.page === "create" && editingBillId !== null) resetForm();
        setNavigation(button.dataset.page);
    });
});
document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => {
        if (button.dataset.go === "create") resetForm();
        setNavigation(button.dataset.go);
    });
});
document.querySelector("#add-item").addEventListener("click", () => addItem());
document.querySelector("#paid-amount").addEventListener("input", updateTotals);
customerSelect.addEventListener("change", selectCustomer);
document.querySelector("#preview-button").addEventListener("click", previewBill);
document.querySelector("#close-preview").addEventListener("click", () => {
    document.querySelector("#preview-dialog").close();
});
document.querySelector("#print-preview").addEventListener("click", () => window.print());
document.querySelector("#print-saved-bill").addEventListener("click", () => window.print());
async function shareBillPdf(bill, button, feedback, channel) {
    const wasDisabled = button.disabled;
    button.disabled = true;
    feedback.textContent = "";
    try {
        const result = await window.BillPdf.share(bill);
        if (result === "shared") {
            feedback.textContent = channel === "email"
                ? "PDF shared. Choose your email app from the share menu."
                : "PDF shared. Choose WhatsApp from the share menu.";
            showToast(feedback.textContent);
        } else if (result === "downloaded") {
            feedback.textContent = channel === "email"
                ? "PDF downloaded. Attach it to your email."
                : "PDF downloaded. Attach it in WhatsApp.";
            showToast(feedback.textContent);
        }
    } catch (error) {
        feedback.textContent = `Could not share PDF: ${error.message}`;
        showToast(error.message, "error");
    } finally {
        button.disabled = wasDisabled;
    }
}
document.querySelector("#share-preview").addEventListener("click", (event) => {
    shareBillPdf(previewBillData, event.currentTarget, document.querySelector("#preview-feedback"), "whatsapp");
});
document.querySelector("#share-saved-bill").addEventListener("click", (event) => {
    shareBillPdf(savedBillData, event.currentTarget, document.querySelector("#bill-detail-feedback"), "whatsapp");
});
document.querySelector("#email-preview").addEventListener("click", (event) => {
    shareBillPdf(previewBillData, event.currentTarget, document.querySelector("#preview-feedback"), "email");
});
document.querySelector("#email-saved-bill").addEventListener("click", (event) => {
    shareBillPdf(savedBillData, event.currentTarget, document.querySelector("#bill-detail-feedback"), "email");
});
document.querySelector("#download-preview").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const feedback = document.querySelector("#preview-feedback");
    button.disabled = true;
    feedback.textContent = "";
    try {
        await window.BillPdf.download(previewBillData);
        showToast("Bill PDF downloaded.");
    } catch (error) {
        feedback.textContent = `Could not create PDF: ${error.message}`;
        showToast(error.message, "error");
    } finally {
        button.disabled = false;
    }
});
document.querySelector("#download-saved-bill").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const feedback = document.querySelector("#bill-detail-feedback");
    button.disabled = true;
    feedback.textContent = "";
    try {
        await window.BillPdf.download(savedBillData);
        showToast("Bill PDF downloaded.");
    } catch (error) {
        feedback.textContent = `Could not create PDF: ${error.message}`;
        showToast(error.message, "error");
    } finally {
        button.disabled = !savedBillData;
    }
});
document.querySelector("#download-form-saved-bill").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const feedback = document.querySelector("#saved-bill-form-feedback");
    button.disabled = true;
    feedback.textContent = "";
    try {
        await window.BillPdf.download(formSavedBillData);
        showToast("Bill PDF downloaded.");
    } catch (error) {
        feedback.textContent = `Could not create PDF: ${error.message}`;
        showToast(error.message, "error");
    } finally {
        button.disabled = false;
    }
});
document.querySelector("#share-form-saved-bill").addEventListener("click", (event) => {
    shareBillPdf(formSavedBillData, event.currentTarget, document.querySelector("#saved-bill-form-feedback"), "whatsapp");
});
document.querySelector("#close-bill-details").addEventListener("click", () => {
    document.querySelector("#bill-detail-dialog").close();
});
document.querySelector("#clear-button").addEventListener("click", resetForm);
form.addEventListener("input", refreshSavedBillActions);
form.addEventListener("change", refreshSavedBillActions);
document.querySelector("#bill-search").addEventListener("input", (event) => {
    loadBills(event.target.value.trim(), 1);
});
document.querySelector("#bills-previous-page").addEventListener("click", () => {
    loadBills(billDirectoryQuery, billDirectoryPage - 1);
});
document.querySelector("#bills-next-page").addEventListener("click", () => {
    loadBills(billDirectoryQuery, billDirectoryPage + 1);
});
document.querySelector("#customer-search").addEventListener("input", (event) => {
    window.clearTimeout(customerSearchTimer);
    customerSearchTimer = window.setTimeout(
        () => loadCustomerDirectory(event.target.value.trim()),
        250,
    );
});
document.querySelector("#customer-previous-page").addEventListener("click", () => {
    loadCustomerDirectory(customerDirectoryQuery, customerDirectoryPage - 1);
});
document.querySelector("#customer-next-page").addEventListener("click", () => {
    loadCustomerDirectory(customerDirectoryQuery, customerDirectoryPage + 1);
});
document.querySelector("#item-search").addEventListener("input", (event) => {
    window.clearTimeout(itemSearchTimer);
    itemSearchTimer = window.setTimeout(
        () => loadItemDirectory(event.target.value.trim(), 1),
        250,
    );
});
document.querySelector("#item-previous-page").addEventListener("click", () => {
    loadItemDirectory(itemDirectoryQuery, itemDirectoryPage - 1);
});
document.querySelector("#item-next-page").addEventListener("click", () => {
    loadItemDirectory(itemDirectoryQuery, itemDirectoryPage + 1);
});
document.querySelector("#new-customer-button").addEventListener("click", () => {
    openDirectoryForm("customer");
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
        document.querySelector(`#${button.dataset.closeDialog}`).close();
    });
});
document.querySelector("#close-imei-scanner").addEventListener("click", () => {
    document.querySelector("#imei-scanner-dialog").close();
});
document.querySelector("#imei-scanner-dialog").addEventListener("close", stopImeiScanner);
document.querySelector("#customer-form").addEventListener("submit", (event) => {
    saveDirectoryEntry(event, {
        button: "#save-customer-button",
        buttonText: "Save customer",
        updateText: "Update customer",
        savingText: "Saving…",
        dialog: "#customer-dialog",
        endpoint: "/api/customers",
        reload: () => loadCustomerDirectory(),
        search: "#customer-search",
        status: "#customer-dialog-message",
        feedback: "#customer-feedback",
        entity: "Customer",
    });
});
document.querySelector("#product-form").addEventListener("submit", (event) => {
    saveDirectoryEntry(event, {
        button: "#save-product-button",
        buttonText: "Save product",
        updateText: "Update product",
        savingText: "Saving…",
        dialog: "#product-dialog",
        endpoint: "/api/products",
        reload: () => loadProductDirectory(),
        search: "#product-search",
        status: "#product-dialog-message",
        feedback: "#product-feedback",
        entity: "Product",
    });
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");
    updateTotals();
    if (!validateFormFields(form)) {
        setMessage("Please correct the highlighted fields.", "error");
        return;
    }
    if (itemRows.childElementCount > 0) {
        setMessage("Save or cancel the open item before saving the bill.", "error");
        itemRows.querySelector("input")?.focus();
        return;
    }
    const items = readItems();
    if (!items.length || items.some((item) => !item.productName || !item.productCode || !Number.isFinite(item.amount) || item.amount <= 0)) {
        setMessage("Add at least one complete item to the bill.", "error");
        return;
    }
    if (items.some((item) => !/^\d{15}$/.test(item.imei))) {
        setMessage("IMEI / serial must be exactly 15 numeric digits.", "error");
        return;
    }
    if (items.some((item) => item.amount < 1000 || item.amount > 500000)) {
        setMessage("Item amount must be between ₹1,000 and ₹5,00,000.", "error");
        return;
    }
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const paid = Number(document.querySelector("#paid-amount").value) || 0;
    if (paid > total) {
        setMessage("Paid amount cannot be greater than the total.", "error");
        return;
    }
    const customer = customers.find((entry) => String(entry.id) === customerSelect.value);
    if (!customer) {
        setMessage("Select an existing customer.", "error");
        customerSelect.focus();
        return;
    }
    const button = document.querySelector("#save-button");
    button.disabled = true;
    button.textContent = "Saving…";
    const isEditing = editingBillId !== null;
    const endpoint = isEditing ? `/api/bills/${encodeURIComponent(editingBillId)}` : "/api/bills";
    const payload = {
        billNo: document.querySelector("#bill-number").value.trim(),
        billDate: document.querySelector("#bill-date").value,
        dueDate: document.querySelector("#due-date").value || null,
        customerId: customerSelect.value || null,
        customerName: customer.name,
        customerMobile: customer.mobile || null,
        customerAddress: customer.address || null,
        paid,
        items,
    };
    try {
        const result = await api(endpoint, {
            method: isEditing ? "PUT" : "POST",
            body: JSON.stringify(payload),
        });
        const savedBillNo = result.billNo;
        editingBillId = Number(result.id);
        if (!Number.isSafeInteger(editingBillId) || editingBillId < 1) {
            throw new Error("The bill was saved, but the server did not return a valid bill ID.");
        }
        document.querySelector("#create-title").textContent = `Edit bill ${savedBillNo}`;
        document.querySelector("#save-button").textContent = "Update bill";
        formSavedBillData = {
            id: editingBillId,
            ...payload,
            total,
            due: total - paid,
            items: items.map((item) => ({ ...item })),
        };
        savedBillSnapshot = currentFormSnapshot();
        document.querySelector("#saved-bill-form-feedback").textContent = "";
        refreshSavedBillActions();
        setMessage("");
        setOperationFeedback("#billing-feedback", `Bill ${savedBillNo} ${isEditing ? "updated" : "saved"} successfully.`, "success");
        try {
            await Promise.all([loadDashboard(), loadBills(document.querySelector("#bill-search").value.trim()), loadLookups()]);
        } catch (error) {
            setOperationFeedback(
                "#billing-feedback",
                `Bill ${savedBillNo} was saved, but billing lookups could not refresh: ${error.message}`,
                "error",
            );
        }
    } catch (error) {
        setMessage(error.message, "error");
        showToast(error.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = editingBillId === null ? "Save bill" : "Update bill";
    }
});

document.querySelector("#accept-confirm").addEventListener("click", () => resolveDeletion(true));
document.querySelector("#cancel-confirm").addEventListener("click", () => resolveDeletion(false));
document.querySelector("#cancel-confirm-close").addEventListener("click", () => resolveDeletion(false));
document.querySelector("#confirm-dialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveDeletion(false);
});

resetForm();
loadDashboard();
loadLookups().catch((error) => setMessage(`Could not load customers: ${error.message}`, "error"));
