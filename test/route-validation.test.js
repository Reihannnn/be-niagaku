import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

import categoryRoutes from "../src/routes/categories.js";
import tableRoutes from "../src/routes/tables.js";
import selfOrderRoutes from "../src/routes/selforder.js";
import orderRoutes from "../src/routes/orders.js";

process.env.JWT_SECRET = "white-box-test-secret";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/categories", categoryRoutes);
app.use("/tables", tableRoutes);
app.use("/self-orders", selfOrderRoutes);
app.use("/orders", orderRoutes);

let server;
let baseUrl;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function token(role = "ADMIN") {
  return jwt.sign({ id: "user-1", store_id: "store-1", role }, process.env.JWT_SECRET);
}

async function request(path, { method = "POST", body, role = "ADMIN" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token(role)}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("category validation rejects empty names", async () => {
  const result = await request("/categories", { body: { name: "   " } });
  assert.equal(result.status, 400);
  assert.equal(result.body.message, "Nama kategori wajib diisi");
});

test("category validation rejects names longer than 25 characters", async () => {
  const result = await request("/categories", { body: { name: "a".repeat(26) } });
  assert.equal(result.status, 400);
  assert.equal(result.body.message, "Nama kategori maksimal 25 karakter");
});

test("category admin guard rejects KASIR before database access", async () => {
  const result = await request("/categories", { role: "KASIR", body: { name: "Test" } });
  assert.equal(result.status, 403);
  assert.equal(result.body.message, "Akses ditolak");
});

test("table validation rejects empty labels", async () => {
  const result = await request("/tables", { body: { label: "" } });
  assert.equal(result.status, 400);
  assert.equal(result.body.message, "Label meja wajib diisi");
});

test("table validation rejects labels longer than 50 characters", async () => {
  const result = await request("/tables", { body: { label: "a".repeat(51) } });
  assert.equal(result.status, 400);
  assert.equal(result.body.message, "Label meja maksimal 50 karakter");
});

test("table admin guard rejects KASIR before database access", async () => {
  const result = await request("/tables", { role: "KASIR", body: { label: "Test" } });
  assert.equal(result.status, 403);
  assert.equal(result.body.message, "Akses ditolak");
});

test("self-order validation rejects missing table token", async () => {
  const result = await request("/self-orders/self-order", { body: { customer_name: "Test", payment_method: "CASH", items: [{}] } });
  assert.equal(result.status, 400);
  assert.equal(result.body.message, "Token meja wajib diisi");
});

test("self-order validation rejects an empty cart", async () => {
  const result = await request("/self-orders/self-order", { body: { token: "table-token", customer_name: "Test", payment_method: "CASH", items: [] } });
  assert.equal(result.status, 400);
  assert.equal(result.body.message, "Keranjang kosong");
});

test("order status validation rejects an unknown status", async () => {
  const result = await request("/orders/order-1/status", { method: "PATCH", body: { status: "UNKNOWN" } });
  assert.equal(result.status, 400);
  assert.equal(result.body.message, "Status tidak valid");
});
