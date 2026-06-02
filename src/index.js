import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path"

import authRoutes from "./routes/auth.js";
import categoryRoutes from "./routes/categories.js"
import productRoutes from "./routes/products.js"
import accountRoutes from "./routes/accounts.js"
import tableRoutes from "./routes/tables.js"
import publicRoutes from "./routes/public.js"
import paymentRoutes from "./routes/payments.js"
import selfOrderRoutes from "./routes/selforder.js"
import orderRoutes from "./routes/orders.js"
import settingsRoutes from "./routes/settings.js";
import cashierOrderRoutes from "./routes/cashier-orders.js";
import dashboardRoutes from "./routes/dashboard.js";

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/orders", selfOrderRoutes);
app.use("/api/tables-self-order", publicRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/self-orders", selfOrderRoutes);
app.use("/api/orders", orderRoutes)
app.use("/api/settings", settingsRoutes)
app.use("/api/cashier-orders", cashierOrderRoutes)
app.use("/api/dashboard",dashboardRoutes )

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
