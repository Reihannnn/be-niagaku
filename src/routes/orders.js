import express from "express";
import pool from "../config/db.js";
import auth from "../middleware/auth.js";
import fs from "fs";
import path from "path";
import { authorizeAdmin } from "../middleware/role.js";
import PDFDocument from "pdfkit";
const router = express.Router();

router.get("/", auth, async (req, res) => {
  try {
    const { status, payment_method, date } = req.query;

    // Default ke hari ini kalau tidak ada date
    const targetDate = date || new Date().toISOString().split("T")[0];

    let query = `
      SELECT
        o.*,
        t.label as table_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'product_name', p.name,
              'image_url', p.image_url,
              'quantity', oi.quantity,
              'price', oi.price_snapshot,
              'notes', oi.notes,
              'subtotal', oi.quantity * oi.price_snapshot
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) as items
      FROM orders o
      LEFT JOIN tables t ON t.id = o.table_id
      LEFT JOIN users u ON u.id = o.cashier_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.store_id = $1
        AND DATE(o.ordered_at) = $2
    `;

    const values = [req.user.store_id, targetDate];

    if (status) {
      query += ` AND o.status = $${values.length + 1}`;
      values.push(status);
    }

    if (payment_method) {
      query += ` AND o.payment_method = $${values.length + 1}`;
      values.push(payment_method);
    }

    query += `
      GROUP BY o.id, t.label, u.name
      ORDER BY o.ordered_at DESC
    `;

    const result = await pool.query(query, values);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/:id/status", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatus = ["CONFIRMED", "PREPARING", "COMPLETED", "CANCELLED"];

    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status tidak valid",
      });
    }

    const result = await pool.query(
      `
      UPDATE orders
      SET
        status = $1::order_status,
        completed_at =
          CASE
            WHEN $1::order_status = 'COMPLETED'
            THEN NOW()
            ELSE completed_at
          END
      WHERE id = $2
      AND store_id = $3
      RETURNING *
      `,
      [status, id, req.user.store_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan",
      });
    }

    res.json({
      success: true,
      message: "Status order berhasil diupdate",
      data: result.rows[0],
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false });
  }
});

router.patch("/:id/pay-cash", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE orders
      SET
        status = 'CONFIRMED',
        paid_at = NOW()
      WHERE id = $1
      AND store_id = $2
      AND payment_method = 'CASH'
      RETURNING *
      `,
      [id, req.user.store_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan",
      });
    }

    res.json({
      success: true,
      message: "Pembayaran cash berhasil dikonfirmasi",
      data: result.rows[0],
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
});

//invoice
router.get("/:id/invoice", auth, async (req, res) => {
  function formatDate(date) {
    return new Date(date).toLocaleString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  try {
    const { id } = req.params;

    // GET ORDER
    const orderResult = await pool.query(
      `
      SELECT
        o.*,
        t.label as table_name,
        u.name as cashier_name,
        s.name as store_name,
        s.address as store_address,
        s.logo_url,
        s.instagram,
        s.website,
        s.struk_header,
        s.struk_footer
      FROM orders o
      LEFT JOIN tables t ON t.id = o.table_id
      LEFT JOIN users u ON u.id = o.cashier_id
      LEFT JOIN stores s ON s.id = o.store_id
      WHERE o.id = $1
      AND o.store_id = $2
      `,
      [id, req.user.store_id],
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan",
      });
    }
    const order = orderResult.rows[0];

    // GET ITEMS
    const itemResult = await pool.query(
      `
      SELECT
        oi.*,
        p.name as product_name
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1
      `,
      [id],
    );
    const items = itemResult.rows;

    const baseHeight = 260;

    // tinggi per item
    const itemHeight = items.length * 45;

    // tambahan kalau ada note item
    const notesHeight = items.filter((item) => item.notes).length * 20;

    // tambahan header/footer
    const headerHeight = order.struk_header ? 40 : 0;
    const footerHeight = order.struk_footer ? 40 : 0;

    // tambahan logo
    const logoHeight = order.logo_url ? 80 : 0;

    // margin bawah biar ga mepet
    const bottomMargin = 10;

    // total tinggi
    const docHeight =
      baseHeight +
      itemHeight +
      notesHeight +
      headerHeight +
      footerHeight +
      logoHeight +
      bottomMargin;

    // PDF CONFIG
    const doc = new PDFDocument({
      size: [226, docHeight],
      margin: 16,
    });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader("Content-Disposition", `inline; filename=invoice-${id}.pdf`);

    doc.pipe(res);

    const center = { align: "center" };
    const right = { align: "right" };

    const orderDate = formatDate(order.ordered_at);

    // LOGO
    if (order.logo_url) {
      try {
        const filename = order.logo_url.split("/uploads/")[1];

        const logoPath = path.join("uploads", filename);

        if (fs.existsSync(logoPath)) {
          // posisi tengah thermal
          const imageX = (226 - 60) / 2;

          doc.image(logoPath, imageX, doc.y, {
            width: 60,
          });

          // kasih jarak bawah logo
          doc.moveDown(4);
        }
      } catch (err) {
        console.log("Logo error:", err);
      }
    }

    // HEADER TOKO
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(order.store_name || "STORE", center);

    if (order.struk_header) {
      doc
        .moveDown(0.3)
        .fontSize(8)
        .font("Helvetica")
        .text(order.struk_header, center);
    }

    if (order.store_address) {
      doc.moveDown(0.2).fontSize(8).text(order.store_address, center);
    }

    if (order.instagram) {
      doc.fontSize(8).text(`IG: ${order.instagram}`, center);
    }

    if (order.website) {
      doc.fontSize(8).text(order.website, center);
    }

    doc.moveDown(0.5);
    doc
      .fontSize(8)
      .text(
        "------------------------------------------------------------------------",
      );
    // INFO ORDER
    doc.font("Helvetica");
    doc.text(`No Order : #${String(order.daily_number).padStart(3, "0")}`);
    doc.text(`Tanggal  : ${orderDate}`);
    doc.text(`Customer : ${order.customer_name || "-"}`);
    doc.text(`Meja     : ${order.table_name || "-"}`);
    doc.text(`Kasir    : ${order.cashier_name || "-"}`);
    doc.text(`Order    : ${order.source}`);
    doc.text(`Payment  : ${order.payment_method || "-"}`);
    doc.text(`Status   : ${order.status}`);
    doc
      .fontSize(8)
      .text(
        "------------------------------------------------------------------------",
      );

    // ITEMS
    let grandTotal = 0;
    items.forEach((item) => {
      const subtotal = item.quantity * item.price_snapshot;
      grandTotal += subtotal;

      doc
        .moveDown(0.3)
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(item.product_name);

      doc
        .font("Helvetica")
        .fontSize(8)
        .text(
          `${item.quantity} x Rp ${Number(item.price_snapshot).toLocaleString(
            "id-ID",
          )}`,
          {
            continued: true,
          },
        )
        .text(`Rp ${subtotal.toLocaleString("id-ID")}`, right);

      if (item.notes) {
        doc.fontSize(7).fillColor("gray").text(`note: ${item.notes}`);

        doc.fillColor("black");
      }
    });

    doc
      .fontSize(8)
      .text(
        "------------------------------------------------------------------------",
      );

    // TOTAL
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("TOTAL", {
        continued: true,
      })
      .text(`Rp ${grandTotal.toLocaleString("id-ID")}`, right);

    // FOOTER

    doc.moveDown(1);

    if (order.struk_footer) {
      doc.font("Helvetica").fontSize(8).text(order.struk_footer, center);

      doc.moveDown(0.5);
    }
    doc.fontSize(8).text("Terima kasih", center);

    doc
      .fontSize(7)
      .fillColor("gray")
      .text("Powered by QR Order System", center);

    doc.end();
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Gagal generate invoice",
    });
  }
});

export default router;
