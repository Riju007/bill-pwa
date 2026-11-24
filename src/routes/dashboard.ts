import { json } from "../http";

type CustomerBillRow = {
    customerId: number | null;
    customerName: string;
    billId: number;
    billNo: string;
    billDate: string;
    paid: number;
    itemId: number | null;
    productName: string | null;
    productCode: string | null;
    imei: string | null;
    amount: number | null;
};

type CustomerBill = {
    id: number;
    billNo: string;
    billDate: string;
    paid: number;
    total: number;
    due: number;
    items: { productName: string; productCode: string; imei: string; amount: number }[];
};

type CustomerBilling = {
    customerId: number | null;
    customerName: string;
    billCount: number;
    total: number;
    paid: number;
    due: number;
    bills: CustomerBill[];
};

function groupCustomerBills(rows: CustomerBillRow[]): CustomerBilling[] {
    const customers = new Map<string, CustomerBilling>();
    const bills = new Map<number, CustomerBill>();

    for (const row of rows) {
        const customerKey = row.customerId === null ? `name:${row.customerName}` : `id:${row.customerId}`;
        let customer = customers.get(customerKey);
        if (!customer) {
            customer = {
                customerId: row.customerId,
                customerName: row.customerName,
                billCount: 0,
                total: 0,
                paid: 0,
                due: 0,
                bills: [],
            };
            customers.set(customerKey, customer);
        }

        let bill = bills.get(row.billId);
        if (!bill) {
            bill = {
                id: row.billId,
                billNo: row.billNo,
                billDate: row.billDate,
                paid: Number(row.paid),
                total: 0,
                due: 0,
                items: [],
            };
            bills.set(row.billId, bill);
            customer.bills.push(bill);
        }

        if (row.itemId !== null) {
            const amount = Number(row.amount ?? 0);
            bill.items.push({
                productName: row.productName ?? "",
                productCode: row.productCode ?? "",
                imei: row.imei ?? "",
                amount,
            });
            bill.total += amount;
        }
        bill.due = Math.max(bill.total - bill.paid, 0);
    }

    for (const customer of customers.values()) {
        customer.billCount = customer.bills.length;
        customer.total = customer.bills.reduce((sum, bill) => sum + bill.total, 0);
        customer.paid = customer.bills.reduce((sum, bill) => sum + bill.paid, 0);
        customer.due = customer.bills.reduce((sum, bill) => sum + bill.due, 0);
    }

    return [...customers.values()].sort((left, right) =>
        right.total - left.total || left.customerName.localeCompare(right.customerName),
    );
}

export async function handleDashboard(request: Request, env: Env): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname === "/api/dashboard") {
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

        const [summary, recent, customerBills] = await Promise.all([
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
            env.DB.prepare(
                `SELECT b.customer_id AS customerId, b.customer_name AS customerName,
                    b.id AS billId, b.bill_no AS billNo, b.bill_date AS billDate, b.paid,
                    bi.id AS itemId, bi.product_name AS productName,
                    bi.product_code AS productCode, bi.imei, bi.amount
                FROM bills b
                LEFT JOIN bill_items bi ON bi.bill_id = b.id
                ORDER BY b.customer_name COLLATE NOCASE, b.id DESC, bi.id`,
            ).all(),
        ]);
        return json({
            summary: summary.results[0] ?? { billCount: 0, totalSales: 0, outstanding: 0 },
            recentBills: recent.results,
            customerBilling: groupCustomerBills(customerBills.results as CustomerBillRow[]),
        });
    }
    return null;
}
