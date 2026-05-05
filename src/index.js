import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path"

import authRoutes from "./routes/auth.js";
import categoryRoutes from "./routes/categories.js"
import productRoutes from "./routes/products.js"
import accountRoutes from "./routes/accounts.js"
// import tableRoutes from "./routes/tables.js"

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
// app.use("/api/tables", productRoutes);



app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
  