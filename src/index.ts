// src/index.ts
type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

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
    productCode: string | null;
    productName: string;
    imei: string | null;
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

function json(data: unknown, status = 200): Response {
    return Response.json(data, { status });
}

function text(v: unknown): string | null {
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

async function readJson(request: Request): Promise<Parsed<Record<string, unknown>>> {
    try {
        const body = await request.json();
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
            return { ok: false, error: "Body must be a JSON object" };
        }
        return { ok: true, value: body as Record<string, unknown> };
    } catch {
        return { ok: false, error: "Invalid JSON" };
    }
}

function parseCustomer(b: Record<string, unknown>): Parsed<CustomerInput> {
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

function parseProduct(b: Record<string, unknown>): Parsed<ProductInput> {
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

function parseBill(b: Record<string, unknown>): Parsed<BillInput> {
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
    if (customerId !== null && (!Number.isInteger(customerId) || customerId < 1)) {
        return { ok: false, error: "customerId must be a positive integer" };
    }
    if (!Number.isFinite(paid) || paid < 0) {
        return { ok: false, error: "paid must be a non-negative number" };
    }
    if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 100) {
        return { ok: false, error: "items must contain between 1 and 100 products" };
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
        if (productCode && productCode.length > 20) {
            return { ok: false, error: "productCode must be at most 20 characters" };
        }
        if (imei && imei.length > 32) {
            return { ok: false, error: "imei must be at most 32 characters" };
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return { ok: false, error: "Each item amount must be greater than zero" };
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

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === "GET" && url.pathname === "/api/health") {
            return json({ status: "ok" });
        }

        if (request.method === "GET" && url.pathname === "/api/time") {
            const now = new Date();
            const ist = now.toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                timeZoneName: "short",
            });
            return json({ utc: now.toISOString(), ist });
        }

        if (url.pathname === "/api/dashboard") {
            if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

            const [summary, recent] = await Promise.all([
                env.DB.prepare(
                    `SELECT COUNT(*) AS billCount,
                        COALESCE(SUM(item_totals.total), 0) AS totalSales,
                        COALESCE(SUM(MAX(item_totals.total - b.paid, 0)), 0) AS outstanding
                    FROM bills b
                    LEFT JOIN (
                        SELECT bill_id, SUM(amount) AS total
                        FROM bill_items
                        GROUP BY bill_id
                    ) item_totals ON item_totals.bill_id = b.id`,
                ).all(),
                env.DB.prepare(
                    `SELECT b.id, b.bill_no AS billNo, b.bill_date AS billDate,
                        b.customer_name AS customerName, b.paid,
                        COALESCE(SUM(bi.amount), 0) AS total
                    FROM bills b
                    LEFT JOIN bill_items bi ON bi.bill_id = b.id
                    GROUP BY b.id
                    ORDER BY b.id DESC
                    LIMIT 6`,
                ).all(),
            ]);
            return json({
                summary: summary.results[0] ?? { billCount: 0, totalSales: 0, outstanding: 0 },
                recentBills: recent.results,
            });
        }

        if (url.pathname === "/api/bills") {
            if (request.method === "POST") {
                const body = await readJson(request);
                if (!body.ok) return json({ error: body.error }, 400);
                const parsed = parseBill(body.value);
                if (!parsed.ok) return json({ error: parsed.error }, 400);

                const bill = parsed.value;
                if (bill.customerId !== null) {
                    const customer = await env.DB
                        .prepare("SELECT id FROM customers WHERE id = ?")
                        .bind(bill.customerId)
                        .all();
                    if (customer.results.length === 0) {
                        return json({ error: "Customer not found" }, 404);
                    }
                }

                const customerExpression = bill.customerId === null ? "last_insert_rowid()" : "?";
                const statements = [];
                if (bill.customerId === null) {
                    statements.push(
                        env.DB.prepare(
                            "INSERT INTO customers (code, name, mobile, address) VALUES (?, ?, ?, ?)",
                        ).bind(null, bill.customerName, bill.customerMobile, bill.customerAddress),
                    );
                }
                statements.push(
                    env.DB.prepare(
                        `INSERT INTO bills
                            (bill_no, bill_date, due_date, customer_id, customer_name, customer_mobile, customer_address, paid)
                        VALUES (?, ?, ?, ${customerExpression}, ?, ?, ?, ?)`,
                    ).bind(
                        bill.billNo,
                        bill.billDate,
                        bill.dueDate,
                        ...(bill.customerId === null ? [] : [bill.customerId]),
                        bill.customerName,
                        bill.customerMobile,
                        bill.customerAddress,
                        bill.paid,
                    ),
                );
                for (const item of bill.items) {
                    statements.push(
                        env.DB.prepare(
                            `INSERT INTO bill_items (bill_id, product_code, product_name, imei, amount)
                            VALUES (
                                (SELECT id FROM bills WHERE bill_no = ? ORDER BY id DESC LIMIT 1),
                                ?, ?, ?, ?
                            )`,
                        ).bind(bill.billNo, item.productCode, item.productName, item.imei, item.amount),
                    );
                }

                const results = await env.DB.batch(statements);
                const billResultIndex = bill.customerId === null ? 1 : 0;
                return json({
                    id: results[billResultIndex].meta.last_row_id,
                    billNo: bill.billNo,
                    total: bill.items.reduce((sum, item) => sum + item.amount, 0),
                    due: bill.items.reduce((sum, item) => sum + item.amount, 0) - bill.paid,
                }, 201);
            }

            if (request.method === "GET") {
                const q = url.searchParams.get("q")?.trim();
                const base = `SELECT b.id, b.bill_no AS billNo, b.bill_date AS billDate,
                        b.due_date AS dueDate, b.customer_name AS customerName,
                        b.customer_mobile AS customerMobile, b.paid,
                        COALESCE(SUM(bi.amount), 0) AS total,
                        MAX(COALESCE(SUM(bi.amount), 0) - b.paid, 0) AS due
                    FROM bills b
                    LEFT JOIN bill_items bi ON bi.bill_id = b.id`;
                const stmt = q
                    ? env.DB.prepare(
                        `${base}
                        WHERE b.bill_no LIKE ? OR b.customer_name LIKE ? OR b.customer_mobile = ?
                        GROUP BY b.id ORDER BY b.id DESC LIMIT 100`,
                    ).bind(`%${q}%`, `%${q}%`, q)
                    : env.DB.prepare(`${base} GROUP BY b.id ORDER BY b.id DESC LIMIT 100`);
                const { results } = await stmt.all();
                return json(results);
            }

            return json({ error: "Method not allowed" }, 405);
        }

        if (url.pathname === "/api/customers") {
            if (request.method === "POST") {
                const body = await readJson(request);
                if (!body.ok) return json({ error: body.error }, 400);
                const parsed = parseCustomer(body.value);
                if (!parsed.ok) return json({ error: parsed.error }, 400);

                const c = parsed.value;
                const result = await env.DB
                    .prepare("INSERT INTO customers (code, name, mobile, address) VALUES (?, ?, ?, ?)")
                    .bind(c.code, c.name, c.mobile, c.address)
                    .run();
                return json({ id: result.meta.last_row_id, ...c }, 201);
            }

            if (request.method === "GET") {
                const q = url.searchParams.get("q")?.trim();
                const base = "SELECT id, code, name, mobile, address FROM customers";
                const stmt = q
                    ? env.DB
                        .prepare(`${base} WHERE code = ? OR mobile = ? OR name LIKE ? ORDER BY id DESC LIMIT 100`)
                        .bind(q, q, `%${q}%`)
                    : env.DB.prepare(`${base} ORDER BY id DESC LIMIT 100`);
                const { results } = await stmt.all();
                return json(results);
            }

            return json({ error: "Method not allowed" }, 405);
        }

        if (url.pathname === "/api/products") {
            if (request.method === "POST") {
                const body = await readJson(request);
                if (!body.ok) return json({ error: body.error }, 400);
                const parsed = parseProduct(body.value);
                if (!parsed.ok) return json({ error: parsed.error }, 400);

                const p = parsed.value;
                const result = await env.DB
                    .prepare("INSERT INTO products (code, name) VALUES (?, ?)")
                    .bind(p.code, p.name)
                    .run();
                return json({ id: result.meta.last_row_id, ...p }, 201);
            }

            if (request.method === "GET") {
                const q = url.searchParams.get("q")?.trim();
                const base = "SELECT id, code, name FROM products";
                const stmt = q
                    ? env.DB
                        .prepare(`${base} WHERE code = ? OR name LIKE ? ORDER BY id DESC LIMIT 100`)
                        .bind(q, `%${q}%`)
                    : env.DB.prepare(`${base} ORDER BY id DESC LIMIT 100`);
                const { results } = await stmt.all();
                return json(results);
            }

            return json({ error: "Method not allowed" }, 405);
        }

        return json({ error: "Not found" }, 404);
    },
};