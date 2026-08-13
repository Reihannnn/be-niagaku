import express from "express";
import pool from "../config/db.js";
import puppeteer from "puppeteer";

const router = express.Router();

router.get("/pdf", async (req, res) => {
  try {
    const { type = "day", date } = req.query;

    if (!date) {
      return res.status(400).json({
        message: "Tanggal wajib diisi",
      });
    }

    let where = "";

    switch (type) {
      case "day":
        where = `DATE(ordered_at) = $1`;
        break;

      case "week":
        where = `
          DATE_TRUNC('week', ordered_at)
          =
          DATE_TRUNC('week', $1::date)
        `;
        break;

      case "month":
        where = `
          DATE_TRUNC('month', ordered_at)
          =
          DATE_TRUNC('month', $1::date)
        `;
        break;

      default:
        where = `DATE(ordered_at) = $1`;
    }

    const result = await pool.query(
      `
      SELECT
        daily_number,
        customer_name,
        status,
        payment_method,
        total_amount,
        ordered_at
      FROM orders
      WHERE ${where}
      ORDER BY ordered_at DESC
      `,
      [date]
    );

    const orders = result.rows;

    const totalRevenue = orders
      .filter((o) => o.status === "COMPLETED")
      .reduce((sum, o) => sum + Number(o.total_amount), 0);

    const totalOrder = orders.length;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body{
            font-family: Arial, sans-serif;
            padding:30px;
          }

          .header{
            text-align:center;
            margin-bottom:30px;
          }

          .title{
            font-size:28px;
            font-weight:bold;
          }

          .subtitle{
            color:#666;
          }

          .summary{
            display:flex;
            gap:20px;
            margin-bottom:30px;
          }

          .card{
            flex:1;
            border:1px solid #ddd;
            padding:15px;
            border-radius:10px;
          }

          table{
            width:100%;
            border-collapse:collapse;
          }

          th{
            background:#f5f5f5;
          }

          th,td{
            border:1px solid #ddd;
            padding:10px;
            text-align:left;
          }

          .right{
            text-align:right;
          }
        </style>
      </head>
      <body>

        <div class="header">
          <div class="title">Laporan Pesanan</div>
          <div class="subtitle">
            Periode :
            ${type === "day"
              ? "Harian"
              : type === "week"
              ? "Mingguan"
              : "Bulanan"}
          </div>
          <div>${date}</div>
        </div>

        <div class="summary">
          <div class="card">
            <h4>Total Pesanan</h4>
            <h2>${totalOrder}</h2>
          </div>

          <div class="card">
            <h4>Pendapatan</h4>
            <h2>
              Rp ${totalRevenue.toLocaleString("id-ID")}
            </h2>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Order</th>
              <th>Pelanggan</th>
              <th>Status</th>
              <th>Pembayaran</th>
              <th>Total</th>
              <th>Tanggal</th>
            </tr>
          </thead>
          <tbody>

          ${orders
            .map(
              (o, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>#${o.daily_number}</td>
                <td>${o.customer_name ?? "-"}</td>
                <td>${o.status}</td>
                <td>${o.payment_method ?? "-"}</td>
                <td>
                  Rp ${Number(
                    o.total_amount
                  ).toLocaleString("id-ID")}
                </td>
                <td>
                  ${new Date(
                    o.ordered_at
                  ).toLocaleString("id-ID")}
                </td>
              </tr>
            `
            )
            .join("")}

          </tbody>
        </table>

      </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20px",
        right: "20px",
        bottom: "20px",
        left: "20px",
      },
    });

    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdf.length,
      "Content-Disposition": `inline; filename=laporan.pdf`,
    });

    res.send(pdf);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: error.message,
    });
  }
});

export default router;