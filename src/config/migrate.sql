-- Enums
CREATE TYPE role_enum AS ENUM ('ADMIN', 'KASIR');
CREATE TYPE product_status AS ENUM ('AVAILABLE', 'OUT_OF_STOCK');
CREATE TYPE table_status AS ENUM ('AVAILABLE', 'OCCUPIED');
CREATE TYPE order_source AS ENUM ('SELF_ORDER', 'KASIR');
CREATE TYPE order_status AS ENUM (
  'WAITING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'COMPLETED',
  'CANCELLED'
);
CREATE TYPE payment_method AS ENUM ('QRIS', 'CASH');

-- Tabel stores
CREATE TABLE stores (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(50) NOT NULL,
  address               TEXT,
  logo_url              TEXT,
  instagram             VARCHAR(50),
  website               VARCHAR(50),
  struk_header          TEXT,
  struk_footer          TEXT,
  is_open               BOOLEAN DEFAULT true,
  midtrans_server_key   TEXT,
  midtrans_client_key   TEXT,
  midtrans_is_production BOOLEAN DEFAULT false,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- Tabel users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id),
  name          VARCHAR(50) NOT NULL,
  email         VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          role_enum DEFAULT 'KASIR',
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Tabel categories
CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES stores(id),
  name       VARCHAR(25) NOT NULL,
  sort_order INT DEFAULT 0
);

-- Tabel products
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  name        VARCHAR(50) NOT NULL,
  price       INT NOT NULL,
  image_url   TEXT,
  status      product_status DEFAULT 'AVAILABLE',
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Tabel tables (meja)
CREATE TABLE tables (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id  UUID NOT NULL REFERENCES stores(id),
  label     VARCHAR(50) NOT NULL,
  qr_token  UUID UNIQUE DEFAULT gen_random_uuid(),
  status    table_status DEFAULT 'AVAILABLE'
);

-- Tabel orders
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID NOT NULL REFERENCES stores(id),
  table_id          UUID REFERENCES tables(id),
  cashier_id        UUID REFERENCES users(id),
  daily_number      INT NOT NULL,
  source            order_source DEFAULT 'SELF_ORDER',
  status            order_status DEFAULT 'PENDING_CASH',
  payment_method    payment_method,
  total_amount      INT NOT NULL,
  customer_name     VARCHAR(100),
  customer_note     TEXT,
  midtrans_order_id TEXT UNIQUE,
  paid_at           TIMESTAMP,
  ordered_at        TIMESTAMP DEFAULT NOW(),
  completed_at      TIMESTAMP
);

-- Tabel order_items
CREATE TABLE order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id),
  product_id     UUID NOT NULL REFERENCES products(id),
  quantity       INT NOT NULL,
  price_snapshot INT NOT NULL,
  notes          TEXT
);

