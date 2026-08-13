import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
process.env.DATABASE_URL_SUPABASE = process.env.DATABASE_URL;
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "white-box-local-test-secret";

const { default: pool } = await import("../src/config/db.js");
const { default: accountRoutes } = await import("../src/routes/accounts.js");
const { default: authRoutes } = await import("../src/routes/auth.js");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountRoutes);

let server;
let baseUrl;
let storeId;
let cashierId;
let adminEmail;

function unique(value) {
  return `${value.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
}

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
}

before(async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required in .env.local");

  const store = await pool.query(
    "INSERT INTO stores (name) VALUES ($1) RETURNING id",
    [unique("account-store")],
  );
  storeId = store.rows[0].id;
  adminEmail = `${unique("admin")}@example.test`;
  const admin = await pool.query(
    `INSERT INTO users (store_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'ADMIN') RETURNING id`,
    [
      storeId,
      "Integration Owner",
      adminEmail,
      await bcrypt.hash("admin-password", 10),
    ],
  );
  assert.ok(admin.rows[0].id);

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

  if (storeId)
    await pool.query("DELETE FROM users WHERE store_id = $1", [storeId]);
  if (storeId) await pool.query("DELETE FROM stores WHERE id = $1", [storeId]);
  await pool.end();
});

test("account routes create, list, update, and deactivate a cashier", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email: adminEmail, password: "admin-password" },
  });
  assert.equal(login.status, 200);
  const token = login.body.token;

  const created = await request("/api/accounts", {
    method: "POST",
    token,
    body: {
      name: "Integration Cashier",
      email: `${unique("cashier")}@example.test`,
      password: "cashier-password",
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.msg, "Cashier created");
  assert.equal(created.body.cashier.role, "KASIR");
  cashierId = created.body.cashier.id;

  const listed = await request("/api/accounts", { token });

  console.log("=== GET /api/accounts ===");
  console.log("STATUS:", listed.status);
  console.log("BODY:", listed.body);

  assert.equal(listed.status, 200);
  assert.equal(
    listed.body.some((account) => account.id === cashierId),
    true,
  );

  const updated = await request(`/api/accounts/${cashierId}`, {
    method: "PATCH",
    token,
    body: {
      name: "Updated Cashier",
      email: `${unique("updated-cashier")}@example.test`,
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.msg, "Cashier updated");
  assert.equal(updated.body.data.name, "Updated Cashier");

  const deactivated = await request(`/api/accounts/${cashierId}`, {
    method: "DELETE",
    token,
  });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.body.msg, "Cashier deactivated");

  const saved = await pool.query(
    "SELECT name, role, store_id, is_active FROM users WHERE id = $1",
    [cashierId],
  );
  assert.deepEqual(saved.rows[0], {
    name: "Updated Cashier",
    role: "KASIR",
    store_id: storeId,
    is_active: false,
  });
});

test("account routes require an authenticated admin", async () => {
  const result = await request("/api/accounts");
  assert.equal(result.status, 401);
});
