import express from "express";
import pool from "../config/db.js";

import auth from "../middleware/auth.js";
import { authorizeAdmin } from "../middleware/role.js";

const router = express.Router();

// GET / READ KATEGORI
router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        c.*,
        COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN products p 
        ON p.category_id = c.id
      WHERE c.store_id = $1
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC
      `,
      [req.user.store_id],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get categories error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// CREATE KATEGORI
router.post("/", auth, authorizeAdmin, async (req, res) => {
  try {
    const { name, sort_order = 0 } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Nama kategori wajib diisi",
      });
    }

    if (name.length > 25) {
      return res.status(400).json({
        success: false,
        message: "Nama kategori maksimal 25 karakter",
      });
    }

    // cek duplikat
    const existing = await pool.query(
      `
      SELECT id 
      FROM categories
      WHERE store_id = $1
      AND LOWER(name) = LOWER($2)
      `,
      [req.user.store_id, name.trim()],
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Kategori sudah ada",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO categories (
        store_id,
        name,
        sort_order
      )
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [req.user.store_id, name.trim(), sort_order],
    );

    res.status(201).json({
      success: true,
      message: "Kategori berhasil ditambahkan",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create category error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// UPDATE KATEGORI
router.patch("/:id", auth, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sort_order } = req.body;

    const existing = await pool.query(
      `
      SELECT id
      FROM categories
      WHERE id = $1
      AND store_id = $2
      `,
      [id, req.user.store_id],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    const result = await pool.query(
      `
      UPDATE categories
      SET
        name = COALESCE($1, name),
        sort_order = COALESCE($2, sort_order),
        updated_at = NOW()
      WHERE id = $3
      AND store_id = $4
      RETURNING *
      `,
      [name?.trim(), sort_order, id, req.user.store_id],
    );

    res.json({
      success: true,
      message: "Kategori berhasil diupdate",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Update category error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// DELETE category
router.delete("/:id", auth, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // cek produk
    const products = await pool.query(
      `
      SELECT id
      FROM products
      WHERE category_id = $1
      `,
      [id],
    );

    if (products.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Kategori masih memiliki ${products.rows.length} produk`,
      });
    }

    const result = await pool.query(
      `
      DELETE FROM categories
      WHERE id = $1
      AND store_id = $2
      RETURNING id
      `,
      [id, req.user.store_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    res.json({
      success: true,
      message: "Kategori berhasil dihapus",
    });
  } catch (error) {
    console.error("Delete category error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default router;
