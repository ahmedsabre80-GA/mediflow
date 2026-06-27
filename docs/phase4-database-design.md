# PHASE 4 — DATABASE DESIGN, ERD & DATA MODELS

## Overview
- Primary DB: PostgreSQL 16 with PostGIS extension
- Schema-per-domain strategy (17 schemas in one cluster, Phase 1)
- All timestamps: UTC, stored as TIMESTAMPTZ
- All primary keys: UUID v4
- Soft deletes via deleted_at column on all entities
- Row-level security enabled on patient health data tables

---

## SCHEMA: auth

```sql
CREATE SCHEMA IF NOT EXISTS auth;

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
  tenant_id       UUID,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE auth.oauth_providers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider     VARCHAR(30) NOT NULL,  -- google, apple, facebook
  provider_id  VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_id)
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
  type        VARCHAR(30) NOT NULL,  -- email_verify, phone_verify, password_reset, mfa
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
  platform        VARCHAR(30),  -- ios, android, web
  push_token      TEXT,
  is_trusted      BOOLEAN DEFAULT false,
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

-- Indexes
CREATE INDEX idx_auth_users_email ON auth.users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_auth_users_phone ON auth.users(phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_auth_users_role ON auth.users(role);
CREATE INDEX idx_auth_refresh_tokens_user ON auth.refresh_tokens(user_id);
CREATE INDEX idx_auth_otp_user_type ON auth.otp_codes(user_id, type);
CREATE INDEX idx_auth_devices_user ON auth.devices(user_id);
```

---

## SCHEMA: users

```sql
CREATE SCHEMA IF NOT EXISTS users;

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
  label       VARCHAR(100),  -- Home, Work, Other
  full_address TEXT NOT NULL,
  city        VARCHAR(100),
  country     VARCHAR(50) DEFAULT 'IQ',
  latitude    DECIMAL(10,8),
  longitude   DECIMAL(11,8),
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users.family_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id),
  name        VARCHAR(100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users.family_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES users.family_groups(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),  -- null if not registered
  name            VARCHAR(200) NOT NULL,
  relationship    VARCHAR(50),  -- child, spouse, parent, sibling
  date_of_birth   DATE,
  gender          VARCHAR(20),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_addresses_user ON users.addresses(user_id);
CREATE INDEX idx_users_family_members_group ON users.family_members(group_id);
```

---

## SCHEMA: patients

```sql
CREATE SCHEMA IF NOT EXISTS patients;

CREATE TABLE patients.health_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  blood_type      VARCHAR(5),  -- A+, A-, B+, B-, AB+, AB-, O+, O-
  height_cm       SMALLINT,
  weight_kg       DECIMAL(5,2),
  emergency_contact_name  VARCHAR(200),
  emergency_contact_phone VARCHAR(30),
  notes           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE patients.allergies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allergen    VARCHAR(255) NOT NULL,
  severity    VARCHAR(20) DEFAULT 'moderate',  -- mild, moderate, severe, life-threatening
  reaction    TEXT,
  verified    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE patients.chronic_conditions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  condition     VARCHAR(255) NOT NULL,
  icd10_code    VARCHAR(20),
  diagnosed_at  DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE patients.current_medications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drug_name     VARCHAR(255) NOT NULL,
  dosage        VARCHAR(100),
  frequency     VARCHAR(100),
  started_at    DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE patients.health_data_consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accessor_id     UUID NOT NULL,  -- doctor or pharmacy ID
  accessor_type   VARCHAR(30) NOT NULL,  -- doctor, pharmacy
  data_types      TEXT[] NOT NULL,  -- ['allergies','conditions','medications']
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_patients_allergies_patient ON patients.allergies(patient_id);
CREATE INDEX idx_patients_conditions_patient ON patients.chronic_conditions(patient_id);
CREATE INDEX idx_patients_consents_patient ON patients.health_data_consents(patient_id);
CREATE INDEX idx_patients_consents_accessor ON patients.health_data_consents(accessor_id);
```

---

## SCHEMA: doctors

```sql
CREATE SCHEMA IF NOT EXISTS doctors;

CREATE TABLE doctors.profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  license_number    VARCHAR(100) UNIQUE NOT NULL,
  license_country   VARCHAR(50),
  license_expiry    DATE NOT NULL,
  specialization    VARCHAR(100) NOT NULL,
  sub_specialization VARCHAR(100),
  years_experience  SMALLINT,
  bio               TEXT,
  consultation_fee  DECIMAL(10,2),
  currency          VARCHAR(5) DEFAULT 'IQD',
  rating            DECIMAL(3,2) DEFAULT 0.00,
  total_reviews     INTEGER DEFAULT 0,
  total_consultations INTEGER DEFAULT 0,
  status            VARCHAR(30) DEFAULT 'pending_verification',
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE doctors.certificates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  issuer        VARCHAR(255) NOT NULL,
  issued_at     DATE,
  expiry_date   DATE,
  document_url  TEXT,
  verified      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE doctors.availability_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL,  -- 0=Sun, 6=Sat
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  slot_duration_min SMALLINT DEFAULT 30,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE doctors.appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       UUID NOT NULL REFERENCES auth.users(id),
  patient_id      UUID NOT NULL REFERENCES auth.users(id),
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_min    SMALLINT DEFAULT 30,
  type            VARCHAR(20) NOT NULL DEFAULT 'video',  -- video, voice, chat
  status          VARCHAR(30) DEFAULT 'scheduled',
  consultation_fee DECIMAL(10,2),
  currency        VARCHAR(5),
  room_id         VARCHAR(255),
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  notes           TEXT,
  recording_url   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_doctors_appointments_doctor ON doctors.appointments(doctor_id, scheduled_at);
CREATE INDEX idx_doctors_appointments_patient ON doctors.appointments(patient_id);
CREATE INDEX idx_doctors_availability_doctor ON doctors.availability_slots(doctor_id);
CREATE INDEX idx_doctors_profiles_status ON doctors.profiles(status);
CREATE INDEX idx_doctors_profiles_specialization ON doctors.profiles(specialization);
```

---

## SCHEMA: pharmacies

```sql
CREATE SCHEMA IF NOT EXISTS pharmacies;

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
  location        GEOMETRY(POINT, 4326),  -- PostGIS
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

CREATE TABLE pharmacies.branches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id   UUID NOT NULL REFERENCES pharmacies.pharmacies(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  phone         VARCHAR(30),
  address       TEXT NOT NULL,
  latitude      DECIMAL(10,8),
  longitude     DECIMAL(11,8),
  location      GEOMETRY(POINT, 4326),
  is_main       BOOLEAN DEFAULT false,
  status        VARCHAR(30) DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pharmacies.employees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id   UUID NOT NULL REFERENCES pharmacies.pharmacies(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  role          VARCHAR(50) NOT NULL,  -- manager, pharmacist, cashier, support
  permissions   TEXT[] DEFAULT '{}',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pharmacies.documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id   UUID NOT NULL REFERENCES pharmacies.pharmacies(id) ON DELETE CASCADE,
  type          VARCHAR(50) NOT NULL,  -- license, certificate, national_id, front_photo
  document_url  TEXT NOT NULL,
  expiry_date   DATE,
  verified      BOOLEAN DEFAULT false,
  verified_by   UUID REFERENCES auth.users(id),
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pharmacies.saved_patients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id   UUID NOT NULL REFERENCES pharmacies.pharmacies(id) ON DELETE CASCADE,
  patient_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pharmacy_id, patient_id)
);

-- Indexes
CREATE INDEX idx_pharmacies_location ON pharmacies.pharmacies USING GIST(location);
CREATE INDEX idx_pharmacies_status ON pharmacies.pharmacies(status);
CREATE INDEX idx_pharmacies_city ON pharmacies.pharmacies(city);
CREATE INDEX idx_pharmacies_branches_pharmacy ON pharmacies.branches(pharmacy_id);
CREATE INDEX idx_pharmacies_employees_pharmacy ON pharmacies.employees(pharmacy_id);
CREATE INDEX idx_pharmacies_saved_patients ON pharmacies.saved_patients(pharmacy_id);
```

---

## SCHEMA: warehouses

```sql
CREATE SCHEMA IF NOT EXISTS warehouses;

CREATE TABLE warehouses.warehouses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID NOT NULL REFERENCES auth.users(id),
  company_name          VARCHAR(255) NOT NULL,
  company_name_ar       VARCHAR(255),
  registration_number   VARCHAR(100) UNIQUE NOT NULL,
  distribution_license  VARCHAR(100) UNIQUE NOT NULL,
  license_expiry        DATE NOT NULL,
  tax_number            VARCHAR(100),
  responsible_pharmacist_name VARCHAR(255),
  responsible_pharmacist_license VARCHAR(100),
  email                 VARCHAR(255),
  phone                 VARCHAR(30) NOT NULL,
  address               TEXT NOT NULL,
  city                  VARCHAR(100),
  country               VARCHAR(50) DEFAULT 'IQ',
  latitude              DECIMAL(10,8),
  longitude             DECIMAL(11,8),
  location              GEOMETRY(POINT, 4326),
  front_image_url       TEXT,
  status                VARCHAR(30) DEFAULT 'pending_verification',
  subscription_tier     VARCHAR(20) DEFAULT 'standard',
  can_sell_to_patients  BOOLEAN DEFAULT false,
  verified_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE TABLE warehouses.pricing_tiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  UUID NOT NULL REFERENCES warehouses.warehouses(id) ON DELETE CASCADE,
  tier_name     VARCHAR(100) NOT NULL,
  discount_pct  DECIMAL(5,2) DEFAULT 0,
  min_order_value DECIMAL(12,2) DEFAULT 0,
  conditions    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_warehouses_location ON warehouses.warehouses USING GIST(location);
CREATE INDEX idx_warehouses_status ON warehouses.warehouses(status);
```

---

## SCHEMA: products

```sql
CREATE SCHEMA IF NOT EXISTS products;

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
  rxnorm_id         VARCHAR(50),
  dosage_form       VARCHAR(100),  -- tablet, capsule, syrup, injection
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
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products.drug_interactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_a_id     UUID NOT NULL REFERENCES products.drugs(id),
  drug_b_id     UUID NOT NULL REFERENCES products.drugs(id),
  severity      VARCHAR(20) NOT NULL,  -- minor, moderate, major, contraindicated
  description   TEXT NOT NULL,
  recommendation TEXT,
  source        VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(drug_a_id, drug_b_id),
  CHECK(drug_a_id < drug_b_id)  -- prevent duplicates in reverse order
);

-- Indexes
CREATE INDEX idx_products_drugs_generic_name ON products.drugs USING gin(to_tsvector('english', generic_name));
CREATE INDEX idx_products_drugs_brand_name ON products.drugs USING gin(to_tsvector('english', COALESCE(brand_name, '')));
CREATE INDEX idx_products_drugs_category ON products.drugs(category_id);
CREATE INDEX idx_products_drugs_requires_rx ON products.drugs(requires_prescription);
CREATE INDEX idx_products_drugs_barcode ON products.drugs(barcode);
CREATE INDEX idx_drug_interactions_a ON products.drug_interactions(drug_a_id);
CREATE INDEX idx_drug_interactions_b ON products.drug_interactions(drug_b_id);
```

---

## SCHEMA: inventory

```sql
CREATE SCHEMA IF NOT EXISTS inventory;

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

CREATE TABLE inventory.pharmacy_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id       UUID NOT NULL,
  drug_id           UUID NOT NULL REFERENCES products.drugs(id),
  batch_number      VARCHAR(100) NOT NULL,
  quantity          INTEGER NOT NULL,
  manufacture_date  DATE,
  expiry_date       DATE NOT NULL,
  purchase_price    DECIMAL(12,2),
  supplier_id       UUID,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory.warehouse_stock (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id    UUID NOT NULL,
  drug_id         UUID NOT NULL REFERENCES products.drugs(id),
  quantity        INTEGER NOT NULL DEFAULT 0,
  reserved_qty    INTEGER NOT NULL DEFAULT 0,
  reorder_level   INTEGER NOT NULL DEFAULT 100,
  wholesale_price DECIMAL(12,2) NOT NULL,
  currency        VARCHAR(5) DEFAULT 'IQD',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(warehouse_id, drug_id)
);

CREATE TABLE inventory.warehouse_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id      UUID NOT NULL,
  drug_id           UUID NOT NULL REFERENCES products.drugs(id),
  batch_number      VARCHAR(100) NOT NULL,
  quantity          INTEGER NOT NULL,
  manufacture_date  DATE,
  expiry_date       DATE NOT NULL,
  purchase_price    DECIMAL(12,2),
  manufacturer      VARCHAR(255),
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE inventory.recalls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_id         UUID NOT NULL REFERENCES products.drugs(id),
  batch_number    VARCHAR(100),
  reason          TEXT NOT NULL,
  severity        VARCHAR(20) NOT NULL,  -- voluntary, mandatory, urgent
  issued_by       UUID REFERENCES auth.users(id),
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_inventory_pharmacy_stock_pharmacy ON inventory.pharmacy_stock(pharmacy_id);
CREATE INDEX idx_inventory_pharmacy_stock_drug ON inventory.pharmacy_stock(drug_id);
CREATE INDEX idx_inventory_pharmacy_stock_available ON inventory.pharmacy_stock(pharmacy_id, drug_id) WHERE is_available = true;
CREATE INDEX idx_inventory_pharmacy_batches_expiry ON inventory.pharmacy_batches(expiry_date);
CREATE INDEX idx_inventory_warehouse_stock ON inventory.warehouse_stock(warehouse_id, drug_id);
CREATE INDEX idx_inventory_reservations_expires ON inventory.stock_reservations(expires_at) WHERE confirmed = false;

-- Partition pharmacy_batches by expiry_date for performance
CREATE TABLE inventory.pharmacy_batches_2025 PARTITION OF inventory.pharmacy_batches
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
```

---

## SCHEMA: orders

```sql
CREATE SCHEMA IF NOT EXISTS orders;

CREATE TABLE orders.medication_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES auth.users(id),
  prescription_id UUID,
  is_emergency    BOOLEAN DEFAULT false,
  latitude        DECIMAL(10,8) NOT NULL,
  longitude       DECIMAL(11,8) NOT NULL,
  search_radius_km DECIMAL(6,2) DEFAULT 5.0,
  status          VARCHAR(30) DEFAULT 'searching',
  -- searching, offers_received, offer_selected, cancelled, expired
  current_rank    SMALLINT DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders.request_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES orders.medication_requests(id) ON DELETE CASCADE,
  drug_id         UUID NOT NULL REFERENCES products.drugs(id),
  quantity        INTEGER NOT NULL,
  notes           TEXT
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
  status          VARCHAR(30) DEFAULT 'pending',  -- pending, accepted, rejected, expired
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
  -- pending_payment, confirmed, preparing, ready, in_transit, delivered, cancelled, refunded
  subtotal          DECIMAL(12,2) NOT NULL,
  delivery_fee      DECIMAL(12,2) DEFAULT 0,
  discount_amount   DECIMAL(12,2) DEFAULT 0,
  loyalty_discount  DECIMAL(12,2) DEFAULT 0,
  total_amount      DECIMAL(12,2) NOT NULL,
  currency          VARCHAR(5) DEFAULT 'IQD',
  delivery_address  TEXT,
  delivery_latitude DECIMAL(10,8),
  delivery_longitude DECIMAL(11,8),
  delivery_type     VARCHAR(20) DEFAULT 'delivery',  -- delivery, pickup
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
  total_price   DECIMAL(12,2) NOT NULL,
  batch_id      UUID
);

CREATE TABLE orders.order_timeline (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
  status      VARCHAR(30) NOT NULL,
  notes       TEXT,
  actor_id    UUID,
  actor_type  VARCHAR(30),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_orders_requests_patient ON orders.medication_requests(patient_id);
CREATE INDEX idx_orders_requests_status ON orders.medication_requests(status);
CREATE INDEX idx_orders_offers_request ON orders.pharmacy_offers(request_id);
CREATE INDEX idx_orders_orders_patient ON orders.orders(patient_id);
CREATE INDEX idx_orders_orders_pharmacy ON orders.orders(pharmacy_id);
CREATE INDEX idx_orders_orders_status ON orders.orders(status);
CREATE INDEX idx_orders_orders_created ON orders.orders(created_at DESC);

-- Partition orders by month
CREATE TABLE orders.orders_2025_01 PARTITION OF orders.orders
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

---

## SCHEMA: prescriptions

```sql
CREATE SCHEMA IF NOT EXISTS prescriptions;

CREATE TABLE prescriptions.prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       UUID NOT NULL REFERENCES auth.users(id),
  patient_id      UUID NOT NULL REFERENCES auth.users(id),
  appointment_id  UUID,
  qr_token        VARCHAR(500) UNIQUE NOT NULL,
  status          VARCHAR(30) DEFAULT 'active',
  -- active, partially_dispensed, fully_dispensed, expired, revoked
  notes           TEXT,
  diagnosis       TEXT,
  is_controlled   BOOLEAN DEFAULT false,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  dispensed_at    TIMESTAMPTZ,
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

CREATE TABLE prescriptions.interaction_overrides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id   UUID NOT NULL REFERENCES prescriptions.prescriptions(id),
  interaction_ids   UUID[] NOT NULL,
  justification     TEXT NOT NULL,
  overridden_by     UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_prescriptions_patient ON prescriptions.prescriptions(patient_id);
CREATE INDEX idx_prescriptions_doctor ON prescriptions.prescriptions(doctor_id);
CREATE INDEX idx_prescriptions_qr_token ON prescriptions.prescriptions(qr_token);
CREATE INDEX idx_prescriptions_status ON prescriptions.prescriptions(status);
CREATE INDEX idx_prescriptions_expires ON prescriptions.prescriptions(expires_at) WHERE status = 'active';
```

---

## SCHEMA: deliveries

```sql
CREATE SCHEMA IF NOT EXISTS deliveries;

CREATE TABLE deliveries.drivers (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  national_id     VARCHAR(100) UNIQUE,
  vehicle_type    VARCHAR(50),  -- motorcycle, car, bicycle
  vehicle_plate   VARCHAR(30),
  license_number  VARCHAR(100),
  status          VARCHAR(30) DEFAULT 'pending_verification',
  is_online       BOOLEAN DEFAULT false,
  current_lat     DECIMAL(10,8),
  current_lng     DECIMAL(11,8),
  last_location_at TIMESTAMPTZ,
  rating          DECIMAL(3,2) DEFAULT 0.00,
  total_deliveries INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deliveries.deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders.orders(id),
  driver_id       UUID REFERENCES deliveries.drivers(id),
  pickup_address  TEXT NOT NULL,
  pickup_lat      DECIMAL(10,8),
  pickup_lng      DECIMAL(11,8),
  dropoff_address TEXT NOT NULL,
  dropoff_lat     DECIMAL(10,8),
  dropoff_lng     DECIMAL(11,8),
  status          VARCHAR(30) DEFAULT 'pending_assignment',
  -- pending_assignment, assigned, heading_to_pharmacy, picked_up, in_transit, delivered, failed
  assigned_at     TIMESTAMPTZ,
  picked_up_at    TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  failure_reason  TEXT,
  proof_photo_url TEXT,
  signature_url   TEXT,
  driver_earnings DECIMAL(10,2),
  currency        VARCHAR(5) DEFAULT 'IQD',
  distance_km     DECIMAL(8,2),
  duration_min    SMALLINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deliveries.location_history (
  id          BIGSERIAL PRIMARY KEY,  -- bigint for high volume
  delivery_id UUID NOT NULL REFERENCES deliveries.deliveries(id),
  driver_id   UUID NOT NULL,
  latitude    DECIMAL(10,8) NOT NULL,
  longitude   DECIMAL(11,8) NOT NULL,
  heading     SMALLINT,
  speed_kmh   DECIMAL(6,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (recorded_at);

-- Partitioned by day for high-volume GPS data
CREATE TABLE deliveries.location_history_2025_01 PARTITION OF deliveries.location_history
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Indexes
CREATE INDEX idx_deliveries_order ON deliveries.deliveries(order_id);
CREATE INDEX idx_deliveries_driver ON deliveries.deliveries(driver_id);
CREATE INDEX idx_deliveries_status ON deliveries.deliveries(status);
CREATE INDEX idx_location_history_delivery ON deliveries.location_history(delivery_id, recorded_at DESC);
```

---

## SCHEMA: payments

```sql
CREATE SCHEMA IF NOT EXISTS payments;

CREATE TABLE payments.transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID REFERENCES orders.orders(id),
  patient_id        UUID NOT NULL REFERENCES auth.users(id),
  amount            DECIMAL(14,2) NOT NULL,
  currency          VARCHAR(5) NOT NULL,
  type              VARCHAR(30) NOT NULL,  -- charge, refund, withdrawal, payout
  method            VARCHAR(30) NOT NULL,  -- card, wallet, cash, bank_transfer
  gateway           VARCHAR(50),  -- stripe, paytabs, fawry, tap, internal
  gateway_txn_id    VARCHAR(255),
  gateway_response  JSONB,
  status            VARCHAR(30) DEFAULT 'pending',  -- pending, processing, success, failed, refunded
  idempotency_key   VARCHAR(255) UNIQUE,
  metadata          JSONB DEFAULT '{}',
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments.wallets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  owner_type        VARCHAR(30) NOT NULL,  -- patient, pharmacy, warehouse, driver
  balance           DECIMAL(14,2) NOT NULL DEFAULT 0,
  pending_balance   DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency          VARCHAR(5) NOT NULL DEFAULT 'IQD',
  is_frozen         BOOLEAN DEFAULT false,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments.wallet_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id     UUID NOT NULL REFERENCES payments.wallets(id),
  type          VARCHAR(30) NOT NULL,  -- credit, debit, hold, release
  amount        DECIMAL(14,2) NOT NULL,
  balance_after DECIMAL(14,2) NOT NULL,
  reference_id  UUID,
  reference_type VARCHAR(50),
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments.commission_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders.orders(id),
  transaction_id    UUID REFERENCES payments.transactions(id),
  provider_id       UUID NOT NULL,
  provider_type     VARCHAR(30) NOT NULL,  -- pharmacy, warehouse
  gross_amount      DECIMAL(14,2) NOT NULL,
  commission_rate   DECIMAL(5,4) NOT NULL,
  commission_amount DECIMAL(14,2) NOT NULL,
  net_amount        DECIMAL(14,2) NOT NULL,
  currency          VARCHAR(5) NOT NULL,
  settled_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payments_transactions_order ON payments.transactions(order_id);
CREATE INDEX idx_payments_transactions_patient ON payments.transactions(patient_id);
CREATE INDEX idx_payments_transactions_status ON payments.transactions(status);
CREATE INDEX idx_payments_transactions_idempotency ON payments.transactions(idempotency_key);
CREATE INDEX idx_payments_wallets_owner ON payments.wallets(owner_id);
CREATE INDEX idx_payments_wallet_txn_wallet ON payments.wallet_transactions(wallet_id, created_at DESC);
```

---

## SCHEMA: loyalty

```sql
CREATE SCHEMA IF NOT EXISTS loyalty;

CREATE TABLE loyalty.accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  total_points      INTEGER NOT NULL DEFAULT 0,
  redeemable_points INTEGER NOT NULL DEFAULT 0,
  lifetime_points   INTEGER NOT NULL DEFAULT 0,
  tier              VARCHAR(30) DEFAULT 'bronze',  -- bronze, silver, gold, platinum
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loyalty.point_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID NOT NULL REFERENCES auth.users(id),
  type          VARCHAR(30) NOT NULL,  -- earned_purchase, earned_review, earned_referral, redeemed, expired
  points        INTEGER NOT NULL,  -- negative for redemption/expiry
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
  status            VARCHAR(20) DEFAULT 'pending',  -- pending, rewarded, fraud_detected
  referrer_rewarded BOOLEAN DEFAULT false,
  referee_rewarded  BOOLEAN DEFAULT false,
  rewarded_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_loyalty_point_txn_patient ON loyalty.point_transactions(patient_id, created_at DESC);
CREATE INDEX idx_loyalty_referrals_referrer ON loyalty.referrals(referrer_id);
CREATE INDEX idx_loyalty_referrals_code ON loyalty.referrals(referral_code);
```

---

## SCHEMA: advertisements

```sql
CREATE SCHEMA IF NOT EXISTS advertisements;

CREATE TABLE advertisements.campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES auth.users(id),
  owner_type        VARCHAR(30) NOT NULL,  -- pharmacy, warehouse
  title             VARCHAR(255) NOT NULL,
  body              TEXT NOT NULL,
  image_url         TEXT,
  cta_text          VARCHAR(100),
  cta_url           TEXT,
  target_type       VARCHAR(30) NOT NULL,  -- patients, pharmacies
  target_ids        UUID[],
  target_criteria   JSONB,
  status            VARCHAR(30) DEFAULT 'draft',  -- draft, scheduled, active, paused, completed
  scheduled_at      TIMESTAMPTZ,
  frequency_hours   SMALLINT,
  max_sends         SMALLINT,
  sends_count       SMALLINT DEFAULT 0,
  next_send_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE advertisements.campaign_analytics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES advertisements.campaigns(id) ON DELETE CASCADE,
  recipient_id    UUID NOT NULL,
  delivered_at    TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  order_placed_at TIMESTAMPTZ,
  order_id        UUID
);

-- Indexes
CREATE INDEX idx_ads_campaigns_owner ON advertisements.campaigns(owner_id);
CREATE INDEX idx_ads_campaigns_status ON advertisements.campaigns(status, next_send_at);
CREATE INDEX idx_ads_analytics_campaign ON advertisements.campaign_analytics(campaign_id);
```

---

## SCHEMA: audit

```sql
CREATE SCHEMA IF NOT EXISTS audit;

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
  before_state    BYTEA,  -- encrypted JSON
  after_state     BYTEA,  -- encrypted JSON
  metadata        JSONB DEFAULT '{}',
  tenant_id       UUID
) PARTITION BY RANGE (timestamp_utc);

-- Monthly partitions
CREATE TABLE audit.audit_logs_2025_01 PARTITION OF audit.audit_logs
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Indexes
CREATE INDEX idx_audit_actor ON audit.audit_logs(actor_id, timestamp_utc DESC);
CREATE INDEX idx_audit_resource ON audit.audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_action ON audit.audit_logs(action, timestamp_utc DESC);
```

---

## Indexing Strategy Summary

| Table | Index Type | Columns | Reason |
|---|---|---|---|
| pharmacies.pharmacies | GIST | location | Geospatial proximity queries |
| warehouses.warehouses | GIST | location | Geospatial proximity queries |
| products.drugs | GIN (tsvector) | generic_name, brand_name | Full-text search |
| orders.orders | BTREE | patient_id, status | Order lookup |
| prescriptions.prescriptions | BTREE | qr_token | QR scan verification |
| audit.audit_logs | BTREE | actor_id, timestamp | Audit lookup |
| inventory.pharmacy_stock | BTREE | pharmacy_id, drug_id | Stock check |
| deliveries.location_history | BTREE | delivery_id, recorded_at | Live tracking |

---

## Data Retention Policy

| Data Type | Hot Storage | Archive | Delete |
|---|---|---|---|
| Prescription records | 2 years | 8 years | Never (10yr min) |
| Financial transactions | 1 year | 6 years | Never (7yr min) |
| Audit logs | 1 year | 4 years | 5-10 years |
| GPS location history | 30 days | — | After 30 days |
| OTP codes | 24 hours | — | Auto-delete |
| Session/tokens | Active | — | On expiry |
| Media files (photos) | Indefinite | — | On account delete |
