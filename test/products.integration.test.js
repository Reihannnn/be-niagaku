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
const { default: productRoutes } = await import("../src/routes/products.js");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/products", productRoutes);

let server;
let baseUrl;
let storeId;
let categoryId;
let token;

function unique(value) {
  return `white-box-${value}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function request(path, { method = "POST", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

before(async () => {
  assert.ok(process.env.DATABASE_URL_SUPABASE, "DATABASE_URL is required in .env.local");

  const store = await pool.query(
    "INSERT INTO stores (name) VALUES ($1) RETURNING id",
    [unique("store")],
  );
  storeId = store.rows[0].id;

  const category = await pool.query(
    "INSERT INTO categories (store_id, name) VALUES ($1, $2) RETURNING id",
    [storeId, `cat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`],
  );
  categoryId = category.rows[0].id;

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
    await pool.query("DELETE FROM products WHERE category_id = $1", [categoryId]);
    await pool.query("DELETE FROM categories WHERE id = $1", [categoryId]);
  }
  if (storeId) {
    await pool.query("DELETE FROM stores WHERE id = $1", [storeId]);
  }
  await pool.end();
});

test("POST /products creates a product in the local database", async () => {
  const result = await request("/products", {
    body: {
      name: unique("product"),
      price: 15000,
      category_id: categoryId,
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.ok(result.body.data.id);
  assert.equal(result.body.data.store_id, storeId);
  assert.equal(result.body.data.price, 15000);

  const saved = await pool.query(
    "SELECT name, price, category_id, store_id, image_url FROM products WHERE id = $1",
    [result.body.data.id],
  );
  assert.equal(saved.rows.length, 1);
  assert.equal(saved.rows[0].price, 15000);
  assert.equal(saved.rows[0].category_id, categoryId);
  assert.equal(saved.rows[0].store_id, storeId);
  assert.equal(saved.rows[0].image_url, null);
});

test("PATCH /products/:id updates a product owned by the store", async () => {
  const created = await pool.query(
    `INSERT INTO products (store_id, category_id, name, price)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [storeId, categoryId, unique("product"), 10000],
  );
  const productId = created.rows[0].id;

  const result = await request(`/products/${productId}`, {
    method: "PATCH",
    body: { name: "Produk Diperbarui", price: 22000 },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.id, productId);
  assert.equal(result.body.data.name, "Produk Diperbarui");
  assert.equal(result.body.data.price, 22000);

  const saved = await pool.query(
    "SELECT name, price, category_id FROM products WHERE id = $1",
    [productId],
  );
  assert.deepEqual(saved.rows[0], {
    name: "Produk Diperbarui",
    price: 22000,
    category_id: categoryId,
  });
});

test("DELETE /products/:id soft-deletes a product", async () => {
  const created = await pool.query(
    `INSERT INTO products (store_id, category_id, name, price)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [storeId, categoryId, unique("product"), 12000],
  );
  const productId = created.rows[0].id;

  const result = await request(`/products/${productId}`, { method: "DELETE" });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);

  const saved = await pool.query(
    "SELECT is_deleted FROM products WHERE id = $1",
    [productId],
  );
  assert.equal(saved.rows[0].is_deleted, true);
});
