-- Migration number: 0001 	 2026-11-23T12:28:31.279Z
-- migrations/<number>_init_schema.sql
-- Money columns are REAL by decision (see CONTEXT). Dates are YYYY-MM-DD text.

CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT NOT NULL,
    mobile TEXT,
    address TEXT,
    created_at TEXT NOT NULL DEFAULT(
        strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT(
        strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
);

CREATE TABLE bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_no TEXT NOT NULL,
    bill_date TEXT NOT NULL,
    due_date TEXT,
    customer_id INTEGER REFERENCES customers (id),
    customer_name TEXT NOT NULL, -- snapshot
    customer_mobile TEXT, -- snapshot
    customer_address TEXT, -- snapshot
    paid REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT(
        strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
);

CREATE TABLE bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL REFERENCES bills (id),
    product_code TEXT,
    product_name TEXT NOT NULL, -- snapshot
    imei TEXT,
    amount REAL NOT NULL
);

CREATE INDEX idx_customers_mobile ON customers (mobile);

CREATE INDEX idx_customers_code ON customers (code);

CREATE INDEX idx_bill_items_bill_id ON bill_items (bill_id);