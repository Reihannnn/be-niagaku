import express from "express";
import db from "../config/db.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.get("/", auth, async (req, res) => {
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
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }
    console.log(result.rows);
    res.json({ store: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/data-store", auth, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await db.query(
      `
      SELECT 
        u.name AS user_name,
        u.role,

        s.id AS store_id,
        s.name AS store_name,
        s.address,
        s.logo_url,
        s.instagram,
        s.website,
        s.struk_header,
        s.struk_footer,
        s.is_open

      FROM users u
      JOIN stores s ON u.store_id = s.id
      WHERE u.id = $1
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User tidak ditemukan",
      });
    }

    res.json({
      success: true,
      store: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
});

router.patch("/close", auth, async (req, res) => {
  const userId = req.user.id;

  try {
    const getStoreId = await db.query(
      "SELECT store_id FROM users WHERE id = $1",
      [userId],
    );

    const storeId = getStoreId.rows[0].store_id;

    const existingStore = await db.query("SELECT * FROM stores where id = $1", [
      storeId,
    ]);

    if (!existingStore) {
      return res.status(400).json({
        message: "tidak menemukan Toko",
      });
    }
    const result = await db.query(
      "UPDATE stores SET is_open = false WHERE id = $1",
      [storeId],
    );

    res.status(200).json({
      succes: true,
      message: "Toko berhasil ditutup",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

router.patch("/open", auth, async (req, res) => {
  const userId = req.user.id;

  try {
    const getStoreId = await db.query(
      "SELECT store_id FROM users WHERE id = $1",
      [userId],
    );

    const storeId = getStoreId.rows[0].store_id;

    const existingStore = await db.query("SELECT * FROM stores where id = $1", [
      storeId,
    ]);

    if (!existingStore) {
      return res.status(400).json({
        message: "tidak menemukan Toko",
      });
    }
    const result = await db.query(
      "UPDATE stores SET is_open = true WHERE id = $1",
      [storeId],
    );

    res.status(200).json({
      succes: true,
      message: "Toko berhasil dibuka",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

export default router;
