import express from "express";
import pool from "../config/db.js";
import { createSnap } from "../config/midtrans.js";
const router = express.Router();
// CREATE SELF ORDER

router.post("/self-order", async (req, res) => {
  try {
    const {
      token,
      customer_name,
      customer_phone,
      customer_note,
      payment_method,
      items,
    } = req.body;

    //
    // VALIDATION
    //
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token meja wajib diisi",
      });
    }

    if (!customer_name) {
      return res.status(400).json({
        success: false,
        message: "Nama customer wajib diisi",
      });
    }

    if (!payment_method) {
      return res.status(400).json({
        success: false,
        message: "Metode pembayaran wajib dipilih",
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Keranjang kosong",
      });
    }

    // GET TABLE
    const tableResult = await pool.query(
      `
        SELECT
          t.*,
          s.name as store_name,
          s.midtrans_server_key,
          s.midtrans_client_key,
          s.midtrans_is_production

        FROM tables t

        JOIN stores s
        ON s.id = t.store_id

        WHERE t.qr_token = $1
      `,
      [token],
    );

    if (tableResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Meja tidak ditemukan",
      });
    }

    const table = tableResult.rows[0];
    console.log(table)

    // CALCULATE TOTAL
    let total = 0;
    const validatedItems = [];

    for (const item of items) {
      const productResult = await pool.query(
        `
        SELECT *
        FROM products
        WHERE id = $1
        AND store_id = $2
        AND status = 'AVAILABLE'
        `,
        [item.product_id, table.store_id],
      );

      if (productResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Produk tidak ditemukan",
        });
      }

      const product = productResult.rows[0];

      const subtotal = Number(product.price) * Number(item.quantity);

      total += subtotal;

      validatedItems.push({
        product_id: product.id,
        quantity: item.quantity,
        notes: item.notes || "",
        price: product.price,
      });
    }

    //
    // ORDER STATUS
    //
    const status =
      payment_method === "QRIS" ? "WAITING_PAYMENT" : "WAITING_PAYMENT";

    //
    // DAILY NUMBER
    //
    const dailyNumberResult = await pool.query(
      `
      SELECT COUNT(*)::int + 1 as next_number
      FROM orders
      WHERE store_id = $1
      AND DATE(ordered_at) = CURRENT_DATE
      `,
      [table.store_id],
    );

    const dailyNumber = dailyNumberResult.rows[0].next_number;

    //
    // CREATE ORDER
    //
    const orderResult = await pool.query(
      `
      INSERT INTO orders
      (
        store_id,
        table_id,
        daily_number,
        source,
        status,
        payment_method,
        total_amount,
        customer_name,
        customer_phone,
        customer_note
      )
      VALUES
      (
        $1,$2,$3,
        'SELF_ORDER',
        $4,$5,$6,$7,$8,$9
      )
      RETURNING *
      `,
      [
        table.store_id,
        table.id,
        dailyNumber,
        status,
        payment_method,
        total,
        customer_name,
        customer_phone,
        customer_note,
      ],
    );

    const order = orderResult.rows[0];

    //
    // INSERT ORDER ITEMS
    //
    for (const item of validatedItems) {
      await pool.query(
        `
        INSERT INTO order_items
        (
          order_id,
          product_id,
          quantity,
          price_snapshot,
          notes
        )
        VALUES ($1,$2,$3,$4,$5)
        `,
        [order.id, item.product_id, item.quantity, item.price, item.notes],
      );
    }

    //
    // CASH
    //
    if (payment_method === "CASH") {
      return res.json({
        success: true,
        payment_method: "CASH",
        message: "Order berhasil dibuat",
        data: {
          order_id: order.id,
          status: order.status,
        },
      });
    }

    const snap = createSnap({
      serverKey: table.midtrans_server_key,
      clientKey: table.midtrans_client_key,
      isProduction: table.midtrans_is_production,
    });

    // MIDTRANS QRIS
    const midtransOrderId = `ORDER-${order.id}`;

    const transaction = await snap.createTransaction({
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: total,
      },

      customer_details: {
        first_name: customer_name,
        phone: customer_phone,
      },

     enabled_payments: ["qris", "gopay"],
    });

    //
    // SAVE MIDTRANS DATA
    //
    await pool.query(
      `
      UPDATE orders
      SET
        midtrans_order_id = $1,
        payment_url = $2
      WHERE id = $3
      `,
      [midtransOrderId, transaction.redirect_url, order.id],
    );



    // RESPONSE
    res.json({
      success: true,
      payment_method: "QRIS",
      message: "Order berhasil dibuat",
      data: {
        order_id: order.id,
        payment_url: transaction.redirect_url,
        snap_token: transaction.token,
      },
    });
  } catch (error) {
    console.error("SELF ORDER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default router;
