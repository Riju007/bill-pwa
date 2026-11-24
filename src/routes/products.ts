import { json, readJson } from "../http";
import { parseProduct } from "../validation";

export async function handleProducts(request: Request, env: Env): Promise<Response | null> {
    const url = new URL(request.url);
    const productMatch = /^\/api\/products\/(\d+)$/.exec(url.pathname);
    if (productMatch) {
        const productId = Number(productMatch[1]);
        if (!Number.isSafeInteger(productId) || productId < 1) {
            return json({ error: "Invalid product id" }, 400);
        }

        if (request.method === "GET") {
            const product = await env.DB
                .prepare("SELECT id, code, name FROM products WHERE id = ?")
                .bind(productId)
                .all();
            return product.results[0]
                ? json(product.results[0])
                : json({ error: "Product not found" }, 404);
        }

        if (request.method === "PUT") {
            const body = await readJson(request);
            if (!body.ok) return json({ error: body.error }, 400);
            const parsed = parseProduct(body.value);
            if (!parsed.ok) return json({ error: parsed.error }, 400);
            const p = parsed.value;
            const result = await env.DB
                .prepare("UPDATE products SET code = ?, name = ? WHERE id = ?")
                .bind(p.code, p.name, productId)
                .run();
            if (result.meta.changes === 0) return json({ error: "Product not found" }, 404);
            return json({ id: productId, ...p });
        }

        if (request.method === "DELETE") {
            const result = await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(productId).run();
            if (result.meta.changes === 0) return json({ error: "Product not found" }, 404);
            return new Response(null, { status: 204 });
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
    return null;
}
