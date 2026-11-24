import { json, readJson } from "../http";
import { parseCustomer } from "../validation";

export async function handleCustomers(request: Request, env: Env): Promise<Response | null> {
    const url = new URL(request.url);
    const customerMatch = /^\/api\/customers\/(\d+)$/.exec(url.pathname);
    if (customerMatch) {
        const customerId = Number(customerMatch[1]);
        if (!Number.isSafeInteger(customerId) || customerId < 1) {
            return json({ error: "Invalid customer id" }, 400);
        }

        if (request.method === "GET") {
            const customer = await env.DB
                .prepare("SELECT id, code, name, mobile, address, created_at AS createdAt FROM customers WHERE id = ?")
                .bind(customerId)
                .all();
            return customer.results[0]
                ? json(customer.results[0])
                : json({ error: "Customer not found" }, 404);
        }

        if (request.method === "PUT") {
            const body = await readJson(request);
            if (!body.ok) return json({ error: body.error }, 400);
            const parsed = parseCustomer(body.value);
            if (!parsed.ok) return json({ error: parsed.error }, 400);
            const c = parsed.value;
            const result = await env.DB
                .prepare("UPDATE customers SET code = ?, name = ?, mobile = ?, address = ? WHERE id = ?")
                .bind(c.code, c.name, c.mobile, c.address, customerId)
                .run();
            if (result.meta.changes === 0) return json({ error: "Customer not found" }, 404);
            return json({ id: customerId, ...c });
        }

        if (request.method === "DELETE") {
            const linkedBills = await env.DB
                .prepare("SELECT id FROM bills WHERE customer_id = ? LIMIT 1")
                .bind(customerId)
                .all();
            if (linkedBills.results.length > 0) {
                return json({ error: "This customer has saved bills and cannot be deleted." }, 409);
            }
            const result = await env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(customerId).run();
            if (result.meta.changes === 0) return json({ error: "Customer not found" }, 404);
            return new Response(null, { status: 204 });
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
    return null;
}
