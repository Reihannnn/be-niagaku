import express from "express";
import db from "../config/db.js";
import auth from "../middleware/auth.js";

const router = express.Router();

//
// ✅ GET DASHBOARD STATS
//
router.get("/", auth, async (req, res) => {
  try {
    const storeId = req.user.store_id;

    //
    // TOTAL REVENUE HARI INI
    //
    const todayRevenueQuery = await db.query(
      `
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM orders
      WHERE store_id = $1
      AND status = 'COMPLETED'
      AND DATE(completed_at) = CURRENT_DATE
      `,
      [storeId],
    );

    //
    // TOTAL REVENUE MINGGU INI
    //
    const weeklyRevenueQuery = await db.query(
      `
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM orders
      WHERE store_id = $1
      AND status = 'COMPLETED'
      AND DATE_TRUNC('week', completed_at)
          = DATE_TRUNC('week', CURRENT_DATE)
      `,
      [storeId],
    );

    //
    // TOTAL ORDER HARI INI
    //
    const totalOrdersTodayQuery = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM orders
      WHERE store_id = $1
      AND DATE(ordered_at) = CURRENT_DATE
      `,
      [storeId],
    );

    //
    // PAYMENT METHOD STATS
    //
    const paymentMethodQuery = await db.query(
      `
      SELECT
        payment_method,
        COUNT(*) AS total
      FROM orders
      WHERE store_id = $1
      AND status = 'COMPLETED'
      GROUP BY payment_method
      `,
      [storeId],
    );

    //
    // REVENUE LAST 7 DAYS
    //
    const revenueChartQuery = await db.query(
      `
  SELECT
    dates.date,
    COALESCE(SUM(o.total_amount), 0) AS revenue
  FROM (
    SELECT generate_series(
      CURRENT_DATE - INTERVAL '6 days',
      CURRENT_DATE,
      INTERVAL '1 day'
    )::date AS date
  ) dates
  LEFT JOIN orders o
    ON DATE(o.completed_at) = dates.date
    AND o.store_id = $1
    AND o.status = 'COMPLETED'
  GROUP BY dates.date
  ORDER BY dates.date ASC
  `,
      [storeId],
    );

    //
    // RECENT ORDERS
    //
    const recentOrdersQuery = await db.query(
      `
      SELECT
        o.id,
        o.customer_name,
        o.total_amount,
        o.payment_method,
        o.status,
        o.ordered_at,
        t.label AS table_name
      FROM orders o
      LEFT JOIN tables t
      ON o.table_id = t.id
      WHERE o.store_id = $1
      ORDER BY o.ordered_at DESC
      LIMIT 5
      `,
      [storeId],
    );

    res.json({
      success: true,
      data: {
        today_revenue: Number(todayRevenueQuery.rows[0].total),
        weekly_revenue: Number(weeklyRevenueQuery.rows[0].total),
        total_orders_today: Number(totalOrdersTodayQuery.rows[0].total),
        payment_methods: paymentMethodQuery.rows,
        revenue_chart: revenueChartQuery.rows,
        recent_orders: recentOrdersQuery.rows,
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default router;
