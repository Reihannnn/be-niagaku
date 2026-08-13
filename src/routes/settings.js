import express from "express";
import multer from "multer";
import path from "path";
import dotenv from "dotenv";
import db from "../config/db.js";
import auth from "../middleware/auth.js";
import { authorizeAdmin } from "../middleware/role.js";

const router = express.Router();
dotenv.config();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const baseUrl = process.env.API_URL || process.env.BASE_URL || "http://localhost:5000";

router.get("/", auth, async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT *
      FROM stores
      WHERE id = $1
      `,
      [req.user.store_id],
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

//update
router.patch(
  "/",
  auth,
  authorizeAdmin,
  upload.single("logo"),
  async (req, res) => {
    try {
      const {
        name,
        address,
        instagram,
        website,
        struk_header,
        struk_footer,
        is_open,
        midtrans_server_key,
        midtrans_client_key,
        midtrans_is_production,
      } = req.body;

      const isOpen = is_open === "true";
      const isProduction = midtrans_is_production === "true";

      const logo_url = req.file
        ? `${baseUrl}/uploads/${req.file.filename}`
        : null;

      const result = await db.query(
        `
        UPDATE stores
        SET
          name = COALESCE($1, name),
          address = COALESCE($2, address),
          instagram = COALESCE($3, instagram),
          website = COALESCE($4, website),
          struk_header = COALESCE($5, struk_header),
          struk_footer = COALESCE($6, struk_footer),
          logo_url = COALESCE($7, logo_url),
          is_open = COALESCE($8, is_open),
          midtrans_server_key = COALESCE($9, midtrans_server_key),
          midtrans_client_key = COALESCE($10, midtrans_client_key),
          midtrans_is_production = COALESCE($11, midtrans_is_production),
          updated_at = NOW()
        WHERE id = $12
        RETURNING *
        `,
        [
          name,
          address,
          instagram,
          website,
          struk_header,
          struk_footer,
          logo_url,
          isOpen,
          midtrans_server_key,
          midtrans_client_key,
          isProduction,
          req.user.store_id,
        ],
      );

      res.json({
        success: true,
        message: "Settings berhasil diupdate",
        data: result.rows[0],
      });
    } catch (err) {
      console.log(err);

      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },
);

export default router;
