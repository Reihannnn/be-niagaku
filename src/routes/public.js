import express from "express";

import pool from "../config/db.js";

const router = express.Router();

// GET DATA SELF ORDER
router.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;

    // GET TABLE
    const tableResult = await pool.query(
      `
  SELECT
    t.id,
    t.label,
    t.status,
    t.store_id,

    s.name AS store_name,
    s.address,
    s.logo_url,
    s.instagram,
    s.website,
    s.is_open,
    s.struk_header,
    s.struk_footer

  FROM tables t
  JOIN stores s
    ON s.id = t.store_id

  WHERE t.qr_token = $1
  `,
      [token],
    ); 

    if (tableResult.rows.length === 0) {
      return res.status(404).json({
        message: "Meja tidak ditemukan",
      });
    }

    const table = tableResult.rows[0];

    // GET PRODUCTS
    const productsResult = await pool.query(
      `
          SELECT
            p.*,
            c.name as category_name
          FROM products p
          JOIN categories c
            ON c.id = p.category_id
          WHERE p.store_id = $1
          AND p.status = 'AVAILABLE'
          AND p.is_deleted = false
          ORDER BY c.sort_order ASC
          `,
      [table.store_id],
    );

    res.json({
      table,
      products: productsResult.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
});

export default router;
