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
    address: "12 Example Road, Kolkata",
};
const product = { id: 1, code: "P001", name: "Sample Phone" };
const bill = {
    id: 7,
    billNo: "INV-40",
    billDate: "2026-11-24",
    dueDate: "2026-12-01",
    customerId: customer.id,
    customerName: customer.name,
    customerMobile: customer.mobile,
    customerAddress: customer.address,
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
const bills = [{
    id: bill.id,
    billNo: bill.billNo,
    billDate: bill.billDate,
    customerName: bill.customerName,
    paid: bill.paid,
    total: bill.total,
    due: bill.due,
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
            summary: { billCount: 1, totalSales: bill.total, outstanding: bill.due },
            recentBills: bills,
        });
        return;
    }
    if (url.pathname === "/api/customers") {
        json(response, [customer]);
        return;
    }
    if (url.pathname === "/api/products") {
        json(response, [product]);
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
