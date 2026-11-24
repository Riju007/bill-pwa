import { text, type Parsed } from "./http";

interface CustomerInput {
    code: string | null;
    name: string;
    mobile: string | null;
    address: string | null;
}

interface ProductInput {
    code: string | null;
    name: string;
}

interface BillItemInput {
    productCode: string;
    productName: string;
    imei: string;
    amount: number;
}

interface BillInput {
    billNo: string;
    billDate: string;
    dueDate: string | null;
    customerId: number | null;
    customerName: string;
    customerMobile: string | null;
    customerAddress: string | null;
    paid: number;
    items: BillItemInput[];
}

export function parseCustomer(b: Record<string, unknown>): Parsed<CustomerInput> {
    const name = text(b.name);
    const mobile = text(b.mobile);
    const code = text(b.code);
    const address = text(b.address);

    if (!name || name.length > 100) {
        return { ok: false, error: "name is required (max 100 characters)" };
    }
    if (mobile && !/^\d{10}$/.test(mobile)) {
        return { ok: false, error: "mobile must be exactly 10 digits" };
    }
    if (code && code.length > 20) {
        return { ok: false, error: "code must be at most 20 characters" };
    }
    if (address && address.length > 300) {
        return { ok: false, error: "address must be at most 300 characters" };
    }
    return { ok: true, value: { code, name, mobile, address } };
}

export function parseProduct(b: Record<string, unknown>): Parsed<ProductInput> {
    const name = text(b.name);
    const code = text(b.code);

    if (!name || name.length > 100) {
        return { ok: false, error: "name is required (max 100 characters)" };
    }
    if (code && code.length > 20) {
        return { ok: false, error: "code must be at most 20 characters" };
    }
    return { ok: true, value: { code, name } };
}

function validDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
        && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
        && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function parseBill(b: Record<string, unknown>): Parsed<BillInput> {
    const billNo = text(b.billNo);
    const billDate = text(b.billDate);
    const dueDate = text(b.dueDate);
    const customerName = text(b.customerName);
    const customerMobile = text(b.customerMobile);
    const customerAddress = text(b.customerAddress);
    const customerId = b.customerId === null || b.customerId === undefined || b.customerId === ""
        ? null
        : Number(b.customerId);
    const paid = Number(b.paid ?? 0);

    if (!billNo || billNo.length > 50) {
        return { ok: false, error: "billNo is required (max 50 characters)" };
    }
    if (!billDate || !validDate(billDate)) {
        return { ok: false, error: "billDate must be a valid YYYY-MM-DD date" };
    }
    if (dueDate && !validDate(dueDate)) {
        return { ok: false, error: "dueDate must be a valid YYYY-MM-DD date" };
    }
    if (!customerName || customerName.length > 100) {
        return { ok: false, error: "customerName is required (max 100 characters)" };
    }
    if (customerMobile && !/^\d{10}$/.test(customerMobile)) {
        return { ok: false, error: "customerMobile must be exactly 10 digits" };
    }
    if (customerAddress && customerAddress.length > 300) {
        return { ok: false, error: "customerAddress must be at most 300 characters" };
    }
    if (customerId === null || !Number.isInteger(customerId) || customerId < 1) {
        return { ok: false, error: "customerId is required and must be a positive integer" };
    }
    if (!Number.isFinite(paid) || paid < 0) {
        return { ok: false, error: "paid must be a non-negative number" };
    }
    if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 100) {
        return { ok: false, error: "items must contain between 1 and 100 items" };
    }

    const items: BillItemInput[] = [];
    for (const rawItem of b.items) {
        if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) {
            return { ok: false, error: "Each item must be an object" };
        }
        const item = rawItem as Record<string, unknown>;
        const productName = text(item.productName);
        const productCode = text(item.productCode);
        const imei = text(item.imei);
        const amount = Number(item.amount);
        if (!productName || productName.length > 100) {
            return { ok: false, error: "Each productName is required (max 100 characters)" };
        }
        if (!productCode || productCode.length > 20) {
            return { ok: false, error: "Each productCode is required (max 20 characters)" };
        }
        if (!imei || !/^\d{15}$/.test(imei)) {
            return { ok: false, error: "imei must be exactly 15 numeric digits" };
        }
        if (!Number.isFinite(amount) || amount < 1000 || amount > 500000) {
            return { ok: false, error: "Each item amount must be from 1000 to 500000" };
        }
        items.push({ productCode, productName, imei, amount });
    }

    const total = items.reduce((sum, item) => sum + item.amount, 0);
    if (paid > total) {
        return { ok: false, error: "paid cannot be greater than the bill total" };
    }

    return {
        ok: true,
        value: {
            billNo,
            billDate,
            dueDate,
            customerId,
            customerName,
            customerMobile,
            customerAddress,
            paid,
            items,
        },
    };
}
