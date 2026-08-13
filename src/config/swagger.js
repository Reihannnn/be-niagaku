const bearerAuth = [{ bearerAuth: [] }];
const cookieAuth = [{ cookieAuth: [] }];
const authRequired = [{ bearerAuth: [] }, { cookieAuth: [] }];

const successResponse = {
  description: "Berhasil",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessResponse" },
    },
  },
};

const errorResponses = {
  400: { $ref: "#/components/responses/BadRequest" },
  401: { $ref: "#/components/responses/Unauthorized" },
  404: { $ref: "#/components/responses/NotFound" },
  500: { $ref: "#/components/responses/ServerError" },
};

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};

const tokenParam = {
  name: "token",
  in: "path",
  required: true,
  schema: { type: "string" },
};

const jsonBody = (schema) => ({
  required: true,
  content: {
    "application/json": {
      schema,
    },
  },
});

const multipartBody = (schema) => ({
  required: true,
  content: {
    "multipart/form-data": {
      schema,
    },
  },
});

const crudPaths = ({
  tag,
  basePath,
  listSummary,
  createSummary,
  updateSummary,
  deleteSummary,
  createSchema,
  updateSchema,
  adminOnly = true,
}) => ({
  [basePath]: {
    get: {
      tags: [tag],
      summary: listSummary,
      security: authRequired,
      responses: {
        200: successResponse,
        ...errorResponses,
      },
    },
    post: {
      tags: [tag],
      summary: createSummary,
      description: adminOnly ? "Membutuhkan role ADMIN." : undefined,
      security: authRequired,
      requestBody: jsonBody(createSchema),
      responses: {
        201: successResponse,
        200: successResponse,
        ...errorResponses,
      },
    },
  },
  [`${basePath}/{id}`]: {
    patch: {
      tags: [tag],
      summary: updateSummary,
      description: adminOnly ? "Membutuhkan role ADMIN." : undefined,
      security: authRequired,
      parameters: [idParam],
      requestBody: jsonBody(updateSchema),
      responses: {
        200: successResponse,
        ...errorResponses,
      },
    },
    delete: {
      tags: [tag],
      summary: deleteSummary,
      description: adminOnly ? "Membutuhkan role ADMIN." : undefined,
      security: authRequired,
      parameters: [idParam],
      responses: {
        200: successResponse,
        ...errorResponses,
      },
    },
  },
});

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "API Pesanan Makanan",
    version: "1.0.0",
    description:
      "Dokumentasi API backend sistem pemesanan makanan QR, kasir, produk, meja, pembayaran, dan laporan.",
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Local development",
    },
  ],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Store" },
    { name: "Settings" },
    { name: "Categories" },
    { name: "Products" },
    { name: "Accounts" },
    { name: "Tables" },
    { name: "Public Self Order" },
    { name: "Self Orders" },
    { name: "Cashier Orders" },
    { name: "Orders" },
    { name: "Payments" },
    { name: "Dashboard" },
    { name: "Reports" },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Cek status API",
        responses: {
          200: successResponse,
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Registrasi admin dan toko baru",
        requestBody: jsonBody({ $ref: "#/components/schemas/RegisterRequest" }),
        responses: {
          200: successResponse,
          ...errorResponses,
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login user",
        description:
          "Mengembalikan JWT dan juga menyimpan token pada cookie httpOnly.",
        requestBody: jsonBody({ $ref: "#/components/schemas/LoginRequest" }),
        responses: {
          200: {
            description: "Login berhasil",
            headers: {
              "Set-Cookie": {
                schema: { type: "string" },
                description: "Cookie token httpOnly.",
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout user",
        security: authRequired,
        responses: {
          200: successResponse,
          ...errorResponses,
        },
      },
    },
    "/api/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Kirim link reset password",
        requestBody: jsonBody({
          type: "object",
          required: ["email"],
          properties: { email: { type: "string", format: "email" } },
        }),
        responses: {
          200: successResponse,
          ...errorResponses,
        },
      },
    },
    "/api/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset password menggunakan token",
        requestBody: jsonBody({
          type: "object",
          required: ["token", "password"],
          properties: {
            token: { type: "string" },
            password: { type: "string", format: "password" },
          },
        }),
        responses: {
          200: successResponse,
          ...errorResponses,
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Ambil profil user login",
        security: authRequired,
        responses: {
          200: successResponse,
          ...errorResponses,
        },
      },
    },
    "/api/store": {
      get: {
        tags: ["Store"],
        summary: "Ambil ringkasan toko user",
        security: authRequired,
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/store/data-store": {
      get: {
        tags: ["Store"],
        summary: "Ambil data lengkap toko user",
        security: authRequired,
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/store/open": {
      patch: {
        tags: ["Store"],
        summary: "Buka toko",
        security: authRequired,
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/store/close": {
      patch: {
        tags: ["Store"],
        summary: "Tutup toko",
        security: authRequired,
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/settings": {
      get: {
        tags: ["Settings"],
        summary: "Ambil pengaturan toko",
        security: authRequired,
        responses: { 200: successResponse, ...errorResponses },
      },
      patch: {
        tags: ["Settings"],
        summary: "Update pengaturan toko",
        description: "Membutuhkan role ADMIN. Gunakan multipart untuk upload logo.",
        security: authRequired,
        requestBody: multipartBody({ $ref: "#/components/schemas/SettingsUpdateRequest" }),
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    ...crudPaths({
      tag: "Categories",
      basePath: "/api/categories",
      listSummary: "Ambil daftar kategori",
      createSummary: "Tambah kategori",
      updateSummary: "Update kategori",
      deleteSummary: "Hapus kategori",
      createSchema: { $ref: "#/components/schemas/CategoryRequest" },
      updateSchema: { $ref: "#/components/schemas/CategoryUpdateRequest" },
    }),
    "/api/products": {
      get: {
        tags: ["Products"],
        summary: "Ambil daftar produk",
        security: authRequired,
        parameters: [
          {
            name: "category_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: { 200: successResponse, ...errorResponses },
      },
      post: {
        tags: ["Products"],
        summary: "Tambah produk",
        description: "Membutuhkan role ADMIN. Gunakan multipart untuk upload gambar produk.",
        security: authRequired,
        requestBody: multipartBody({ $ref: "#/components/schemas/ProductCreateRequest" }),
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/products/{id}": {
      patch: {
        tags: ["Products"],
        summary: "Update produk",
        description: "Membutuhkan role ADMIN. Gunakan multipart untuk upload gambar baru.",
        security: authRequired,
        parameters: [idParam],
        requestBody: multipartBody({ $ref: "#/components/schemas/ProductUpdateRequest" }),
        responses: { 200: successResponse, ...errorResponses },
      },
      delete: {
        tags: ["Products"],
        summary: "Hapus produk secara soft delete",
        security: authRequired,
        parameters: [idParam],
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    ...crudPaths({
      tag: "Accounts",
      basePath: "/api/accounts",
      listSummary: "Ambil daftar akun kasir",
      createSummary: "Tambah akun kasir",
      updateSummary: "Update akun kasir",
      deleteSummary: "Hapus akun kasir",
      createSchema: { $ref: "#/components/schemas/CashierAccountRequest" },
      updateSchema: { $ref: "#/components/schemas/CashierAccountUpdateRequest" },
    }),
    ...crudPaths({
      tag: "Tables",
      basePath: "/api/tables",
      listSummary: "Ambil daftar meja",
      createSummary: "Tambah meja",
      updateSummary: "Update meja",
      deleteSummary: "Hapus meja",
      createSchema: { $ref: "#/components/schemas/TableCreateRequest" },
      updateSchema: { $ref: "#/components/schemas/TableUpdateRequest" },
    }),
    "/api/tables/{id}/regenerate-qr": {
      post: {
        tags: ["Tables"],
        summary: "Generate ulang QR token meja",
        description: "Membutuhkan role ADMIN.",
        security: authRequired,
        parameters: [idParam],
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/tables-self-order/{token}": {
      get: {
        tags: ["Public Self Order"],
        summary: "Ambil data meja dan produk untuk halaman self-order",
        parameters: [tokenParam],
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/self-orders/self-order": {
      post: {
        tags: ["Self Orders"],
        summary: "Buat pesanan dari pelanggan/self-order",
        requestBody: jsonBody({ $ref: "#/components/schemas/SelfOrderRequest" }),
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/orders/self-order": {
      post: {
        tags: ["Self Orders"],
        summary: "Alias buat pesanan self-order",
        requestBody: jsonBody({ $ref: "#/components/schemas/SelfOrderRequest" }),
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/cashier-orders": {
      get: {
        tags: ["Cashier Orders"],
        summary: "Ambil data awal halaman kasir",
        security: authRequired,
        responses: { 200: successResponse, ...errorResponses },
      },
      post: {
        tags: ["Cashier Orders"],
        summary: "Buat pesanan dari kasir",
        security: authRequired,
        requestBody: jsonBody({ $ref: "#/components/schemas/CashierOrderRequest" }),
        responses: { 201: successResponse, ...errorResponses },
      },
    },
    "/api/cashier-orders/history": {
      get: {
        tags: ["Cashier Orders"],
        summary: "Ambil riwayat pesanan kasir hari ini",
        security: authRequired,
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/cashier-orders/{id}/status": {
      patch: {
        tags: ["Cashier Orders"],
        summary: "Update status pesanan kasir",
        security: authRequired,
        parameters: [idParam],
        requestBody: jsonBody({ $ref: "#/components/schemas/OrderStatusUpdateRequest" }),
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/orders": {
      get: {
        tags: ["Orders"],
        summary: "Ambil daftar pesanan",
        security: authRequired,
        parameters: [
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/OrderStatus" } },
          { name: "payment_method", in: "query", schema: { $ref: "#/components/schemas/PaymentMethod" } },
          { name: "date", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/orders/{id}/status": {
      patch: {
        tags: ["Orders"],
        summary: "Update status pesanan",
        security: authRequired,
        parameters: [idParam],
        requestBody: jsonBody({ $ref: "#/components/schemas/OrderStatusUpdateRequest" }),
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/orders/{id}/pay-cash": {
      patch: {
        tags: ["Orders"],
        summary: "Konfirmasi pembayaran cash",
        security: authRequired,
        parameters: [idParam],
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/orders/{id}/invoice": {
      get: {
        tags: ["Orders"],
        summary: "Generate invoice PDF pesanan",
        security: authRequired,
        parameters: [idParam],
        responses: {
          200: {
            description: "File PDF invoice",
            content: {
              "application/pdf": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    "/api/payments/midtrans-notification": {
      post: {
        tags: ["Payments"],
        summary: "Webhook notifikasi pembayaran Midtrans",
        requestBody: jsonBody({ $ref: "#/components/schemas/MidtransNotificationRequest" }),
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/dashboard": {
      get: {
        tags: ["Dashboard"],
        summary: "Ambil statistik dashboard",
        security: authRequired,
        responses: { 200: successResponse, ...errorResponses },
      },
    },
    "/api/reports/pdf": {
      get: {
        tags: ["Reports"],
        summary: "Generate laporan pesanan PDF",
        parameters: [
          {
            name: "type",
            in: "query",
            schema: { type: "string", enum: ["day", "week", "month"], default: "day" },
          },
          {
            name: "date",
            in: "query",
            required: true,
            schema: { type: "string", format: "date" },
          },
        ],
        responses: {
          200: {
            description: "File PDF laporan",
            content: {
              "application/pdf": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "token",
      },
    },
    responses: {
      BadRequest: {
        description: "Request tidak valid",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      Unauthorized: {
        description: "Token tidak valid atau tidak dikirim",
      },
      NotFound: {
        description: "Data tidak ditemukan",
      },
      ServerError: {
        description: "Server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
    schemas: {
      SuccessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          status: { type: "boolean", example: true },
          message: { type: "string", example: "Berhasil" },
          data: { type: "object" },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          status: { type: "boolean", example: false },
          message: { type: "string", example: "Server error" },
          msg: { type: "string", example: "Server error" },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["name", "email", "password", "store_name"],
        properties: {
          name: { type: "string", example: "Admin Toko" },
          email: { type: "string", format: "email", example: "admin@example.com" },
          password: { type: "string", format: "password", example: "password123" },
          store_name: { type: "string", example: "Manatok" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "admin@example.com" },
          password: { type: "string", format: "password", example: "password123" },
        },
      },
      CategoryRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", maxLength: 25, example: "Minuman" },
          sort_order: { type: "integer", example: 1 },
        },
      },
      CategoryUpdateRequest: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 25, example: "Makanan" },
          sort_order: { type: "integer", example: 2 },
        },
      },
      ProductCreateRequest: {
        type: "object",
        required: ["name", "price", "category_id"],
        properties: {
          name: { type: "string", example: "Nasi Goreng" },
          price: { type: "number", example: 18000 },
          category_id: { type: "string", format: "uuid" },
          image: { type: "string", format: "binary" },
        },
      },
      ProductUpdateRequest: {
        type: "object",
        properties: {
          name: { type: "string", example: "Nasi Goreng Spesial" },
          price: { type: "number", example: 22000 },
          category_id: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["AVAILABLE", "UNAVAILABLE"] },
          image: { type: "string", format: "binary" },
        },
      },
      CashierAccountRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", example: "Kasir 1" },
          email: { type: "string", format: "email", example: "kasir@example.com" },
          password: { type: "string", format: "password", example: "password123" },
        },
      },
      CashierAccountUpdateRequest: {
        type: "object",
        required: ["name", "email"],
        properties: {
          name: { type: "string", example: "Kasir Utama" },
          email: { type: "string", format: "email", example: "kasir@example.com" },
          password: { type: "string", format: "password", example: "passwordbaru" },
        },
      },
      TableCreateRequest: {
        type: "object",
        required: ["label"],
        properties: {
          label: { type: "string", maxLength: 50, example: "Meja 1" },
        },
      },
      TableUpdateRequest: {
        type: "object",
        properties: {
          label: { type: "string", maxLength: 50, example: "Meja VIP" },
          status: { type: "string", enum: ["AVAILABLE", "OCCUPIED"] },
        },
      },
      SettingsUpdateRequest: {
        type: "object",
        properties: {
          name: { type: "string", example: "Manatok" },
          address: { type: "string", example: "Jl. Contoh No. 1" },
          instagram: { type: "string", example: "@manatok" },
          website: { type: "string", example: "https://manatok.my.id" },
          struk_header: { type: "string", example: "Selamat datang" },
          struk_footer: { type: "string", example: "Terima kasih" },
          is_open: { type: "string", enum: ["true", "false"] },
          midtrans_server_key: { type: "string" },
          midtrans_client_key: { type: "string" },
          midtrans_is_production: { type: "string", enum: ["true", "false"] },
          logo: { type: "string", format: "binary" },
        },
      },
      OrderItemRequest: {
        type: "object",
        required: ["product_id", "quantity"],
        properties: {
          product_id: { type: "string", format: "uuid" },
          quantity: { type: "integer", minimum: 1, example: 2 },
          notes: { type: "string", example: "Tidak pedas" },
        },
      },
      SelfOrderRequest: {
        type: "object",
        required: ["token", "customer_name", "payment_method", "items"],
        properties: {
          token: { type: "string", example: "qr-token-meja" },
          customer_name: { type: "string", example: "Budi" },
          customer_phone: { type: "string", example: "08123456789" },
          customer_note: { type: "string", example: "Antar cepat" },
          payment_method: { $ref: "#/components/schemas/PaymentMethod" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderItemRequest" },
          },
        },
      },
      CashierOrderRequest: {
        type: "object",
        required: ["payment_method", "items"],
        properties: {
          table_id: { type: "string", format: "uuid", nullable: true },
          customer_name: { type: "string", example: "Budi" },
          customer_note: { type: "string", example: "Dine in" },
          payment_method: { $ref: "#/components/schemas/PaymentMethod" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderItemRequest" },
          },
        },
      },
      OrderStatusUpdateRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: { $ref: "#/components/schemas/OrderStatus" },
        },
      },
      MidtransNotificationRequest: {
        type: "object",
        required: ["order_id", "transaction_status"],
        properties: {
          order_id: { type: "string", example: "ORDER-uuid-order" },
          transaction_status: {
            type: "string",
            enum: ["settlement", "capture", "expire", "cancel", "deny", "pending"],
          },
          transaction_time: { type: "string", example: "2026-07-14 10:00:00" },
        },
        additionalProperties: true,
      },
      PaymentMethod: {
        type: "string",
        enum: ["CASH", "QRIS"],
      },
      OrderStatus: {
        type: "string",
        enum: ["WAITING_PAYMENT", "CONFIRMED", "PREPARING", "COMPLETED", "CANCELLED"],
      },
    },
  },
};

export { bearerAuth, cookieAuth };
export default swaggerSpec;
