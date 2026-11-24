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
        json(response, [product]);
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
        json(response, bills);
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
