import { json } from "../http";

export async function handleDashboard(request: Request, env: Env): Promise<Response | null> {
    const url = new URL(request.url);
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
    return null;
}
