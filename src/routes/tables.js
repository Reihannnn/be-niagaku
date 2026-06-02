import express from "express";
import pool from "../config/db.js";
import auth from "../middleware/auth.js";
import { authorizeAdmin } from "../middleware/role.js";

const router = express.Router();

function buildOrderUrl(qr_token) {
  const base = process.env.SELF_ORDER_BASE_URL ?? "http://localhost:3000";
  return `${base}/order/${qr_token}`;
}


// GET / READ MEJA
router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        t.*,
        COUNT(o.id) FILTER (
          WHERE o.status NOT IN ('COMPLETED', 'CANCELLED')
        ) AS active_order_count
      FROM tables t
      LEFT JOIN orders o
        ON o.table_id = t.id
      WHERE t.store_id = $1
      GROUP BY t.id
      ORDER BY t.label ASC
      `,
      [req.user.store_id]
    );

    const data = result.rows.map((t) => ({
      ...t,
      order_url: buildOrderUrl(t.qr_token),
    }));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get tables error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


// CREATE MEJA
router.post("/", auth, authorizeAdmin, async (req, res) => {
  try {
    const { label } = req.body;

    if (!label || label.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Label meja wajib diisi",
      });
    }

    if (label.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Label meja maksimal 50 karakter",
      });
    }

    // cek duplikat
    const existing = await pool.query(
      `
      SELECT id
      FROM tables
      WHERE store_id = $1
      AND LOWER(label) = LOWER($2)
      `,
      [req.user.store_id, label.trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Meja dengan label ini sudah ada",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO tables (store_id, label)
      VALUES ($1, $2)
      RETURNING *
      `,
      [req.user.store_id, label.trim()]
    );

    const table = {
      ...result.rows[0],
      order_url: buildOrderUrl(result.rows[0].qr_token),
    };

    res.status(201).json({
      success: true,
      message: "Meja berhasil ditambahkan",
      data: table,
    });
  } catch (error) {
    console.error("Create table error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


// UPDATE MEJA
router.patch("/:id", auth, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { label, status } = req.body;

    // cek meja milik store ini
    const existing = await pool.query(
      `
      SELECT id
      FROM tables
      WHERE id = $1
      AND store_id = $2
      `,
      [id, req.user.store_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Meja tidak ditemukan",
      });
    }

    // validasi status jika dikirim
    if (status !== undefined) {
      const validStatus = ["AVAILABLE", "OCCUPIED"];
      if (!validStatus.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status tidak valid. Gunakan AVAILABLE atau OCCUPIED",
        });
      }
    }

    // cek duplikat label jika label diubah
    if (label !== undefined && label.trim() !== "") {
      const dup = await pool.query(
        `
        SELECT id
        FROM tables
        WHERE store_id = $1
        AND LOWER(label) = LOWER($2)
        AND id != $3
        `,
        [req.user.store_id, label.trim(), id]
      );

      if (dup.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Meja dengan label ini sudah ada",
        });
      }
    }

    const result = await pool.query(
      `
      UPDATE tables
      SET
        label  = COALESCE($1, label),
        status = COALESCE($2::table_status, status)
      WHERE id = $3
      AND store_id = $4
      RETURNING *
      `,
      [label?.trim(), status, id, req.user.store_id]
    );

    const table = {
      ...result.rows[0],
      order_url: buildOrderUrl(result.rows[0].qr_token),
    };

    res.json({
      success: true,
      message: "Meja berhasil diupdate",
      data: table,
    });
  } catch (error) {
    console.error("Update table error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


// REGENERATE QR TOKEN
router.post("/:id/regenerate-qr", auth, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE tables
      SET qr_token = gen_random_uuid()
      WHERE id = $1
      AND store_id = $2
      RETURNING *
      `,
      [id, req.user.store_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Meja tidak ditemukan",
      });
    }

    const table = {
      ...result.rows[0],
      order_url: buildOrderUrl(result.rows[0].qr_token),
    };

    res.json({
      success: true,
      message: "QR token berhasil diperbarui",
      data: table,
    });
  } catch (error) {
    console.error("Regenerate QR error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


// DELETE MEJA
router.delete("/:id", auth, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // blok hapus jika masih ada order aktif
    const activeOrders = await pool.query(
      `
      SELECT id
      FROM orders
      WHERE table_id = $1
      AND status NOT IN ('COMPLETED', 'CANCELLED')
      `,
      [id]
    );

    if (activeOrders.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Meja tidak bisa dihapus karena masih ada ${activeOrders.rows.length} order aktif`,
      });
    }

    const result = await pool.query(
      `
      DELETE FROM tables
      WHERE id = $1
      AND store_id = $2
      RETURNING id
      `,
      [id, req.user.store_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Meja tidak ditemukan",
      });
    }

    res.json({
      success: true,
      message: "Meja berhasil dihapus",
    });
  } catch (error) {
    console.error("Delete table error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default router;