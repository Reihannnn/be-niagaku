import express from "express";
import bcrypt from "bcryptjs";
import db from "../config/db.js";
import auth from "../middleware/auth.js";
import { authorizeAdmin } from "../middleware/role.js";

const router = express.Router();

// ✅ GET ALL CASHIER
router.get("/", auth, authorizeAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `
        SELECT id, name, email, role, created_at
        FROM users
        WHERE store_id = $1
        AND role = 'KASIR'
        ORDER BY created_at DESC
        `,
      [req.user.store_id],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      msg: "Server error",
    });
  }
});

// ✅ CREATE CASHIER
router.post("/", auth, authorizeAdmin, async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // cek email
    const existing = await db.query(
      `
        SELECT * FROM users
        WHERE email = $1
        `,
      [email],
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        msg: "Email already used",
      });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // insert cashier
    const result = await db.query(
      `
        INSERT INTO users
        (
          store_id,
          name,
          email,
          password_hash,
          role
        )
        VALUES ($1,$2,$3,$4,'KASIR')
        RETURNING id, name, email, role
        `,
      [req.user.store_id, name, email, hashedPassword],
    );

    res.status(201).json({
      msg: "Cashier created",
      cashier: result.rows[0],
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      msg: "Server error",
    });
  }
});

// ✅ UPDATE CASHIER
router.patch("/:id", auth, authorizeAdmin, async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // cek account
    const existingUser = await db.query(
      `
          SELECT *
          FROM users
          WHERE id = $1
          AND role = 'KASIR'
          AND store_id = $2
          `,
      [req.params.id, req.user.store_id],
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        msg: "Cashier not found",
      });
    }

    // cek email duplicate
    const duplicateEmail = await db.query(
      `
          SELECT *
          FROM users
          WHERE email = $1
          AND id != $2
          `,
      [email, req.params.id],
    );

    if (duplicateEmail.rows.length > 0) {
      return res.status(400).json({
        msg: "Email already used",
      });
    }

    //
    // UPDATE WITH PASSWORD
    //
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await db.query(
        `
            UPDATE users
            SET
              name = $1,
              email = $2,
              password_hash = $3
            WHERE id = $4
            RETURNING
              id,
              name,
              email,
              role
            `,
        [name, email, hashedPassword, req.params.id],
      );

      return res.json({
        msg: "Cashier updated",
        data: result.rows[0],
      });
    }

    //
    // UPDATE WITHOUT PASSWORD
    //
    const result = await db.query(
      `
        UPDATE users
        SET
          name = $1,
          email = $2
        WHERE id = $3
        RETURNING
          id,
          name,
          email,
          role
        `,
      [name, email, req.params.id],
    );

    res.json({
      msg: "Cashier updated",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      msg: "Server error",
    });
  }
});

// ✅ DELETE CASHIER
router.delete("/:id", auth, authorizeAdmin, async (req, res) => {
  try {
    await db.query(
      `
        DELETE FROM users
        WHERE id = $1
        AND role = 'KASIR'
        AND store_id = $2
        `,
      [req.params.id, req.user.store_id],
    );

    res.json({
      msg: "Cashier deleted",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      msg: "Server error",
    });
  }
});

export default router;
