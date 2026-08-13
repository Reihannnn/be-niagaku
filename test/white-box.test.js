import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import auth from "../src/middleware/auth.js";
import { authorizeAdmin } from "../src/middleware/role.js";
import { createSnap } from "../src/config/midtrans.js";

process.env.JWT_SECRET = "white-box-test-secret";

function responseDouble() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function tokenFor(user = { id: "user-1", role: "ADMIN" }) {
  return jwt.sign(user, process.env.JWT_SECRET);
}

test("auth rejects request without cookie or authorization header", () => {
  const req = { cookies: {}, headers: {} };
  const res = responseDouble();
  let nextCalled = false;

  auth(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { msg: "Unauthorized" });
  assert.equal(nextCalled, false);
});

test("auth accepts a valid cookie token", () => {
  const req = { cookies: { token: tokenFor() }, headers: {} };
  const res = responseDouble();
  let nextCalled = false;

  auth(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, "ADMIN");
});

test("auth falls back to a valid bearer token", () => {
  const req = {
    cookies: {},
    headers: { authorization: `Bearer ${tokenFor({ id: "user-2", role: "KASIR" })}` },
  };
  const res = responseDouble();
  let nextCalled = false;

  auth(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, "KASIR");
});

test("auth rejects an invalid token", () => {
  const req = { cookies: { token: "not-a-jwt" }, headers: {} };
  const res = responseDouble();
  let nextCalled = false;

  auth(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { msg: "Invalid token" });
  assert.equal(nextCalled, false);
});

test("authorizeAdmin allows ADMIN", () => {
  const req = { user: { role: "ADMIN" } };
  const res = responseDouble();
  let nextCalled = false;

  authorizeAdmin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test("authorizeAdmin rejects non-admin roles", () => {
  const req = { user: { role: "KASIR" } };
  const res = responseDouble();
  let nextCalled = false;

  authorizeAdmin(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, { success: false, message: "Akses ditolak" });
  assert.equal(nextCalled, false);
});

test("createSnap creates a sandbox-compatible Midtrans client", () => {
  const snap = createSnap({
    serverKey: "SB-Mid-server-test",
    clientKey: "SB-Mid-client-test",
    isProduction: false,
  });

  assert.ok(snap);
  assert.equal(snap.apiConfig.isProduction, false);
  assert.equal(snap.apiConfig.serverKey, "SB-Mid-server-test");
  assert.equal(snap.apiConfig.clientKey, "SB-Mid-client-test");
});
