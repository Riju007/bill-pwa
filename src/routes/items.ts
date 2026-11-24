import { json } from "../http";

const itemFields = `bi.id, bi.product_name AS productName, bi.product_code AS productCode,
    bi.imei, bi.amount, b.id AS billId, b.bill_no AS billNo, b.bill_date AS billDate,
    b.customer_id AS customerId, b.customer_name AS customerName,
    b.customer_mobile AS customerMobile, b.customer_address AS customerAddress`;
const itemJoin = `FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id`;

export async function handleItems(request: Request, env: Env): Promise<Response | null> {
    const url = new URL(request.url);
    const itemMatch = /^\/api\/items\/(\d+)$/.exec(url.pathname);
    if (itemMatch) {
        const itemId = Number(itemMatch[1]);
        if (!Number.isSafeInteger(itemId) || itemId < 1) return json({ error: "Invalid item id" }, 400);
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

        const { results } = await env.DB
            .prepare(`SELECT ${itemFields} ${itemJoin} WHERE bi.id = ?`)
            .bind(itemId)
            .all();
        return results[0] ? json(results[0]) : json({ error: "Item not found" }, 404);
    }

    if (url.pathname !== "/api/items") return null;
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const pageParam = url.searchParams.get("page") ?? "1";
    if (!/^[1-9]\d*$/.test(pageParam) || !Number.isSafeInteger(Number(pageParam))) {
        return json({ error: "page must be a positive integer" }, 400);
    }

    const query = url.searchParams.get("q")?.trim();
    const filter = query
        ? ` WHERE bi.product_name LIKE ? OR bi.product_code LIKE ? OR bi.imei LIKE ?
            OR b.bill_no LIKE ? OR b.customer_name LIKE ? OR b.customer_mobile LIKE ?`
        : "";
    const queryPattern = query ? `%${query}%` : "";
    const filterValues = query
        ? [queryPattern, queryPattern, queryPattern, queryPattern, queryPattern, queryPattern]
        : [];
    const pageSize = 10;
    const count = await env.DB
        .prepare(`SELECT COUNT(*) AS total ${itemJoin}${filter}`)
        .bind(...filterValues)
        .all();
    const total = Number(count.results[0]?.total ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Number(pageParam), pageCount);
    const { results } = await env.DB
        .prepare(`SELECT ${itemFields} ${itemJoin}${filter} ORDER BY bi.id DESC LIMIT ? OFFSET ?`)
        .bind(...filterValues, pageSize, (page - 1) * pageSize)
        .all();

    return json({ items: results, page, pageSize, total, pageCount });
}
