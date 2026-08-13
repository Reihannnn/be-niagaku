import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import swaggerUi from "swagger-ui-express";

import authRoutes from "./routes/auth.js";
import storeRoutes from "./routes/store.js";
import categoryRoutes from "./routes/categories.js";
import productRoutes from "./routes/products.js";
import accountRoutes from "./routes/accounts.js";
import tableRoutes from "./routes/tables.js";
import publicRoutes from "./routes/public.js";
import paymentRoutes from "./routes/payments.js";
import selfOrderRoutes from "./routes/selforder.js";
import orderRoutes from "./routes/orders.js";
import settingsRoutes from "./routes/settings.js";
import cashierOrderRoutes from "./routes/cashier-orders.js";
import dashboardRoutes from "./routes/dashboard.js";
import reportRoutes from "./routes/report.js";
import swaggerSpec from "./config/swagger.js";

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["http://localhost:3000", "https://manatok.my.id"],
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static("uploads"));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/api-docs.json", (req, res) => {
  res.json(swaggerSpec);
});

app.get("/api/health", (req, res) => {
  try {
    res.status(200).json({
      status: 200,
      message: "api manatok is running",
    });
  } catch (err) {
    res.status(500).json({
      status: res.status(500),
      message: `error at : ${err.message}`,
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/orders", selfOrderRoutes);
app.use("/api/tables-self-order", publicRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/self-orders", selfOrderRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/cashier-orders", cashierOrderRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
