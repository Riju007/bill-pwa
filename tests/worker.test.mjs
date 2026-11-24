import assert from "node:assert/strict";
import test from "node:test";
import workerModule from "../src/index.ts";

const worker = workerModule.default ?? workerModule;
const env = {
    DB: {
        prepare() {
            throw new Error("Invalid requests should not query the database");
        },
    },
};

test("health endpoint returns an OK status", async () => {
    const response = await worker.fetch(new Request("https://billwise.test/api/health"), env);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
});

test("bill creation rejects an invalid date before accessing D1", async () => {
    const response = await worker.fetch(new Request("https://billwise.test/api/bills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billNo: "INV-1", billDate: "2026-02-30" }),
    }), env);

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /valid YYYY-MM-DD date/);
});

test("bill creation rejects payment greater than its item total", async () => {
    const response = await worker.fetch(new Request("https://billwise.test/api/bills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            billNo: "INV-2",
            billDate: "2026-11-24",
            customerId: 1,
            customerName: "Sample Customer",
            paid: 1500,
            items: [{
                productCode: "P001",
                productName: "Sample Phone",
                imei: "123456789012345",
                amount: 1000,
            }],
        }),
    }), env);

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /paid cannot be greater than the bill total/);
});

test("bill creation rejects duplicate IMEIs before accessing D1", async () => {
    const response = await worker.fetch(new Request("https://billwise.test/api/bills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            billNo: "INV-DUPLICATE-IMEI",
            billDate: "2026-11-24",
            customerId: 1,
            customerName: "Sample Customer",
            items: [
                { productCode: "P001", productName: "Phone One", imei: "123456789012345", amount: 1200 },
                { productCode: "P002", productName: "Phone Two", imei: "123456789012345", amount: 1500 },
            ],
        }),
    }), env);

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /IMEI must be unique within the bill/);
});

test("bill creation accepts manually entered items outside the product catalog", async () => {
    const manualBillEnv = {
        DB: {
            prepare(query) {
                return {
                    bind() {
                        return {
                            all: async () => ({
                                results: query.includes("FROM customers") ? [{ id: 1 }] : [],
                            }),
                        };
                    },
                };
            },
            batch: async () => [{ meta: { last_row_id: 12 } }],
        },
    };
    const response = await worker.fetch(new Request("https://billwise.test/api/bills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            billNo: "INV-MANUAL",
            billDate: "2026-11-24",
            customerId: 1,
            customerName: "Sample Customer",
            paid: 0,
            items: [{
                productName: "Manual Phone",
                productCode: "MAN-001",
                imei: "123456789012345",
                amount: 1200,
            }],
        }),
    }), manualBillEnv);

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
        id: 12,
        billNo: "INV-MANUAL",
        total: 1200,
        due: 1200,
    });
});

test("customer creation rejects an invalid mobile number before accessing D1", async () => {
    const response = await worker.fetch(new Request("https://billwise.test/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Sample Customer", mobile: "12345" }),
    }), env);

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /exactly 10 digits/);
});

test("customer creation requires a mobile number", async () => {
    const response = await worker.fetch(new Request("https://billwise.test/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Sample Customer" }),
    }), env);

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /mobile is required/);
});

test("customer address is limited to 200 characters", async () => {
    const response = await worker.fetch(new Request("https://billwise.test/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            name: "Sample Customer",
            mobile: "9876543210",
            address: "A".repeat(201),
        }),
    }), env);

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /at most 200 characters/);
});

test("customer creation saves a valid customer", async () => {
    const customerEnv = {
        DB: {
            prepare() {
                return {
                    bind() {
                        return {
                            run: async () => ({ meta: { last_row_id: 21 } }),
                        };
                    },
                };
            },
        },
    };
    const response = await worker.fetch(new Request("https://billwise.test/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            name: "New Customer",
            mobile: "9876543210",
            address: "Kolkata",
        }),
    }), customerEnv);

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
        id: 21,
        code: null,
        name: "New Customer",
        mobile: "9876543210",
        address: "Kolkata",
    });
});

test("customer details include their creation date", async () => {
    const customerEnv = {
        DB: {
            prepare(query) {
                assert.match(query, /created_at AS createdAt/);
                return {
                    bind() {
                        return {
                            all: async () => ({
                                results: [{
                                    id: 21,
                                    name: "Sample Customer",
                                    code: "C001",
                                    mobile: "9876543210",
                                    address: "Example Road",
                                    createdAt: "2026-11-23T12:00:00.000Z",
                                }],
                            }),
                        };
                    },
                };
            },
        },
    };
    const response = await worker.fetch(new Request("https://billwise.test/api/customers/21"), customerEnv);

    assert.equal(response.status, 200);
    assert.equal((await response.json()).createdAt, "2026-11-23T12:00:00.000Z");
});

test("customer directory returns the requested page with a total count", async () => {
    const customerEnv = {
        DB: {
            prepare(query) {
                return {
                    bind(...values) {
                        return {
                            all: async () => {
                                if (query.includes("COUNT(*)")) return { results: [{ total: 12 }] };
                                assert.match(query, /LIMIT \? OFFSET \?/);
                                assert.deepEqual(values, [10, 10]);
                                return {
                                    results: [
                                        { id: 11, name: "Customer 11" },
                                        { id: 12, name: "Customer 12" },
                                    ],
                                };
                            },
                        };
                    },
                };
            },
        },
    };
    const response = await worker.fetch(new Request("https://billwise.test/api/customers?page=2"), customerEnv);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        items: [
            { id: 11, name: "Customer 11" },
            { id: 12, name: "Customer 12" },
        ],
        page: 2,
        pageSize: 10,
        total: 12,
        pageCount: 2,
    });
});

test("product code suggestions include saved catalog and bill item codes", async () => {
    const suggestionsEnv = {
        DB: {
            prepare(query) {
                assert.match(query, /UNION/);
                return {
                    all: async () => ({
                        results: [{ code: "CAT-1" }, { code: "BILL-1" }],
                    }),
                };
            },
        },
    };
    const response = await worker.fetch(new Request("https://billwise.test/api/bills/product-codes"), suggestionsEnv);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), ["CAT-1", "BILL-1"]);
});

test("product name suggestions include catalog and previous bill items", async () => {
    const suggestionsEnv = {
        DB: {
            prepare(query) {
                assert.match(query, /UNION/);
                return {
                    all: async () => ({
                        results: [{ name: "Catalog Phone" }, { name: "Previously Billed Phone" }],
                    }),
                };
            },
        },
    };
    const response = await worker.fetch(new Request("https://billwise.test/api/bills/product-names"), suggestionsEnv);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), ["Catalog Phone", "Previously Billed Phone"]);
});

test("dashboard aggregates bills and items by customer", async () => {
    const customerBillRows = [
        {
            customerId: 1,
            customerName: "Sample Customer",
            billId: 2,
            billNo: "INV-2",
            billDate: "2026-11-25",
            paid: 500,
            itemId: 3,
            productName: "Second Phone",
            productCode: "P002",
            imei: "222222222222222",
            amount: 2000,
        },
        {
            customerId: 1,
            customerName: "Sample Customer",
            billId: 1,
            billNo: "INV-1",
            billDate: "2026-11-24",
            paid: 500,
            itemId: 1,
            productName: "First Phone",
            productCode: "P001",
            imei: "111111111111111",
            amount: 1000,
        },
    ];
    const dashboardEnv = {
        DB: {
            prepare(query) {
                return {
                    all: async () => {
                        if (query.includes("COUNT(*) AS billCount")) {
                            return { results: [{ billCount: 2, totalSales: 3000, outstanding: 2000 }] };
                        }
                        if (query.includes("b.due_date AS dueDate")) {
                            return { results: [{ billNo: "INV-2", dueDate: "2026-12-01" }] };
                        }
                        if (query.includes("bi.id AS itemId")) return { results: customerBillRows };
                        return { results: [] };
                    },
                };
            },
        },
    };
    const response = await worker.fetch(new Request("https://billwise.test/api/dashboard"), dashboardEnv);
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.recentBills[0].dueDate, "2026-12-01");
    assert.equal(result.customerBilling.length, 1);
    assert.deepEqual(
        {
            billCount: result.customerBilling[0].billCount,
            total: result.customerBilling[0].total,
            paid: result.customerBilling[0].paid,
            due: result.customerBilling[0].due,
        },
        { billCount: 2, total: 3000, paid: 1000, due: 2000 },
    );
    assert.deepEqual(result.customerBilling[0].bills.map((bill) => bill.items[0].productName), [
        "Second Phone",
        "First Phone",
    ]);
});
