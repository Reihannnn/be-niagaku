import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../config/db.js";
import auth from "../middleware/auth.js";
import dotenv from "dotenv";
import transporter from "../helpers/index.js";

dotenv.config();
const router = express.Router();
const BASE_URL = process.env.FRONTEND_URL || process.env.BASE_URL_FRONTEND;

// ✅ REGISTER
router.post("/register", async (req, res) => {
  const { name, email, password, store_name } = req.body;

  try {
    // cek email
    const existing = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Email already used" });
    }

    // hash password
    const hashed = await bcrypt.hash(password, 10);

    // buat store
    const store = await db.query(
      "INSERT INTO stores (name) VALUES ($1) RETURNING *",
      [store_name],
    );

    const storeId = store.rows[0].id;

    // buat user ADMIN
    const user = await db.query(
      `INSERT INTO users (store_id, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,'ADMIN') RETURNING *`,
      [storeId, name, email, hashed],
    );

    res.json({
      message: "Register success",
      user: user.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const userRes = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (userRes.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }

    const user = userRes.rows[0];

    if (user.is_active === false) {
      return res.status(403).json({ message: "Akun sudah dinonaktifkan" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ message: "Wrong password" });
    }

    const userStore = await db.query(
      "UPDATE stores SET is_open = true WHERE id = $1",
      [user.store_id],
    );

    const token = jwt.sign(
      {
        id: user.id,
        store_id: user.store_id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    // ✅ SET COOKIE

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "lax" : "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000,
    };
    if (process.env.NODE_ENV === "production") {
      cookieOpts.domain = ".manatok.my.id";
    }

    res.cookie("token", token, cookieOpts);

    res.json({
      token,
      user,
      message: "Login success",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/logout", auth, (req, res) => {
  const userId = req.user.id;

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
  if (process.env.NODE_ENV === "production") {
    cookieOpts.domain = ".manatok.my.id";
  }

  res.clearCookie("token", cookieOpts);

  res.json({
    message: "Logout success",
  });
});

// FORGOT Password
router.post("/forgot-password", async (req, res) => {
  try {
    const email = req.body.email;
    const userRes = await db.query(`SELECT * FROM users WHERE email = $1`, [
      email,
    ]);

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        status: false,
        message: "Email tidak ditemukan",
        data: {},
      });
    }

    const user = userRes.rows[0];
    // console.log(userRes.rows[0].id)

    const token = jwt.sign(
      {
        idUser: user.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );
    const expired = new Date(Date.now() + 15 * 60 * 1000);

    await db.query(
      "UPDATE users SET reset_token = $1, reset_token_expired = $2 WHERE id = $3",
      [token, expired, user.id],
    );

    const resetLink = `${BASE_URL}/reset-password/${token}`;
    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: "Reset Password",
      html: `
      <h2>Reset Password</h2>
      <p>Klik tombol berikut:</p>
      <a href="${resetLink}">
      Reset Password
      </a>
      <p>Link berlaku 15 menit.</p>
      `,
    });

    console.log(info);
    return res.status(200).json({
      status: true,
      message: "Link reset berhasil dikirim",
      resetLink: resetLink,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Server Error",
    });
  }
});

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;

  const userRes = await db.query(
    `
    SELECT *
    FROM users
    WHERE reset_token = $1
    `,
    [token],
  );

  if (userRes.rows.length === 0) {
    return res.status(400).json({
      status: false,
      message: "Token tidak valid",
    });
  }

  const user = userRes.rows[0];

  if (new Date(user.reset_token_expired) < new Date()) {
    return res.status(400).json({
      status: false,
      message: "Token sudah expired",
    });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({
      status: false,
      message: "JWT tidak valid",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await db.query(
    `
    UPDATE users
    SET password_hash = $1,
    reset_token = NULL,
          reset_token_expired = NULL
          WHERE id = $2
          `,
    [hashedPassword, user.id],
  );

  return res.status(200).json({
    status: true,
    message: "Password berhasil diubah",
  });
});

router.get("/me", auth, async (req, res) => {
  const userId = req.user.id;
  console.log(userId);

  const userRes = await db.query(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [userId],
  );
  // console.log(userRes.rows[0].name)

  res.json({ user: userRes.rows[0] });
});

export default router;
