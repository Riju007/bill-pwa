import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const publicRoot = resolve(fileURLToPath(new URL("../public/", import.meta.url)));
const customer = {
    id: 1,
    code: "C001",
    name: "Sample Customer",
    mobile: "9876543210",
    address: "Example Road, Kolkata, ".repeat(8),
    createdAt: "2026-11-23T12:00:00.000Z",
};
const customers = [customer];
const product = { id: 1, code: "P001", name: "Sample Phone" };
const products = [
    product,
    ...Array.from({ length: 10 }, (_, index) => ({
        id: index + 2,
        code: `P${String(index + 2).padStart(3, "0")}`,
        name: `Saved Item ${index + 2}`,
    })),
];
const bill = {
    id: 7,
    billNo: "INV-40",
    billDate: "2026-11-24",
    dueDate: "2026-12-01",
    customerId: customer.id,
    customerName: customer.name,
    customerMobile: customer.mobile,
    customerAddress: "12 Example Road, Kolkata",
    paid: 10000,
    items: Array.from({ length: 40 }, (_, index) => ({
        productCode: product.code,
        productName: `${product.name} ${index + 1}`,
        imei: String(index + 1).padStart(15, "0"),
        amount: 1200,
    })),
    total: 48000,
    due: 38000,
};
const secondBill = {
    id: 8,
    billNo: "INV-41",
    billDate: "2026-11-25",
    dueDate: "2026-12-02",
    customerId: customer.id,
    customerName: customer.name,
    customerMobile: customer.mobile,
    customerAddress: "12 Example Road, Kolkata",
    paid: 500,
    items: [{
        productCode: "P002",
        productName: "Second Phone",
        imei: "222222222222222",
        amount: 1500,
    }],
    total: 1500,
    due: 1000,
};
const bills = [secondBill, bill].map((entry) => ({
    id: entry.id,
    billNo: entry.billNo,
    billDate: entry.billDate,
    dueDate: entry.dueDate,
    customerName: entry.customerName,
    paid: entry.paid,
    total: entry.total,
    due: entry.due,
}));
const itemRecords = [
    ...bill.items.map((item, index) => ({
        id: index + 1,
        ...item,
        billId: bill.id,
        billNo: bill.billNo,
        billDate: bill.billDate,
        customerId: bill.customerId,
        customerName: bill.customerName,
        customerMobile: bill.customerMobile,
        customerAddress: bill.customerAddress,
    })),
    ...secondBill.items.map((item, index) => ({
        id: bill.items.length + index + 1,
        ...item,
        billId: secondBill.id,
        billNo: secondBill.billNo,
        billDate: secondBill.billDate,
        customerId: secondBill.customerId,
        customerName: secondBill.customerName,
        customerMobile: secondBill.customerMobile,
        customerAddress: secondBill.customerAddress,
    })),
];
const customerBilling = [{
    customerId: customer.id,
    customerName: customer.name,
    billCount: 2,
    total: 49500,
    paid: 10500,
    due: 39000,
    bills: [secondBill, bill].map((entry) => ({
        id: entry.id,
        billNo: entry.billNo,
        billDate: entry.billDate,
        paid: entry.paid,
        total: entry.total,
        due: entry.due,
        items: entry.items,
    })),
}];
const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".webmanifest": "application/manifest+json",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

function json(response, value, status = 200) {
    response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1:4173");
    if (url.pathname === "/api/dashboard") {
        json(response, {
            summary: { billCount: 2, totalSales: 49500, outstanding: 39000 },
            recentBills: bills,
            customerBilling,
        });
        return;
    }
    if (url.pathname === "/api/customers" && request.method === "POST") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const draft = JSON.parse(body);
        const saved = {
            id: customers.length + 1,
            createdAt: "2026-11-24T12:00:00.000Z",
            ...draft,
        };
        customers.push(saved);
        json(response, saved, 201);
        return;
    }
    const customerDetailMatch = /^\/api\/customers\/(\d+)$/.exec(url.pathname);
    if (customerDetailMatch && request.method === "GET") {
        const entry = customers.find((item) => item.id === Number(customerDetailMatch[1]));
        if (entry) {
            json(response, entry);
            return;
        }
        json(response, { error: "Not found" }, 404);
        return;
    }
    if (url.pathname === "/api/customers" && request.method === "GET") {
        const pageValue = url.searchParams.get("page");
        if (pageValue !== null) {
            const requestedPage = Number(pageValue);
            if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
                json(response, { error: "page must be a positive integer" }, 400);
                return;
            }
            const query = url.searchParams.get("q")?.trim().toLowerCase();
            const matches = customers.filter((entry) => !query
                || entry.code === query
                || entry.mobile === query
                || entry.name.toLowerCase().includes(query));
            const pageSize = 10;
            const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
            const page = Math.min(requestedPage, pageCount);
            json(response, {
                items: matches.slice((page - 1) * pageSize, page * pageSize),
                page,
                pageSize,
                total: matches.length,
                pageCount,
            });
            return;
        }
        json(response, customers);
        return;
    }
    if (url.pathname === "/api/products") {
        const query = url.searchParams.get("q")?.trim().toLowerCase();
        const results = [...products]
            .reverse()
            .filter((entry) => !query || entry.code.toLowerCase() === query || entry.name.toLowerCase().includes(query));
        const pageParam = url.searchParams.get("page");
        if (pageParam) {
            const pageSize = 10;
            const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
            const page = Math.min(Number(pageParam), pageCount);
            json(response, {
                items: results.slice((page - 1) * pageSize, page * pageSize),
                page,
                pageSize,
                total: results.length,
                pageCount,
            });
        } else {
            json(response, results.slice(0, 100));
        }
        return;
    }
    const productMatch = /^\/api\/products\/(\d+)$/.exec(url.pathname);
    if (productMatch && request.method === "GET") {
        const entry = products.find((candidate) => candidate.id === Number(productMatch[1]));
        json(response, entry || { error: "Product not found" }, entry ? 200 : 404);
        return;
    }
    if (url.pathname === "/api/bills/product-codes") {
        json(response, ["P001", "P002"]);
        return;
    }
    if (url.pathname === "/api/bills/product-names") {
        json(response, ["Sample Phone", "Second Phone"]);
        return;
    }
    if (url.pathname === "/api/bills" && request.method === "GET") {
        const pageParam = url.searchParams.get("page");
        if (pageParam) {
            const query = url.searchParams.get("q")?.trim().toLowerCase();
            const matches = bills.filter((entry) => !query
                || entry.billNo.toLowerCase().includes(query)
                || entry.customerName.toLowerCase().includes(query));
            const pageSize = 10;
            const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
            const page = Math.min(Number(pageParam), pageCount);
            json(response, {
                items: matches.slice((page - 1) * pageSize, page * pageSize),
                page,
                pageSize,
                total: matches.length,
                pageCount,
            });
        } else {
            json(response, bills);
        }
        return;
    }
    if (url.pathname === "/api/items") {
        const query = url.searchParams.get("q")?.trim().toLowerCase();
        const matches = [...itemRecords]
            .reverse()
            .filter((entry) => !query || [
                entry.productName,
                entry.productCode,
                entry.imei,
                entry.billNo,
                entry.customerName,
                entry.customerMobile,
            ].some((value) => value?.toLowerCase().includes(query)));
        const pageSize = 10;
        const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
        const page = Math.min(Number(url.searchParams.get("page")) || 1, pageCount);
        json(response, {
            items: matches.slice((page - 1) * pageSize, page * pageSize),
            page,
            pageSize,
            total: matches.length,
            pageCount,
        });
        return;
    }
    const itemMatch = /^\/api\/items\/(\d+)$/.exec(url.pathname);
    if (itemMatch && request.method === "GET") {
        const entry = itemRecords.find((candidate) => candidate.id === Number(itemMatch[1]));
        json(response, entry || { error: "Item not found" }, entry ? 200 : 404);
        return;
    }
    if (url.pathname === "/api/bills/7" && request.method === "GET") {
        json(response, bill);
        return;
    }
    if (url.pathname === "/api/bills/8" && request.method === "GET") {
        json(response, secondBill);
        return;
    }
    if (url.pathname === "/api/bills" && request.method === "POST") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const draft = JSON.parse(body);
        json(response, { id: 8, billNo: draft.billNo, ...draft }, 201);
        return;
    }
    if (url.pathname.startsWith("/api/")) {
        json(response, { error: "Not found" }, 404);
        return;
    }

    let filePath;
    try {
        filePath = resolve(publicRoot, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
    } catch {
        response.writeHead(400).end();
        return;
    }
    if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) {
        response.writeHead(403).end();
        return;
    }
    response.writeHead(200, {
        "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).on("error", () => response.destroy()).pipe(response);
});

server.listen(4173, "127.0.0.1");
