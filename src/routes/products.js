import dotenv from "dotenv";
import express from "express";
import db from "../config/db.js";
import auth from "../middleware/auth.js";
import upload from "../../utils/upload.js";

dotenv.config();

const router = express.Router();

const baseUrl = process.env.BASE_URL;

//  GET ALL PRODUCTS + FILTER CATEGORY
router.get("/", auth, async (req, res) => {
  try {
    const { category_id } = req.query;

    let query = `
      SELECT 
        p.*,
        c.name AS category_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.store_id = $1
    `;

    const values = [req.user.store_id];

    if (category_id) {
      query += " AND p.category_id = $2";
      values.push(category_id);
    }

    query += " ORDER BY p.created_at DESC";

    const result = await db.query(query, values);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//
// ✅ CREATE PRODUCT
//
router.post("/", auth, upload.single("image"), async (req, res) => {
  try {
    const { name, price, category_id } = req.body;

    const image_url = req.file
      ? `${baseUrl}/uploads/${req.file.filename}`
      : null;

    const result = await db.query(
      `
      INSERT INTO products (store_id, category_id, name, price, image_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [req.user.store_id, category_id, name, price, image_url],
    );

    res.json({
      success: true,
      message: "Produk berhasil ditambahkan",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//
// ✅ UPDATE PRODUCT
//
router.patch("/:id", auth,upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category_id, status } = req.body;
    const image_url = req.file
      ? `${baseUrl}/uploads/${req.file.filename}`
      : null;

    const result = await db.query(
      `
      UPDATE products
      SET
        name = COALESCE($1, name),
        price = COALESCE($2, price),
        category_id = COALESCE($3, category_id),
        image_url = COALESCE($4, image_url),
        status = COALESCE($5, status),
        updated_at = NOW()
      WHERE id = $6 AND store_id = $7
      RETURNING *
      `,
      [name, price, category_id, image_url, status, id, req.user.store_id],
    );

    res.json({
      success: true,
      message: "Produk berhasil diupdate",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//
// ✅ DELETE PRODUCT
//
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      `
      DELETE FROM products
      WHERE id = $1 AND store_id = $2
      `,
      [id, req.user.store_id],
    );

    res.json({
      success: true,
      message: "Produk berhasil dihapus",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
