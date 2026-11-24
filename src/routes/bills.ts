import { json, readJson } from "../http";
import { parseBill } from "../validation";

export async function handleBills(request: Request, env: Env): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname === "/api/bills/product-codes") {
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
        const { results } = await env.DB.prepare(
            `SELECT code
            FROM (
                SELECT code
                FROM products
                WHERE code IS NOT NULL AND TRIM(code) <> ''
                UNION
                SELECT product_code AS code
                FROM bill_items
                WHERE product_code IS NOT NULL AND TRIM(product_code) <> ''
            )
            ORDER BY code COLLATE NOCASE`,
        ).all();
        return json(results.map((row) => row.code));
    }
    if (url.pathname === "/api/bills/product-names") {
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
        const { results } = await env.DB.prepare(
            `SELECT name
            FROM (
                SELECT name
                FROM products
                WHERE name IS NOT NULL AND TRIM(name) <> ''
                UNION
                SELECT product_name AS name
                FROM bill_items
                WHERE product_name IS NOT NULL AND TRIM(product_name) <> ''
            )
            ORDER BY name COLLATE NOCASE`,
        ).all();
        return json(results.map((row) => row.name));
    }

    const billDetailMatch = /^\/api\/bills\/(\d+)$/.exec(url.pathname);
    if (billDetailMatch) {
        const billId = Number(billDetailMatch[1]);
        if (!Number.isSafeInteger(billId) || billId < 1) return json({ error: "Invalid bill id" }, 400);

        if (request.method === "GET") {
            const [billResult, itemsResult] = await Promise.all([
                env.DB.prepare(
                    `SELECT id, bill_no AS billNo, bill_date AS billDate,
                        due_date AS dueDate, customer_id AS customerId,
                        customer_name AS customerName, customer_mobile AS customerMobile,
                        customer_address AS customerAddress, paid
                    FROM bills
                    WHERE id = ?`,
                ).bind(billId).all(),
                env.DB.prepare(
                    `SELECT product_code AS productCode, product_name AS productName, imei, amount
                    FROM bill_items
                    WHERE bill_id = ?
                    ORDER BY id`,
                ).bind(billId).all(),
            ]);
            const bill = billResult.results[0];
            if (!bill) return json({ error: "Bill not found" }, 404);

            const items = itemsResult.results;
            const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
            return json({ ...bill, items, total, due: total - Number(bill.paid) });
        }

        if (request.method === "PUT") {
            const body = await readJson(request);
            if (!body.ok) return json({ error: body.error }, 400);
            const parsed = parseBill(body.value);
            if (!parsed.ok) return json({ error: parsed.error }, 400);
            const bill = parsed.value;

            const existing = await env.DB.prepare("SELECT id FROM bills WHERE id = ?").bind(billId).all();
            if (existing.results.length === 0) return json({ error: "Bill not found" }, 404);
            if (bill.customerId !== null) {
                const customer = await env.DB
                    .prepare("SELECT id FROM customers WHERE id = ?")
                    .bind(bill.customerId)
                    .all();
                if (customer.results.length === 0) return json({ error: "Customer not found" }, 404);
            }
            /* Product catalog validation is paused while bill items are entered manually.
            for (const item of bill.items) {
                const product = await env.DB
                    .prepare("SELECT id FROM products WHERE name = ? AND (? IS NULL OR code = ?) LIMIT 1")
                    .bind(item.productName, item.productCode, item.productCode)
                    .all();
                if (product.results.length === 0) {
                    return json({ error: `Product not found: ${item.productName}` }, 404);
                }
            }
            */

            const statements = [
                env.DB.prepare(
                    `UPDATE bills
                    SET bill_no = ?, bill_date = ?, due_date = ?, customer_id = ?,
                        customer_name = ?, customer_mobile = ?, customer_address = ?, paid = ?
                    WHERE id = ?`,
                ).bind(
                    bill.billNo,
                    bill.billDate,
                    bill.dueDate,
                    bill.customerId,
                    bill.customerName,
                    bill.customerMobile,
                    bill.customerAddress,
                    bill.paid,
                    billId,
                ),
                env.DB.prepare("DELETE FROM bill_items WHERE bill_id = ?").bind(billId),
            ];
            for (const item of bill.items) {
                statements.push(
                    env.DB.prepare(
                        `INSERT INTO bill_items (bill_id, product_code, product_name, imei, amount)
                        VALUES (?, ?, ?, ?, ?)`,
                    ).bind(billId, item.productCode, item.productName, item.imei, item.amount),
                );
            }
            await env.DB.batch(statements);
            const total = bill.items.reduce((sum, item) => sum + item.amount, 0);
            return json({ id: billId, ...bill, total, due: total - bill.paid });
        }

        if (request.method === "DELETE") {
            const existing = await env.DB.prepare("SELECT id FROM bills WHERE id = ?").bind(billId).all();
            if (existing.results.length === 0) return json({ error: "Bill not found" }, 404);
            await env.DB.batch([
                env.DB.prepare("DELETE FROM bill_items WHERE bill_id = ?").bind(billId),
                env.DB.prepare("DELETE FROM bills WHERE id = ?").bind(billId),
            ]);
            return new Response(null, { status: 204 });
        }

        return json({ error: "Method not allowed" }, 405);
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
            /* Product catalog validation is paused while bill items are entered manually.
            for (const item of bill.items) {
                const product = await env.DB
                    .prepare("SELECT id FROM products WHERE name = ? AND (? IS NULL OR code = ?) LIMIT 1")
                    .bind(item.productName, item.productCode, item.productCode)
                    .all();
                if (product.results.length === 0) {
                    return json({ error: `Product not found: ${item.productName}` }, 404);
                }
            }
            */

            const statements = [];
            statements.push(
                env.DB.prepare(
                    `INSERT INTO bills
                        (bill_no, bill_date, due_date, customer_id, customer_name, customer_mobile, customer_address, paid)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                ).bind(
                    bill.billNo,
                    bill.billDate,
                    bill.dueDate,
                    bill.customerId,
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
            return json({
                id: results[0].meta.last_row_id,
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
    return null;
}
