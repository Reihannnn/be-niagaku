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
const { default: categoryRoutes } = await import("../src/routes/categories.js");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/categories", categoryRoutes);

let server;
let baseUrl;
let storeId;
let categoryId;
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
    [unique("category-store")],
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

  if (categoryId) {
    await pool.query("DELETE FROM categories WHERE id = $1", [categoryId]);
  }
  if (storeId) {
    await pool.query("DELETE FROM stores WHERE id = $1", [storeId]);
  }
  await pool.end();
});

test("category routes create, list, update, and delete a local row", async () => {
  const created = await request("/categories", {
    method: "POST",
    body: { name: unique("category"), sort_order: 7 },
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  assert.equal(created.body.data.store_id, storeId);
  assert.equal(created.body.data.sort_order, 7);
  categoryId = created.body.data.id;

  const listed = await request("/categories");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.success, true);
  assert.equal(listed.body.data.some((category) => category.id === categoryId), true);
  assert.equal(
    listed.body.data.find((category) => category.id === categoryId).product_count,
    "0",
  );

  const updated = await request(`/categories/${categoryId}`, {
    method: "PATCH",
    body: { name: "Integration Updated", sort_order: 8 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, "Integration Updated");
  assert.equal(updated.body.data.sort_order, 8);

  const saved = await pool.query(
    "SELECT name, sort_order, store_id FROM categories WHERE id = $1",
    [categoryId],
  );
  assert.deepEqual(saved.rows[0], {
    name: "Integration Updated",
    sort_order: 8,
    store_id: storeId,
  });

  const deleted = await request(`/categories/${categoryId}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.success, true);
  categoryId = null;

  const remaining = await pool.query("SELECT id FROM categories WHERE id = $1", [created.body.data.id]);
  assert.equal(remaining.rows.length, 0);
});
