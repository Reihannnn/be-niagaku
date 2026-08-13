import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
process.env.DATABASE_URL_SUPABASE = process.env.DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || "white-box-local-test-secret";

const { default: pool } = await import("../src/config/db.js");
const { default: cashierOrderRoutes } = await import("../src/routes/cashier-orders.js");
const { default: orderRoutes } = await import("../src/routes/orders.js");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/cashier-orders", cashierOrderRoutes);
app.use("/api/orders", orderRoutes);

let server;
let baseUrl;
let storeId;
let categoryId;
let productId;
let tableId;
let cashierId;
let token;

function unique(prefix) {
  return `${prefix.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
}

before(async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required in .env.local");

  const store = await pool.query(
    "INSERT INTO stores (name) VALUES ($1) RETURNING id",
    [unique("store")],
  );
  storeId = store.rows[0].id;

  const cashier = await pool.query(
    `INSERT INTO users (store_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'KASIR') RETURNING id`,
    [storeId, "Integration Cashier", `${unique("cashier")}@test.local`, "unused"],
  );
  cashierId = cashier.rows[0].id;

  const category = await pool.query(
    "INSERT INTO categories (store_id, name) VALUES ($1, $2) RETURNING id",
    [storeId, unique("category")],
  );
  categoryId = category.rows[0].id;

  const product = await pool.query(
    `INSERT INTO products (store_id, category_id, name, price, status)
     VALUES ($1, $2, $3, $4, 'AVAILABLE') RETURNING id`,
    [storeId, categoryId, unique("product"), 15000],
  );
  productId = product.rows[0].id;

  const table = await pool.query(
    "INSERT INTO tables (store_id, label) VALUES ($1, $2) RETURNING id",
    [storeId, unique("table")],
  );
  tableId = table.rows[0].id;

  token = jwt.sign(
    { id: cashierId, store_id: storeId, role: "KASIR" },
    process.env.JWT_SECRET,
  );

  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  if (storeId) {
    await pool.query(
      `DELETE FROM order_items
       WHERE order_id IN (SELECT id FROM orders WHERE store_id = $1)`,
      [storeId],
    );
    await pool.query("DELETE FROM orders WHERE store_id = $1", [storeId]);
    await pool.query("DELETE FROM products WHERE store_id = $1", [storeId]);
    await pool.query("DELETE FROM tables WHERE store_id = $1", [storeId]);
    await pool.query("DELETE FROM categories WHERE store_id = $1", [storeId]);
    await pool.query("DELETE FROM users WHERE store_id = $1", [storeId]);
    await pool.query("DELETE FROM stores WHERE id = $1", [storeId]);
  }
  await pool.end();
});

test("cashier CASH orders can be created, read with filters, updated, and paid", async () => {
  const created = await request("/api/cashier-orders", {
    method: "POST",
    body: {
      table_id: tableId,
      customer_name: "Integration Customer",
      customer_note: "No onions",
      payment_method: "CASH",
      items: [{ product_id: productId, quantity: 2, notes: "Extra hot" }],
    },
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.order.store_id, storeId);
  assert.equal(created.body.order.cashier_id, cashierId);
  assert.equal(created.body.order.source, "KASIR");
  assert.equal(created.body.order.payment_method, "CASH");
  assert.equal(created.body.order.total_amount, 30000);
  assert.equal(created.body.order.items.length, 1);
  assert.equal(created.body.order.items[0].quantity, 2);
  assert.equal(created.body.order.items[0].price_snapshot, 15000);

  const orderId = created.body.order.id;
  const saved = await pool.query(
    "SELECT store_id, cashier_id, table_id, source, status, payment_method, total_amount FROM orders WHERE id = $1",
    [orderId],
  );
  assert.deepEqual(saved.rows[0], {
    store_id: storeId,
    cashier_id: cashierId,
    table_id: tableId,
    source: "KASIR",
    status: "CONFIRMED",
    payment_method: "CASH",
    total_amount: 30000,
  });

  const table = await pool.query("SELECT status FROM tables WHERE id = $1", [tableId]);
  assert.equal(table.rows[0].status, "OCCUPIED");

  const orderDate = await pool.query(
    "SELECT TO_CHAR(ordered_at, 'YYYY-MM-DD') AS date FROM orders WHERE id = $1",
    [orderId],
  );
  const date = orderDate.rows[0].date;
  const listed = await request(`/api/orders?date=${date}&payment_method=CASH`);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.success, true);
  assert.equal(listed.body.data.some((order) => order.id === orderId), true);
  assert.equal(
    listed.body.data.find((order) => order.id === orderId).items[0].product_name !== undefined,
    true,
  );

  const preparing = await request(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    body: { status: "PREPARING" },
  });
  assert.equal(preparing.status, 200);
  assert.equal(preparing.body.success, true);
  assert.equal(preparing.body.data.status, "PREPARING");

  const filtered = await request(`/api/orders?date=${date}&status=PREPARING`);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.data.some((order) => order.id === orderId), true);

  const paid = await request(`/api/orders/${orderId}/pay-cash`, { method: "PATCH" });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.success, true);
  assert.equal(paid.body.data.status, "CONFIRMED");
  assert.ok(paid.body.data.paid_at);
});

test("order status routes reject invalid status and missing orders", async () => {
  const invalid = await request("/api/orders/00000000-0000-0000-0000-000000000000/status", {
    method: "PATCH",
    body: { status: "UNKNOWN" },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.success, false);

  const missingStatus = await request("/api/orders/00000000-0000-0000-0000-000000000000/status", {
    method: "PATCH",
    body: { status: "COMPLETED" },
  });
  assert.equal(missingStatus.status, 404);
  assert.equal(missingStatus.body.success, false);

  const missingPayment = await request("/api/orders/00000000-0000-0000-0000-000000000000/pay-cash", {
    method: "PATCH",
  });
  assert.equal(missingPayment.status, 404);
  assert.equal(missingPayment.body.success, false);
});
