-- MediFlow Database Initialization
-- Run order: this file first, then individual schema files

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- trigram for fuzzy search
CREATE EXTENSION IF NOT EXISTS "unaccent";  -- for Arabic search normalization

-- Create schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS users;
CREATE SCHEMA IF NOT EXISTS patients;
CREATE SCHEMA IF NOT EXISTS doctors;
CREATE SCHEMA IF NOT EXISTS pharmacies;
CREATE SCHEMA IF NOT EXISTS warehouses;
CREATE SCHEMA IF NOT EXISTS products;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS prescriptions;
CREATE SCHEMA IF NOT EXISTS deliveries;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS loyalty;
CREATE SCHEMA IF NOT EXISTS advertisements;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS insurance;

-- ─── AUTH SCHEMA ────────────────────────────────────────────────────────────

CREATE TABLE auth.users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE,
  phone           VARCHAR(30) UNIQUE,
  password_hash   VARCHAR(255),
  role            VARCHAR(50) NOT NULL DEFAULT 'patient',
  status          VARCHAR(30) NOT NULL DEFAULT 'pending_verification',
  mfa_enabled     BOOLEAN NOT NULL DEFAULT false,
  mfa_secret      VARCHAR(64),
  email_verified  BOOLEAN NOT NULL DEFAULT false,
  phone_verified  BOOLEAN NOT NULL DEFAULT false,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE auth.refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  device_id   VARCHAR(255),
  ip_address  INET,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash   VARCHAR(255) NOT NULL,
  type        VARCHAR(30) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  attempts    SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id       VARCHAR(255) NOT NULL,
  device_name     VARCHAR(255),
  platform        VARCHAR(30),
  push_token      TEXT,
  is_trusted      BOOLEAN DEFAULT false,
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

-- ─── USERS SCHEMA ───────────────────────────────────────────────────────────

CREATE TABLE users.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  display_name    VARCHAR(200),
  avatar_url      TEXT,
  date_of_birth   DATE,
  gender          VARCHAR(20),
  preferred_lang  VARCHAR(10) DEFAULT 'ar',
  preferred_currency VARCHAR(5) DEFAULT 'IQD',
  timezone        VARCHAR(50) DEFAULT 'Asia/Baghdad',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users.addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label       VARCHAR(100),
  full_address TEXT NOT NULL,
  city        VARCHAR(100),
  country     VARCHAR(50) DEFAULT 'IQ',
  latitude    DECIMAL(10,8),
  longitude   DECIMAL(11,8),
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PRODUCTS SCHEMA ────────────────────────────────────────────────────────

CREATE TABLE products.categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID REFERENCES products.categories(id),
  name        VARCHAR(200) NOT NULL,
  name_ar     VARCHAR(200),
  slug        VARCHAR(200) UNIQUE NOT NULL,
  icon_url    TEXT,
  sort_order  SMALLINT DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products.drugs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_name      VARCHAR(500) NOT NULL,
  generic_name_ar   VARCHAR(500),
  brand_name        VARCHAR(500),
  brand_name_ar     VARCHAR(500),
  category_id       UUID REFERENCES products.categories(id),
  drug_class        VARCHAR(255),
  atc_code          VARCHAR(20),
  dosage_form       VARCHAR(100),
  strength          VARCHAR(100),
  unit              VARCHAR(50),
  manufacturer      VARCHAR(255),
  country_of_origin VARCHAR(100),
  requires_prescription BOOLEAN DEFAULT false,
  is_controlled_substance BOOLEAN DEFAULT false,
  storage_conditions TEXT,
  requires_refrigeration BOOLEAN DEFAULT false,
  max_retail_price  DECIMAL(12,2),
  currency          VARCHAR(5) DEFAULT 'IQD',
  description       TEXT,
  description_ar    TEXT,
  image_urls        TEXT[],
  barcode           VARCHAR(100) UNIQUE,
  search_vector     TSVECTOR,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products.drug_interactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_a_id     UUID NOT NULL REFERENCES products.drugs(id),
  drug_b_id     UUID NOT NULL REFERENCES products.drugs(id),
  severity      VARCHAR(20) NOT NULL,
  description   TEXT NOT NULL,
  recommendation TEXT,
  source        VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(drug_a_id, drug_b_id),
  CHECK(drug_a_id < drug_b_id)
);

-- ─── PHARMACIES SCHEMA ──────────────────────────────────────────────────────

CREATE TABLE pharmacies.pharmacies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id),
  name            VARCHAR(255) NOT NULL,
  name_ar         VARCHAR(255),
  license_number  VARCHAR(100) NOT NULL UNIQUE,
  license_expiry  DATE NOT NULL,
  email           VARCHAR(255),
  phone           VARCHAR(30) NOT NULL,
  address         TEXT NOT NULL,
  city            VARCHAR(100),
  country         VARCHAR(50) DEFAULT 'IQ',
  latitude        DECIMAL(10,8),
  longitude       DECIMAL(11,8),
  location        GEOMETRY(POINT, 4326),
  front_image_url TEXT,
  interior_image_urls TEXT[],
  operating_hours JSONB,
  delivery_radius_km DECIMAL(6,2) DEFAULT 5.0,
  delivery_fee    DECIMAL(10,2) DEFAULT 0,
  min_order_amount DECIMAL(10,2) DEFAULT 0,
  status          VARCHAR(30) DEFAULT 'pending_verification',
  subscription_tier VARCHAR(20) DEFAULT 'standard',
  rating          DECIMAL(3,2) DEFAULT 0.00,
  total_reviews   INTEGER DEFAULT 0,
  verified_at     TIMESTAMPTZ,
  suspended_at    TIMESTAMPTZ,
  suspension_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ─── INVENTORY SCHEMA ───────────────────────────────────────────────────────

CREATE TABLE inventory.pharmacy_stock (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id     UUID NOT NULL,
  drug_id         UUID NOT NULL REFERENCES products.drugs(id),
  branch_id       UUID,
  quantity        INTEGER NOT NULL DEFAULT 0,
  reserved_qty    INTEGER NOT NULL DEFAULT 0,
  reorder_level   INTEGER NOT NULL DEFAULT 10,
  selling_price   DECIMAL(12,2) NOT NULL,
  currency        VARCHAR(5) DEFAULT 'IQD',
  is_available    BOOLEAN GENERATED ALWAYS AS ((quantity - reserved_qty) > 0) STORED,
  last_restocked  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pharmacy_id, drug_id, branch_id)
);

CREATE TABLE inventory.stock_reservations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id   UUID NOT NULL,
  drug_id       UUID NOT NULL REFERENCES products.drugs(id),
  order_id      UUID,
  quantity      INTEGER NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  confirmed     BOOLEAN DEFAULT false,
  cancelled     BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ORDERS SCHEMA ──────────────────────────────────────────────────────────

CREATE TABLE orders.medication_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES auth.users(id),
  prescription_id UUID,
  is_emergency    BOOLEAN DEFAULT false,
  latitude        DECIMAL(10,8) NOT NULL,
  longitude       DECIMAL(11,8) NOT NULL,
  search_radius_km DECIMAL(6,2) DEFAULT 5.0,
  status          VARCHAR(30) DEFAULT 'searching',
  ranked_pharmacies UUID[],
  current_rank    SMALLINT DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders.request_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES orders.medication_requests(id) ON DELETE CASCADE,
  drug_id     UUID NOT NULL REFERENCES products.drugs(id),
  quantity    INTEGER NOT NULL,
  notes       TEXT
);

CREATE TABLE orders.pharmacy_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES orders.medication_requests(id),
  pharmacy_id     UUID NOT NULL,
  total_price     DECIMAL(12,2) NOT NULL,
  delivery_fee    DECIMAL(12,2) DEFAULT 0,
  currency        VARCHAR(5) DEFAULT 'IQD',
  estimated_eta_min SMALLINT,
  notes           TEXT,
  status          VARCHAR(30) DEFAULT 'pending',
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders.orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES auth.users(id),
  pharmacy_id       UUID NOT NULL,
  offer_id          UUID REFERENCES orders.pharmacy_offers(id),
  prescription_id   UUID,
  status            VARCHAR(30) DEFAULT 'pending_payment',
  subtotal          DECIMAL(12,2) NOT NULL,
  delivery_fee      DECIMAL(12,2) DEFAULT 0,
  discount_amount   DECIMAL(12,2) DEFAULT 0,
  loyalty_discount  DECIMAL(12,2) DEFAULT 0,
  total_amount      DECIMAL(12,2) NOT NULL,
  currency          VARCHAR(5) DEFAULT 'IQD',
  delivery_address  TEXT,
  delivery_latitude DECIMAL(10,8),
  delivery_longitude DECIMAL(11,8),
  delivery_type     VARCHAR(20) DEFAULT 'delivery',
  notes             TEXT,
  cancelled_at      TIMESTAMPTZ,
  cancellation_reason TEXT,
  confirmed_at      TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders.order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
  drug_id       UUID NOT NULL REFERENCES products.drugs(id),
  drug_name     VARCHAR(500) NOT NULL,
  quantity      INTEGER NOT NULL,
  unit_price    DECIMAL(12,2) NOT NULL,
  total_price   DECIMAL(12,2) NOT NULL
);

-- ─── PRESCRIPTIONS SCHEMA ───────────────────────────────────────────────────

CREATE TABLE prescriptions.prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       UUID NOT NULL REFERENCES auth.users(id),
  patient_id      UUID NOT NULL REFERENCES auth.users(id),
  appointment_id  UUID,
  qr_token        VARCHAR(500) UNIQUE NOT NULL,
  status          VARCHAR(30) DEFAULT 'active',
  notes           TEXT,
  diagnosis       TEXT,
  is_controlled   BOOLEAN DEFAULT false,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  revoke_reason   TEXT,
  pdf_url         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE prescriptions.prescription_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES prescriptions.prescriptions(id) ON DELETE CASCADE,
  drug_id         UUID NOT NULL REFERENCES products.drugs(id),
  drug_name       VARCHAR(500) NOT NULL,
  dosage          VARCHAR(200) NOT NULL,
  frequency       VARCHAR(200) NOT NULL,
  duration        VARCHAR(100),
  quantity        INTEGER,
  instructions    TEXT,
  allow_substitute BOOLEAN DEFAULT false,
  is_dispensed    BOOLEAN DEFAULT false,
  dispensed_at    TIMESTAMPTZ,
  dispensed_by_pharmacy_id UUID
);

-- ─── PAYMENTS SCHEMA ────────────────────────────────────────────────────────

CREATE TABLE payments.transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID REFERENCES orders.orders(id),
  patient_id        UUID NOT NULL REFERENCES auth.users(id),
  amount            DECIMAL(14,2) NOT NULL,
  currency          VARCHAR(5) NOT NULL,
  type              VARCHAR(30) NOT NULL,
  method            VARCHAR(30) NOT NULL,
  gateway           VARCHAR(50),
  gateway_txn_id    VARCHAR(255),
  gateway_response  JSONB,
  status            VARCHAR(30) DEFAULT 'pending',
  idempotency_key   VARCHAR(255) UNIQUE,
  metadata          JSONB DEFAULT '{}',
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments.wallets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  owner_type        VARCHAR(30) NOT NULL,
  balance           DECIMAL(14,2) NOT NULL DEFAULT 0,
  pending_balance   DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency          VARCHAR(5) NOT NULL DEFAULT 'IQD',
  is_frozen         BOOLEAN DEFAULT false,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUDIT SCHEMA ───────────────────────────────────────────────────────────

CREATE TABLE audit.audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  uuid            UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  sequence_num    BIGINT NOT NULL,
  previous_hash   VARCHAR(64),
  current_hash    VARCHAR(64) NOT NULL,
  timestamp_utc   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id        UUID,
  actor_role      VARCHAR(50),
  actor_ip        INET,
  actor_user_agent TEXT,
  action          VARCHAR(100) NOT NULL,
  resource_type   VARCHAR(100) NOT NULL,
  resource_id     UUID,
  before_state    BYTEA,
  after_state     BYTEA,
  metadata        JSONB DEFAULT '{}'
);

-- ─── LOYALTY SCHEMA ─────────────────────────────────────────────────────────

CREATE TABLE loyalty.accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  total_points      INTEGER NOT NULL DEFAULT 0,
  redeemable_points INTEGER NOT NULL DEFAULT 0,
  lifetime_points   INTEGER NOT NULL DEFAULT 0,
  tier              VARCHAR(30) DEFAULT 'bronze',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loyalty.point_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID NOT NULL REFERENCES auth.users(id),
  type          VARCHAR(30) NOT NULL,
  points        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_id  UUID,
  reference_type VARCHAR(50),
  description   TEXT,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loyalty.referrals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id       UUID NOT NULL REFERENCES auth.users(id),
  referee_id        UUID NOT NULL REFERENCES auth.users(id),
  referral_code     VARCHAR(20) NOT NULL,
  status            VARCHAR(20) DEFAULT 'pending',
  referrer_rewarded BOOLEAN DEFAULT false,
  referee_rewarded  BOOLEAN DEFAULT false,
  rewarded_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INDEXES ────────────────────────────────────────────────────────────────

-- Auth
CREATE INDEX idx_auth_users_email ON auth.users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_auth_users_phone ON auth.users(phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_auth_users_role ON auth.users(role);
CREATE INDEX idx_auth_refresh_tokens_user ON auth.refresh_tokens(user_id);

-- Products
CREATE INDEX idx_products_drugs_search ON products.drugs USING GIN(search_vector);
CREATE INDEX idx_products_drugs_barcode ON products.drugs(barcode);
CREATE INDEX idx_products_drugs_rx ON products.drugs(requires_prescription);

-- Pharmacies
CREATE INDEX idx_pharmacies_location ON pharmacies.pharmacies USING GIST(location);
CREATE INDEX idx_pharmacies_status ON pharmacies.pharmacies(status);

-- Inventory
CREATE INDEX idx_inventory_pharmacy_stock ON inventory.pharmacy_stock(pharmacy_id, drug_id);
CREATE INDEX idx_inventory_available ON inventory.pharmacy_stock(pharmacy_id) WHERE is_available = true;
CREATE INDEX idx_inventory_reservations_expires ON inventory.stock_reservations(expires_at) WHERE confirmed = false;

-- Orders
CREATE INDEX idx_orders_patient ON orders.orders(patient_id);
CREATE INDEX idx_orders_pharmacy ON orders.orders(pharmacy_id);
CREATE INDEX idx_orders_status ON orders.orders(status);
CREATE INDEX idx_orders_created ON orders.orders(created_at DESC);

-- Prescriptions
CREATE INDEX idx_prescriptions_qr ON prescriptions.prescriptions(qr_token);
CREATE INDEX idx_prescriptions_patient ON prescriptions.prescriptions(patient_id);
CREATE INDEX idx_prescriptions_expires ON prescriptions.prescriptions(expires_at) WHERE status = 'active';

-- Payments
CREATE INDEX idx_payments_order ON payments.transactions(order_id);
CREATE INDEX idx_payments_patient ON payments.transactions(patient_id);

-- Audit
CREATE INDEX idx_audit_actor ON audit.audit_logs(actor_id, timestamp_utc DESC);
CREATE INDEX idx_audit_resource ON audit.audit_logs(resource_type, resource_id);

-- Loyalty
CREATE INDEX idx_loyalty_patient ON loyalty.point_transactions(patient_id, created_at DESC);
CREATE INDEX idx_loyalty_referral_code ON loyalty.referrals(referral_code);

-- ─── TRIGGERS ───────────────────────────────────────────────────────────────

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'auth.users', 'users.profiles', 'users.addresses',
    'pharmacies.pharmacies', 'inventory.pharmacy_stock',
    'orders.orders', 'orders.medication_requests',
    'payments.wallets', 'loyalty.accounts'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t
    );
  END LOOP;
END $$;

-- Update drug search vector
CREATE OR REPLACE FUNCTION update_drug_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector =
    setweight(to_tsvector('simple', COALESCE(NEW.generic_name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.brand_name, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.generic_name_ar, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.brand_name_ar, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_drug_search_vector
  BEFORE INSERT OR UPDATE ON products.drugs
  FOR EACH ROW EXECUTE FUNCTION update_drug_search_vector();

-- ─── SEED DATA ──────────────────────────────────────────────────────────────

INSERT INTO products.categories (name, name_ar, slug, sort_order) VALUES
  ('Prescription Medications', 'الأدوية الطبية', 'rx-medications', 1),
  ('Over the Counter', 'أدوية بدون وصفة', 'otc', 2),
  ('Vitamins & Supplements', 'الفيتامينات والمكملات', 'vitamins', 3),
  ('Medical Devices', 'الأجهزة الطبية', 'medical-devices', 4),
  ('Cosmetics & Skincare', 'مستحضرات التجميل والعناية بالبشرة', 'cosmetics', 5),
  ('Baby Care', 'رعاية الأطفال', 'baby-care', 6),
  ('Personal Care', 'العناية الشخصية', 'personal-care', 7);

INSERT INTO products.drugs (generic_name, generic_name_ar, brand_name, dosage_form, strength, requires_prescription, category_id)
SELECT
  'Paracetamol', 'باراسيتامول', 'Panadol', 'tablet', '500mg', false,
  (SELECT id FROM products.categories WHERE slug = 'otc')
UNION ALL SELECT
  'Amoxicillin', 'أموكسيسيلين', 'Amoxil', 'capsule', '500mg', true,
  (SELECT id FROM products.categories WHERE slug = 'rx-medications')
UNION ALL SELECT
  'Metformin', 'ميتفورمين', 'Glucophage', 'tablet', '500mg', true,
  (SELECT id FROM products.categories WHERE slug = 'rx-medications')
UNION ALL SELECT
  'Ibuprofen', 'إيبوبروفين', 'Brufen', 'tablet', '400mg', false,
  (SELECT id FROM products.categories WHERE slug = 'otc')
UNION ALL SELECT
  'Omeprazole', 'أوميبرازول', 'Losec', 'capsule', '20mg', false,
  (SELECT id FROM products.categories WHERE slug = 'otc');

SELECT 'Database initialized successfully' AS status;
