import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
process.env.DATABASE_URL_SUPABASE = process.env.DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || "white-box-local-test-secret";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const { default: pool } = await import("../src/config/db.js");
const { default: tableRoutes } = await import("../src/routes/tables.js");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/tables", tableRoutes);

let server;
let baseUrl;
let storeId;
let tableId;
let originalQrToken;
let token;

function unique(value) {
  return `${value.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
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
  assert.ok(process.env.DATABASE_URL_SUPABASE, "DATABASE_URL is required in .env.local");

  const store = await pool.query(
    "INSERT INTO stores (name) VALUES ($1) RETURNING id",
    [unique("table-store")],
  );
  storeId = store.rows[0].id;

  token = jwt.sign(
    { id: unique("admin"), store_id: storeId, role: "ADMIN" },
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

  if (tableId) {
    await pool.query("DELETE FROM tables WHERE id = $1", [tableId]);
  }
  if (storeId) {
    await pool.query("DELETE FROM stores WHERE id = $1", [storeId]);
  }
  await pool.end();
});

test("table routes create, list, update, regenerate QR, and delete a local row", async () => {
  const created = await request("/tables", {
    method: "POST",
    body: { label: unique("table") },
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  assert.equal(created.body.data.store_id, storeId);
  assert.equal(created.body.data.status, "AVAILABLE");
  assert.match(created.body.data.order_url, /^http:\/\/localhost:3000\/order\//);
  tableId = created.body.data.id;
  originalQrToken = created.body.data.qr_token;

  const listed = await request("/tables");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.success, true);
  assert.equal(listed.body.data.some((table) => table.id === tableId), true);
  assert.equal(
    listed.body.data.find((table) => table.id === tableId).active_order_count,
    "0",
  );

  const updated = await request(`/tables/${tableId}`, {
    method: "PATCH",
    body: { label: "Integration Updated", status: "OCCUPIED" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.label, "Integration Updated");
  assert.equal(updated.body.data.status, "OCCUPIED");

  const regenerated = await request(`/tables/${tableId}/regenerate-qr`, { method: "POST" });
  assert.equal(regenerated.status, 200);
  assert.notEqual(regenerated.body.data.qr_token, originalQrToken);

  const saved = await pool.query(
    "SELECT label, status, store_id, qr_token FROM tables WHERE id = $1",
    [tableId],
  );
  assert.equal(saved.rows[0].label, "Integration Updated");
  assert.equal(saved.rows[0].status, "OCCUPIED");
  assert.equal(saved.rows[0].store_id, storeId);
  assert.equal(saved.rows[0].qr_token, regenerated.body.data.qr_token);

  const deleted = await request(`/tables/${tableId}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.success, true);
  tableId = null;

  const remaining = await pool.query("SELECT id FROM tables WHERE id = $1", [created.body.data.id]);
  assert.equal(remaining.rows.length, 0);
});
