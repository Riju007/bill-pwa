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
let addedItems = [];
let customerSearchTimer;
let productSearchTimer;
let editingBillId = null;
let previewBillData = null;
let savedBillData = null;
let confirmResolver = null;
const themeToggle = document.querySelector("#theme-toggle");

function setTheme(theme, persist = false) {
    const dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    themeToggle.setAttribute("aria-pressed", String(dark));
    themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} theme`);
    themeToggle.title = `Switch to ${dark ? "light" : "dark"} theme`;
    themeToggle.innerHTML = dark
        ? '<i class="bi bi-sun" aria-hidden="true"></i><span class="theme-toggle-label">Light theme</span>'
        : '<i class="bi bi-moon" aria-hidden="true"></i><span class="theme-toggle-label">Dark theme</span>';
    document.querySelector('meta[name="theme-color"]').content = dark ? "#09120d" : "#f5f8f6";
    if (persist) localStorage.setItem("billwise-theme", dark ? "dark" : "light");
}

setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
themeToggle.addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
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
}

function fieldIsValid(field) {
    return field.validity.valid && !(field.required && !String(field.value).trim());
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
        const invalid = [...row.querySelectorAll("input, select, textarea")]
            .some((field) => field.willValidate && !fieldIsValid(field));
        let error = row.querySelector(".item-validation");
        if (!error) {
            error = document.createElement("p");
            error.className = "item-validation";
            error.setAttribute("role", "alert");
            row.append(error);
        }
        error.textContent = "Enter a product name and an amount greater than zero.";
        error.hidden = !invalid;
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
        await loadDashboardLists();
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
    if (page === "bills") loadBills();
    if (page === "dashboard") loadDashboard();
    if (page === "customers") {
        loadCustomerDirectory(document.querySelector("#customer-search").value.trim());
    }
    if (page === "products") {
        loadProductDirectory(document.querySelector("#product-search").value.trim());
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
    if (field === "amount") {
        input.min = "1000";
        input.max = "500000";
        input.step = "0.01";
        input.inputMode = "decimal";
        input.required = true;
        input.setAttribute("aria-required", "true");
    }
    if (field === "imei") {
        input.minLength = 15;
        input.maxLength = 15;
        input.inputMode = "numeric";
        input.pattern = "[0-9]{15}";
        input.required = true;
        input.setAttribute("aria-required", "true");
    }
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
        input.required = true;
        input.setAttribute("aria-required", "true");
        input.setAttribute("aria-label", "Selected product code");
    }
    if (field === "imei") {
        input.maxLength = 15;
        input.pattern = "[0-9]{15}";
    }
    input.addEventListener("input", updateTotals);
    return input;
}

function addItem(values = {}) {
    const row = document.createElement("div");
    row.className = "item-row";
    const addField = (field, label, control) => {
        const wrapper = document.createElement("div");
        wrapper.className = "item-field";
        const labelElement = document.createElement("label");
        const index = itemRows.children.length + 1;
        const controlId = `item-${Date.now()}-${index}-${field}`;
        labelElement.htmlFor = controlId;
        labelElement.textContent = label;
        control.id = controlId;
        wrapper.append(labelElement, control);
        row.append(wrapper);
    };

    addField("productName", "Product *", itemInput("productName", "Select a product"));
    addField("productCode", "Product code *", itemInput("productCode", "Auto-filled"));
    addField("imei", "IMEI / serial *", itemInput("imei", "15 digits"));
    addField("amount", "Amount (₹) *", itemInput("amount", "0.00", "number"));

    const code = row.querySelector('[data-field="productCode"]');
    const name = row.querySelector('[data-field="productName"]');
    const imei = row.querySelector('[data-field="imei"]');
    const amount = row.querySelector('[data-field="amount"]');
    code.value = values.productCode || "";
    if (name.tagName === "SELECT") {
        const matched = products.find((product) =>
            product.name === values.productName
            || (values.productCode && product.code === values.productCode),
        );
        name.value = matched ? String(matched.id) : "";
    }
    imei.value = values.imei || "";
    amount.value = values.amount || "";
    const actions = document.createElement("div");
    actions.className = "draft-actions";
    const accept = document.createElement("button");
    accept.className = "draft-action accept";
    accept.type = "button";
    accept.setAttribute("aria-label", "Add item to table");
    accept.title = "Add item";
    accept.textContent = "✓";
    accept.addEventListener("click", () => {
        if (!name.value) {
            name.setAttribute("aria-invalid", "true");
            name.focus();
            setMessage("Select a product for the item.", "error");
            return;
        }
        if (!/^\d{15}$/.test(imei.value.trim())) {
            imei.setAttribute("aria-invalid", "true");
            imei.focus();
            setMessage("IMEI / serial must be exactly 15 numeric digits.", "error");
            return;
        }
        const itemAmount = Number(amount.value);
        if (!Number.isFinite(itemAmount) || itemAmount < 1000 || itemAmount > 500000) {
            amount.setAttribute("aria-invalid", "true");
            amount.focus();
            setMessage("Amount must be between ₹1,000 and ₹5,00,000.", "error");
            return;
        }
        const product = products.find((entry) => String(entry.id) === name.value);
        if (!product) {
            name.setAttribute("aria-invalid", "true");
            name.focus();
            setMessage("Select an existing product.", "error");
            return;
        }
        if (!product.code) {
            code.setAttribute("aria-invalid", "true");
            code.focus();
            setMessage("The selected product must have a product code.", "error");
            return;
        }
        addedItems.push({
            productCode: product.code,
            productName: product.name,
            imei: imei.value.trim(),
            amount: itemAmount,
        });
        row.remove();
        setMessage("");
        renderAddedItems();
        updateTotals();
        updateItemLabels();
    });
    const reject = document.createElement("button");
    reject.className = "draft-action reject";
    reject.type = "button";
    reject.setAttribute("aria-label", "Remove item entry");
    reject.title = "Cancel entry";
    reject.textContent = "×";
    reject.addEventListener("click", () => {
        row.remove();
        updateItemLabels();
        setMessage("");
    });
    actions.append(accept, reject);
    row.append(actions);
    itemRows.append(row);
    updateTotals();
    updateItemLabels();
    if (form.dataset.validationAttempted === "true") validateFormFields(form, false, false);
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
        cell.colSpan = 5;
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
        appendCell(row, item.productName);
        appendCell(row, item.productCode || "—");
        appendCell(row, item.imei);
        appendCell(row, money(item.amount));
        const actionCell = document.createElement("td");
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-added-item";
        remove.setAttribute("aria-label", `Delete ${item.productName}`);
        remove.title = "Delete item";
        remove.textContent = "×";
        remove.addEventListener("click", () => {
            addedItems.splice(index, 1);
            renderAddedItems();
            updateTotals();
        });
        actionCell.append(remove);
        row.append(actionCell);
        body.append(row);
    }
    updateItemLabels();
}

function readItems() {
    return addedItems.map((item) => ({ ...item }));
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
    logo.src = "/pb-logo.gif";
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
    const content = document.querySelector("#bill-detail-content");
    content.replaceChildren();

    const metadata = document.createElement("div");
    metadata.className = "preview-meta";
    const fields = [
        ["Bill number", bill.billNo],
        ["Bill date", dateLabel(bill.billDate)],
        ["Payment Due date", dateLabel(bill.dueDate)],
        ["Customer", bill.customerName],
        ["Mobile", bill.customerMobile || "—"],
        ["Address", bill.customerAddress || "—"],
    ];
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
    for (const label of ["#", "Code", "Product / Details", "IMEI No.", "Amount"]) {
        const cell = document.createElement("th");
        cell.textContent = label;
        headRow.append(cell);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (const [index, item] of bill.items.entries()) {
        const row = document.createElement("tr");
        appendCell(row, String(index + 1));
        appendCell(row, item.productCode || "—");
        appendCell(row, item.productName);
        appendCell(row, item.imei || "—");
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
        : { endpoint: "products", dialog: "#product-detail-dialog", content: "#product-detail-content" };
    const content = document.querySelector(settings.content);
    content.textContent = "Loading details…";
    document.querySelector(settings.dialog).showModal();
    try {
        const entry = await api(`/api/${settings.endpoint}/${encodeURIComponent(id)}`);
        const fields = type === "customer"
            ? [["Customer code", entry.code], ["Name", entry.name], ["Mobile", entry.mobile], ["Address", entry.address]]
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
        await loadDashboardLists();
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
        cell.colSpan = compact ? 5 : 8;
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
    loadDashboardLists();
    try {
        const data = await api("/api/dashboard");
        document.querySelector("#stat-sales").textContent = money(data.summary.totalSales);
        document.querySelector("#stat-due").textContent = money(data.summary.outstanding);
        document.querySelector("#stat-count").textContent = String(data.summary.billCount || 0);
        renderBillRows(target, data.recentBills || [], true);
    } catch (error) {
        target.replaceChildren();
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.className = "empty-state";
        cell.textContent = `Could not load billing data: ${error.message}`;
        row.append(cell);
        target.append(row);
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
    const [customerResult, productResult] = await Promise.allSettled([
        api("/api/customers"),
        api("/api/products"),
    ]);
    renderLatestEntries(
        document.querySelector("#latest-customers"),
        customerResult.status === "fulfilled" ? customerResult.value : [],
        "customers",
        customerResult.status === "rejected" ? customerResult.reason.message : "",
    );
    renderLatestEntries(
        document.querySelector("#latest-products"),
        productResult.status === "fulfilled" ? productResult.value : [],
        "products",
        productResult.status === "rejected" ? productResult.reason.message : "",
    );
}

async function loadBills(query = "") {
    const target = document.querySelector("#all-bills");
    try {
        const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
        const bills = await api(`/api/bills${suffix}`);
        renderBillRows(target, bills);
    } catch (error) {
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

async function loadCustomerDirectory(query = "") {
    const target = document.querySelector("#customer-list");
    const count = document.querySelector("#customer-count");
    try {
        const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
        const results = await api(`/api/customers${suffix}`);
        count.textContent = `${results.length} shown${results.length === 100 ? " · max 100" : ""}`;
        if (!results.length) {
            showDirectoryMessage(target, 5, query ? "No customers match your search." : "No customers have been saved yet.");
            return;
        }
        target.replaceChildren();
        for (const customer of results) {
            const row = document.createElement("tr");
            appendCell(row, customer.code || "—");
            appendCell(row, customer.name);
            appendCell(row, customer.mobile || "—");
            appendCell(row, customer.address || "—");
            appendActions(row, [
                { name: "view", label: `View ${customer.name}`, onClick: () => openDirectoryDetails("customer", customer.id) },
                { name: "edit", label: `Edit ${customer.name}`, onClick: () => editDirectoryEntry("customer", customer.id) },
                { name: "delete", label: `Delete ${customer.name}`, onClick: () => deleteDirectoryEntry("customer", customer) },
            ]);
            target.append(row);
        }
    } catch (error) {
        count.textContent = "";
        showDirectoryMessage(target, 5, `Could not load customers: ${error.message}`);
    }
}

async function loadProductDirectory(query = "") {
    const target = document.querySelector("#product-list");
    const count = document.querySelector("#product-count");
    try {
        const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
        const results = await api(`/api/products${suffix}`);
        count.textContent = `${results.length} shown${results.length === 100 ? " · max 100" : ""}`;
        if (!results.length) {
            showDirectoryMessage(target, 3, query ? "No products match your search." : "No products have been saved yet.");
            return;
        }
        target.replaceChildren();
        for (const product of results) {
            const row = document.createElement("tr");
            appendCell(row, product.code || "—");
            appendCell(row, product.name);
            appendActions(row, [
                { name: "view", label: `View ${product.name}`, onClick: () => openDirectoryDetails("product", product.id) },
                { name: "edit", label: `Edit ${product.name}`, onClick: () => editDirectoryEntry("product", product.id) },
                { name: "delete", label: `Delete ${product.name}`, onClick: () => deleteDirectoryEntry("product", product) },
            ]);
            target.append(row);
        }
    } catch (error) {
        count.textContent = "";
        showDirectoryMessage(target, 3, `Could not load products: ${error.message}`);
    }
}

async function loadLookups() {
    const results = await Promise.all([
        api("/api/customers"),
        api("/api/products"),
    ]);
    customers = results[0];
    products = results[1];
    customerSelect.replaceChildren(new Option("Select a customer", ""));
    for (const customer of customers) {
        const detail = customer.mobile ? ` · ${customer.mobile}` : "";
        customerSelect.add(new Option(`${customer.name}${detail}`, String(customer.id)));
    }
    refreshItemProductOptions();
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
    addedItems = [];
    renderAddedItems();
    document.querySelector("#create-title").textContent = "Create a new bill";
    document.querySelector("#save-button").textContent = "Save bill";
    customerSelect.value = "";
    selectCustomer();
    itemRows.replaceChildren();
    addItem();
    const today = localDateISO();
    document.querySelector("#bill-date").value = today;
    document.querySelector("#bill-number").value = makeBillNumber();
    setMessage("");
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
        addItem();
        document.querySelector("#create-title").textContent = `Edit bill ${bill.billNo}`;
        document.querySelector("#save-button").textContent = "Update bill";
        setMessage("");
        setNavigation("create");
    } catch (error) {
        setOperationFeedback("#bill-feedback", `Could not load bill for editing: ${error.message}`, "error");
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
    if (!items.length || items.some((item) => !item.productName || !Number.isFinite(item.amount) || item.amount <= 0)) {
        setMessage("Add at least one item and use ✓ to confirm it.", "error");
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
    const container = document.querySelector("#preview-content");
    container.replaceChildren();
    const metadata = document.createElement("div");
    metadata.className = "preview-meta";
    const fields = [
        ["Bill number", previewBillData.billNo],
        ["Bill date", dateLabel(document.querySelector("#bill-date").value)],
        ["Payment due date", dateLabel(previewBillData.dueDate)],
        ["Customer", previewBillData.customerName],
        ["Mobile", previewBillData.customerMobile || "—"],
        ["Address", previewBillData.customerAddress || "—"],
    ];
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
    for (const label of ["#", "Code", "Product / Details", "IMEI No.", "Amount"]) {
        const cell = document.createElement("th");
        cell.textContent = label;
        headRow.append(cell);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (const [index, item] of items.entries()) {
        const row = document.createElement("tr");
        appendCell(row, String(index + 1));
        appendCell(row, item.productCode || "—");
        appendCell(row, item.productName);
        appendCell(row, item.imei || "—");
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
    button.addEventListener("click", () => setNavigation(button.dataset.page));
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
document.querySelector("#download-preview").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const feedback = document.querySelector("#preview-feedback");
    button.disabled = true;
    feedback.textContent = "";
    try {
        await window.BillPdf.download(previewBillData);
    } catch (error) {
        feedback.textContent = `Could not create PDF: ${error.message}`;
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
    } catch (error) {
        feedback.textContent = `Could not create PDF: ${error.message}`;
    } finally {
        button.disabled = !savedBillData;
    }
});
document.querySelector("#close-bill-details").addEventListener("click", () => {
    document.querySelector("#bill-detail-dialog").close();
});
document.querySelector("#clear-button").addEventListener("click", resetForm);
document.querySelector("#bill-search").addEventListener("input", (event) => {
    loadBills(event.target.value.trim());
});
document.querySelector("#customer-search").addEventListener("input", (event) => {
    window.clearTimeout(customerSearchTimer);
    customerSearchTimer = window.setTimeout(
        () => loadCustomerDirectory(event.target.value.trim()),
        250,
    );
});
document.querySelector("#product-search").addEventListener("input", (event) => {
    window.clearTimeout(productSearchTimer);
    productSearchTimer = window.setTimeout(
        () => loadProductDirectory(event.target.value.trim()),
        250,
    );
});
document.querySelector("#new-customer-button").addEventListener("click", () => {
    openDirectoryForm("customer");
});
document.querySelector("#new-product-button").addEventListener("click", () => {
    openDirectoryForm("product");
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
        document.querySelector(`#${button.dataset.closeDialog}`).close();
    });
});
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
    const items = readItems();
    if (!items.length || items.some((item) => !item.productName || !Number.isFinite(item.amount) || item.amount <= 0)) {
        setMessage("Add at least one item and use ✓ to confirm it.", "error");
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
    try {
        const result = await api(endpoint, {
            method: isEditing ? "PUT" : "POST",
            body: JSON.stringify({
                billNo: document.querySelector("#bill-number").value.trim(),
                billDate: document.querySelector("#bill-date").value,
                dueDate: document.querySelector("#due-date").value || null,
                customerId: customerSelect.value || null,
                customerName: customer.name,
                customerMobile: customer.mobile || null,
                customerAddress: customer.address || null,
                paid,
                items,
            }),
        });
        const savedBillNo = result.billNo;
        resetForm();
        setOperationFeedback("#bill-feedback", `Bill ${savedBillNo} ${isEditing ? "updated" : "saved"} successfully.`, "success");
        try {
            await Promise.all([loadDashboard(), loadBills(document.querySelector("#bill-search").value.trim()), loadLookups()]);
        } catch (error) {
            setOperationFeedback(
                "#bill-feedback",
                `Bill ${savedBillNo} was saved, but billing lookups could not refresh: ${error.message}`,
                "error",
            );
        }
    } catch (error) {
        setMessage(error.message, "error");
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
loadLookups().catch((error) => setMessage(`Could not load customers and products: ${error.message}`, "error"));
