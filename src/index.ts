// src/index.ts
type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

interface CustomerInput {
    code: string | null;
    name: string;
    mobile: string | null;
    address: string | null;
}

function json(data: unknown, status = 200): Response {
    return Response.json(data, { status });
}

function text(v: unknown): string | null {
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function parseCustomer(body: unknown): Parsed<CustomerInput> {
    if (typeof body !== "object" || body === null) {
        return { ok: false, error: "Body must be a JSON object" };
    }
    const b = body as Record<string, unknown>;
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

        if (url.pathname === "/api/customers") {
            if (request.method === "POST") {
                let body: unknown;
                try {
                    body = await request.json();
                } catch {
                    return json({ error: "Invalid JSON" }, 400);
                }
                const parsed = parseCustomer(body);
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

        return json({ error: "Not found" }, 404);
    },
};