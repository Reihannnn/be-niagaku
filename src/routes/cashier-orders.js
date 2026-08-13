import express from "express";
import pool from "../config/db.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// ─────────────────────────────────────────────
// GET  /api/cashier-orders
// Ambil semua data yang dibutuhkan halaman kasir
// ─────────────────────────────────────────────
router.get("/", auth, async (req, res) => {
  try {
    const { store_id, id: cashier_id } = req.user;

    // Cashier info
    const cashierResult = await pool.query(
      `SELECT id, name, email, role FROM users WHERE id = $1`,
      [cashier_id],
    );

    // Store info
    const storeResult = await pool.query(
      `SELECT id, name, address, logo_url FROM stores WHERE id = $1`,
      [store_id],
    );

    // Products (hanya yang AVAILABLE)
    const productsResult = await pool.query(
      `SELECT
        p.id,
        p.store_id,
        p.category_id,
        p.name,
        p.price,
        p.image_url,
        p.status,
        c.name AS category_name
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.store_id = $1
         AND p.is_deleted = false
       ORDER BY c.sort_order ASC, p.name ASC`,
      [store_id],
    );

    // Categories
    const categoriesResult = await pool.query(
      `SELECT id, name, sort_order
       FROM categories
       WHERE store_id = $1
       ORDER BY sort_order ASC`,
      [store_id],
    );

    // Tables (hanya yang AVAILABLE)
    const tablesResult = await pool.query(
      `SELECT id, label, status
       FROM tables
       WHERE store_id = $1
       ORDER BY label ASC`,
      [store_id],
    );

    res.json({
      cashier: cashierResult.rows[0],
      store: storeResult.rows[0],
      products: productsResult.rows,
      categories: categoriesResult.rows,
      tables: tablesResult.rows,
    });
  } catch (err) {
    console.error("GET /api/cashier-orders error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// POST  /api/cashier-orders
// Buat pesanan baru dari kasir
// ─────────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  const client = await pool.connect();

  try {
    const { store_id, id: cashier_id } = req.user;
    const { table_id, customer_name, customer_note, payment_method, items } =
      req.body;

    // Validasi input
    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Items tidak boleh kosong" });
    }

    if (!payment_method || !["CASH", "QRIS"].includes(payment_method)) {
      return res.status(400).json({ message: "Metode pembayaran tidak valid" });
    }

    await client.query("BEGIN");

    // Ambil harga produk dari DB (jangan percaya harga dari client)
    const productIds = items.map((i) => i.product_id);
    const productsResult = await client.query(
      `SELECT id, name, price, status
       FROM products
       WHERE id = ANY($1::uuid[])
         AND store_id = $2`,

      [productIds, store_id],
    );

    // Validasi semua produk ditemukan & tersedia
    if (productsResult.rows.length !== productIds.length) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ message: "Beberapa produk tidak ditemukan" });
    }

    const unavailable = productsResult.rows.filter(
      (p) => p.status !== "AVAILABLE",
    );
    if (unavailable.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Produk tidak tersedia: ${unavailable.map((p) => p.name).join(", ")}`,
      });
    }

    // Buat price map untuk snapshot
    const priceMap = Object.fromEntries(
      productsResult.rows.map((p) => [p.id, p.price]),
    );

    // Hitung total
    const total_amount = items.reduce(
      (sum, item) => sum + priceMap[item.product_id] * item.quantity,
      0,
    );

    // Generate daily number (reset setiap hari)
    const dailyResult = await client.query(
      `SELECT COALESCE(MAX(daily_number), 0) + 1 AS next_num
       FROM orders
       WHERE store_id = $1
         AND ordered_at::date = CURRENT_DATE`,
      [store_id],
    );
    const daily_number = dailyResult.rows[0].next_num;

    // Validasi table jika dipilih
    if (table_id) {
      const tableResult = await client.query(
        `SELECT id, label, status FROM tables WHERE id = $1 AND store_id = $2`,
        [table_id, store_id],
      );
      if (tableResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Meja tidak ditemukan" });
      }
    }

    // Insert order
    const orderResult = await client.query(
      `INSERT INTO orders (
         store_id, table_id, cashier_id, daily_number,
         source, status, payment_method,
         total_amount, customer_name, customer_note,
         paid_at
       )
       VALUES ($1, $2, $3, $4, 'KASIR', 'CONFIRMED', $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        store_id,
        table_id || null,
        cashier_id,
        daily_number,
        payment_method,
        total_amount,
        customer_name?.trim() || null,
        customer_note?.trim() || null,
      ],
    );

    const order = orderResult.rows[0];

    // Insert order items
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price_snapshot, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          order.id,
          item.product_id,
          item.quantity,
          priceMap[item.product_id],
          item.notes?.trim() || null,
        ],
      );
    }

    // Update status meja jika dipilih
    if (table_id) {
      await client.query(
        `UPDATE tables SET status = 'OCCUPIED' WHERE id = $1`,
        [table_id],
      );
    }

    await client.query("COMMIT");

    // Return order + items untuk keperluan print struk
    const itemsResult = await pool.query(
      `SELECT
         oi.id,
         oi.quantity,
         oi.price_snapshot,
         oi.notes,
         p.name AS product_name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [order.id],
    );

    res.status(201).json({
      message: "Pesanan berhasil dibuat",
      order: {
        ...order,
        items: itemsResult.rows,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/cashier-orders error:", err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// GET  /api/cashier-orders/history
// Riwayat pesanan hari ini oleh kasir ini
// ─────────────────────────────────────────────
router.get("/history", auth, async (req, res) => {
  try {
    const { store_id, id: cashier_id } = req.user;

    const result = await pool.query(
      `SELECT
         o.id,
         o.daily_number,
         o.customer_name,
         o.total_amount,
         o.payment_method,
         o.status,
         o.ordered_at,
         t.label AS table_label
       FROM orders o
       LEFT JOIN tables t ON t.id = o.table_id
       WHERE o.store_id = $1
         AND o.cashier_id = $2
         AND o.source = 'KASIR'
         AND o.ordered_at::date = CURRENT_DATE
       ORDER BY o.ordered_at DESC`,
      [store_id, cashier_id],
    );

    res.json({ orders: result.rows });
  } catch (err) {
    console.error("GET /api/cashier-orders/history error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// PATCH  /api/cashier-orders/:id/status
// Update status pesanan (PREPARING, COMPLETED, CANCELLED)
// ─────────────────────────────────────────────
router.patch("/:id/status", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { store_id } = req.user;
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["PREPARING", "COMPLETED", "CANCELLED"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Status tidak valid" });
    }

    await client.query("BEGIN");

    const orderResult = await client.query(
      `SELECT id, status, table_id FROM orders WHERE id = $1 AND store_id = $2`,
      [id, store_id],
    );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Pesanan tidak ditemukan" });
    }

    const order = orderResult.rows[0];

    const updateResult = await client.query(
       `UPDATE orders
        SET status = $1::order_status,
            completed_at = CASE WHEN $1::order_status = 'COMPLETED'::order_status THEN NOW() ELSE completed_at END
        WHERE id = $2
        RETURNING *`,
      [status, id],
    );

    // Bebaskan meja jika pesanan selesai atau dibatalkan
    if (["COMPLETED", "CANCELLED"].includes(status) && order.table_id) {
      await client.query(
        `UPDATE tables SET status = 'AVAILABLE' WHERE id = $1`,
        [order.table_id],
      );
    }

    await client.query("COMMIT");
    res.json({ message: "Status diperbarui", order: updateResult.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PATCH /api/cashier-orders/:id/status error:", err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

export default router;
