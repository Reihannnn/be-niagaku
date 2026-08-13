import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
process.env.DATABASE_URL_SUPABASE = process.env.DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || "white-box-local-test-secret";

const { default: pool } = await import("../src/config/db.js");
const { default: authRoutes } = await import("../src/routes/auth.js");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);

let server;
let baseUrl;
let userId;
let storeId;
let email;

function unique(value) {
  return `${value.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
}

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie"),
  };
}

before(async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required in .env.local");

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

  if (!userId && email) {
    const fixture = await pool.query(
      "SELECT id, store_id FROM users WHERE email = $1",
      [email],
    );
    userId = fixture.rows[0]?.id;
    storeId = fixture.rows[0]?.store_id;
  }
  if (userId) await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  if (storeId) await pool.query("DELETE FROM stores WHERE id = $1", [storeId]);
  await pool.end();
});

test("auth routes register, login, expose the session, and logout", async () => {
  email = `${unique("user")}@example.test`;
  const password = "local-integration-password";

  const registered = await request("/api/auth/register", {
    method: "POST",
    body: {
      name: "Integration Admin",
      email,
      password,
      store_name: unique("store"),
    },
  });

  assert.equal(registered.status, 200);
  assert.equal(registered.body.message, "Register success");
  assert.equal(registered.body.user.email, email);
  assert.equal(registered.body.user.role, "ADMIN");
  userId = registered.body.user.id;
  storeId = registered.body.user.store_id;

  const saved = await pool.query(
    "SELECT id, store_id, email, role, password_hash FROM users WHERE id = $1",
    [userId],
  );
  assert.equal(saved.rows.length, 1);
  assert.equal(saved.rows[0].store_id, storeId);
  assert.equal(saved.rows[0].email, email);
  assert.equal(saved.rows[0].role, "ADMIN");
  assert.notEqual(saved.rows[0].password_hash, password);

  const loggedIn = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(loggedIn.status, 200);
  assert.equal(loggedIn.body.message, "Login success");
  assert.ok(loggedIn.body.token);
  assert.match(loggedIn.cookie, /token=/);

  const session = await request("/api/auth/me", {
    cookie: loggedIn.cookie.split(";")[0],
  });
  assert.equal(session.status, 200);
  assert.deepEqual(session.body.user, {
    id: userId,
    name: "Integration Admin",
    email,
    role: "ADMIN",
  });

  const loggedOut = await request("/api/auth/logout", {
    method: "POST",
    cookie: loggedIn.cookie.split(";")[0],
  });
  assert.equal(loggedOut.status, 200);
  assert.equal(loggedOut.body.message, "Logout success");
  assert.match(loggedOut.cookie, /token=;/);
});

test("login rejects an inactive account", async () => {
  assert.ok(userId, "register fixture was not created");
  await pool.query("UPDATE users SET is_active = false WHERE id = $1", [userId]);

  const result = await request("/api/auth/login", {
    method: "POST",
    body: { email, password: "local-integration-password" },
  });

  assert.equal(result.status, 403);
  assert.equal(result.body.message, "Akun sudah dinonaktifkan");
});
