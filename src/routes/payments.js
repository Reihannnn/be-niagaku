import express from "express";
import pool from "../config/db.js";

const router = express.Router();

router.post("/midtrans-notification", async (req, res) => {
  try {
    const notification = req.body;

    console.log("=================================");
    console.log("JAM:", notification.transaction_time);
    console.log("STATUS:", notification.transaction_status);
    console.log("ORDER:", notification.order_id);
    console.log(JSON.stringify(notification, null, 2));
    console.log("=================================");

    const orderId = notification.order_id;
    const transactionStatus = notification.transaction_status;

    const realOrderId = orderId.replace("ORDER-", "");

    console.log("realOrderId:", realOrderId);
    
    // CEK ORDER DI DATABASE    
    const existingOrder = await pool.query(
      `
      SELECT id,status
      FROM orders
      WHERE id = $1
      `,
      [realOrderId],
    );

    console.log("ORDER DB:", existingOrder.rows);

    // PAYMENT SUCCESS
    if (transactionStatus === "settlement" || transactionStatus === "capture") {
      console.log("MASUK CONFIRMED");

      const result = await pool.query(
        `
        UPDATE orders
        SET
          status = 'CONFIRMED',
          paid_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [realOrderId],
      );

      console.log("UPDATED CONFIRMED:", result.rows);
    }

    // PAYMENT FAILED / EXPIRED
    else if (
      transactionStatus === "expire" ||
      transactionStatus === "cancel" ||
      transactionStatus === "deny"
    ) {
      console.log("EXPIRE MASUK");

      console.log("orderId:", orderId);
      console.log("realOrderId:", realOrderId);

      const before = await pool.query(
        `
    SELECT id, status, midtrans_order_id
    FROM orders
    WHERE id = $1
    `,
        [realOrderId],
      );

      console.log("BEFORE:", before.rows);

      const result = await pool.query(
        `
    UPDATE orders
    SET status = 'CANCELLED'
    WHERE id = $1
    RETURNING id, status, midtrans_order_id
    `,
        [realOrderId],
      );

      console.log("UPDATED:", result.rows);

      const after = await pool.query(
        `
    SELECT id, status, midtrans_order_id
    FROM orders
    WHERE id = $1
    `,
        [realOrderId],
      );

      console.log("AFTER:", after.rows);
    }

    // PENDING
    else if (transactionStatus === "pending") {
      console.log("ORDER MASIH PENDING");
    }

    return res.status(200).json({
      success: true,
    });
  } catch (err) {
    console.error("MIDTRANS WEBHOOK ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

export default router;