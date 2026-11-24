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

test("customer creation rejects an invalid mobile number before accessing D1", async () => {
    const response = await worker.fetch(new Request("https://billwise.test/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Sample Customer", mobile: "12345" }),
    }), env);

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /exactly 10 digits/);
});
