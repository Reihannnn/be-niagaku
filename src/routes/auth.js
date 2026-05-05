import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../config/db.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// ✅ REGISTER
router.post("/register", async (req, res) => {
  const { name, email, password, store_name } = req.body;

  try {
    // cek email
    const existing = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ msg: "Email already used" });
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
      msg: "Register success",
      user: user.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
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
      return res.status(400).json({ msg: "User not found" });
    }

    const user = userRes.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ msg: "Wrong password" });
    }

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
    res.cookie("token", token, {
      httpOnly: true,
      secure: false, // true kalau https
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      token,
      user,
      msg: "Login success",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token");

  res.json({
    msg: "Logout success",
  });
});

router.get("/me", auth, async (req, res) => {
  const userId = req.user.id;

  const userRes = await db.query(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [userId],
  );

  res.json({ user: userRes.rows[0] });
});

router.get("/store", auth, async (req, res) => {
  
  const userId = req.user.id;

  try {
    const result = await db.query(
      `
      SELECT 
        u.name AS user_name,
        u.role,
        s.name AS store_name
      FROM users u
      JOIN stores s ON u.store_id = s.id
      WHERE u.id = $1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }
    console.log(result.rows[0])

    res.json({store : result.rows[0]});
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
