"use strict"; // v2
require("dotenv/config");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

// ─── INLINED ERROR CLASSES ────────────────────────────────────────────────────
class AppError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
class AuthenticationError extends AppError {
  constructor(code = 'AUTH_001', message = 'Authentication required') {
    super(code, message, 401);
    this.name = 'AuthenticationError';
  }
}
class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super('AUTH_003', message, 403);
    this.name = 'AuthorizationError';
  }
}
class ValidationError extends AppError {
  constructor(message, fieldErrors) {
    super('VAL_001', message, 422);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

// ─── INLINED MIDDLEWARE ───────────────────────────────────────────────────────
const publicKey = process.env.JWT_PUBLIC_KEY
  ? Buffer.from(process.env.JWT_PUBLIC_KEY, 'base64').toString()
  : '';

function traceIdMiddleware(req, _res, next) {
  req.traceId = req.headers['x-trace-id'] || uuidv4();
  next();
}

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO',
      traceId: req.traceId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
    }));
  });
  next();
}

function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('AUTH_001', 'Bearer token required'));
  }
  const token = authHeader.slice(7);
  try {
    let payload;
    if (publicKey) {
      // RS256 with public key (production)
      payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: process.env.JWT_ISSUER || 'https://auth.mediflow.io',
      });
    } else {
      // HS256 with shared secret — requires JWT_SECRET to be set
      const secret = process.env.JWT_SECRET;
      if (!secret) return next(new AuthenticationError('AUTH_001', 'Auth service not configured'));
      payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    }
    if (!payload) return next(new AuthenticationError('AUTH_001', 'Invalid token'));
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AuthenticationError('AUTH_002', 'Token expired'));
    }
    return next(new AuthenticationError('AUTH_001', 'Invalid token'));
  }
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AuthenticationError());
    if (!roles.includes(req.user.role)) {
      return next(new AuthorizationError(`Role '${req.user.role}' cannot access this resource`));
    }
    next();
  };
}
const isAdmin = requireRole('admin', 'super_admin', 'auditor', 'support');

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      title: 'Not Found',
      status: 404,
      detail: `Route ${req.method} ${req.path} not found`,
      traceId: req.traceId,
    },
  });
}

function errorHandler(err, req, res, _next) {
  const traceId = req.traceId || uuidv4();
  if (err instanceof AppError) {
    const response = {
      success: false,
      error: { title: err.name, status: err.httpStatus, detail: err.message, traceId },
    };
    if (err instanceof ValidationError) response.error.errors = err.fieldErrors;
    return res.status(err.httpStatus).json(response);
  }
  console.error({ err, traceId, path: req.path }, 'Unhandled error');
  return res.status(500).json({
    success: false,
    error: { title: 'Internal Server Error', status: 500, detail: err.message || 'An unexpected error occurred', traceId },
  });
}

// quota.js signals expected, named business-rule failures via err.code rather
// than throwing AppError subclasses (it has no dependency on this file's
// classes). This is the single place those codes map to an HTTP status, so
// every subscription/quota route handles them the same way instead of each
// repeating its own if (err.code === '...') block.
const QUOTA_ERROR_STATUS = {
  DUPLICATE_PENDING_REQUEST: 409,
  PLAN_NOT_CURRENT: 409,
  NOT_PENDING: 409,
  NO_ACTIVE_SUBSCRIPTION: 409,
  NOTHING_TO_RESTORE: 409,
  ALREADY_ACTIVE: 409,
  INVALID_OVERRIDE_VALUE: 422,
};
function handleQuotaError(err, res, next) {
  const status = QUOTA_ERROR_STATUS[err.code];
  if (!status) return next(err);
  const error = { title: err.message, status };
  if (err.existing) error.existing = err.existing;
  return res.status(status).json({ success: false, error });
}

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
async function bootstrap() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
  await pool.connect().then((c) => { console.log('PostgreSQL connected'); c.release(); });
  const quota = require('./quota')(pool);

  // Lightweight schema migrations
  await pool.query(`
    ALTER TABLE pharmacies.pharmacies
      ADD COLUMN IF NOT EXISTS delivery_rate_per_km INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_min_fee INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_max_km INTEGER DEFAULT 20
  `).catch(() => {});
  await pool.query(`ALTER TABLE pharmacies.pharmacies ADD COLUMN IF NOT EXISTS license_holder_name TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE public.admin_requests ADD COLUMN IF NOT EXISTS latitude FLOAT`).catch(() => {});
  await pool.query(`ALTER TABLE public.admin_requests ADD COLUMN IF NOT EXISTS longitude FLOAT`).catch(() => {});

  // `status` is the approval lifecycle (pending_verification/active/suspended/rejected/deleted) —
  // it must never double as an online/offline presence flag, or a pharmacy that simply logs out
  // gets treated as "not active" on its next login. `is_online` is the dedicated presence flag.
  await pool.query(`ALTER TABLE pharmacies.pharmacies ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT true`).catch(() => {});
  // One-time repair: any pharmacy previously pushed to status='inactive' by the online/offline
  // toggle (not by an admin, who never writes 'inactive') is really an active, approved pharmacy
  // that was just offline — restore its approval status and record it as offline via is_online.
  await pool.query(`UPDATE pharmacies.pharmacies SET is_online = false, status = 'active' WHERE status = 'inactive'`).catch(() => {});

  // Ensure products schema and drugs table with barcode column exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.drugs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      generic_name TEXT NOT NULL,
      brand_name TEXT,
      barcode TEXT,
      dosage_form TEXT,
      strength TEXT,
      requires_prescription BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS barcode TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS generic_name_en TEXT`).catch(() => {});
  await pool.query(`
    UPDATE public.drugs SET generic_name_en = CASE generic_name
      WHEN 'باراسيتامول'    THEN 'paracetamol'   WHEN 'أيبوبروفين'     THEN 'ibuprofen'
      WHEN 'أموكسيسيلين'   THEN 'amoxicillin'   WHEN 'أزيثروميسين'   THEN 'azithromycin'
      WHEN 'ميتفورمين'      THEN 'metformin'      WHEN 'أتورفاستاتين'  THEN 'atorvastatin'
      WHEN 'أومبرازول'      THEN 'omeprazole'     WHEN 'بانتوبرازول'   THEN 'pantoprazole'
      WHEN 'لوراتادين'     THEN 'loratadine'     WHEN 'سيتيريزين'     THEN 'cetirizine'
      WHEN 'ديكسامثازون'   THEN 'dexamethasone'  WHEN 'بريدنيزولون'   THEN 'prednisolone'
      WHEN 'ميترونيدازول'  THEN 'metronidazole'  WHEN 'سيبروفلوكساسين' THEN 'ciprofloxacin'
      WHEN 'إنالابريل'     THEN 'enalapril'      WHEN 'أملوديبين'     THEN 'amlodipine'
      WHEN 'ليفوثيروكسين'  THEN 'levothyroxine'  WHEN 'فيتامين D3'    THEN 'vitamin d3'
      WHEN 'فيتامين C'     THEN 'vitamin c'      WHEN 'أسبرين'        THEN 'aspirin'
      WHEN 'كلوبيدوغريل'  THEN 'clopidogrel'    WHEN 'راميبريل'      THEN 'ramipril'
      WHEN 'ميلوكسيكام'   THEN 'meloxicam'      WHEN 'ديكلوفيناك'   THEN 'diclofenac'
      WHEN 'غابابنتين'     THEN 'gabapentin'     WHEN 'سيرترالين'     THEN 'sertraline'
      WHEN 'كلاريثروميسين' THEN 'clarithromycin' WHEN 'فيتامين B12'   THEN 'vitamin b12'
      WHEN 'حديد'          THEN 'iron'           WHEN 'كالسيوم + D3'  THEN 'calcium d3'
      WHEN 'بيسوبرولول'    THEN 'bisoprolol'     WHEN 'فاموتيدين'     THEN 'famotidine'
      WHEN 'ترامادول'      THEN 'tramadol'       WHEN 'أسيكلوفير'     THEN 'acyclovir'
      WHEN 'فلوكونازول'    THEN 'fluconazole'
      ELSE NULL END WHERE generic_name_en IS NULL
  `).catch(() => {});

  // Pharmacy state table (per-pharmacy key-value for syncing order statuses across devices)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.pharmacy_state (
      pharmacy_id UUID NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (pharmacy_id, key)
    )
  `).catch(() => {});

  // Platform config table (key-value store for admin settings)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.platform_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  // Seed default config values if not set
  await pool.query(`
    INSERT INTO public.platform_config (key, value) VALUES ('auto_reject_minutes', '10')
    ON CONFLICT (key) DO NOTHING
  `).catch(() => {});
  await pool.query(`
    INSERT INTO public.platform_config (key, value) VALUES ('prescription_reject_minutes', '30')
    ON CONFLICT (key) DO NOTHING
  `).catch(() => {});

  // Warehouse schema and tables
  await pool.query(`CREATE SCHEMA IF NOT EXISTS warehouses`).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warehouses.warehouses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID NOT NULL,
      name TEXT NOT NULL DEFAULT 'مستودعي',
      name_ar TEXT,
      address TEXT,
      city TEXT,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS warehouses_owner_idx ON warehouses.warehouses(owner_id)
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warehouses.inventory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      warehouse_id UUID NOT NULL REFERENCES warehouses.warehouses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      name_ar TEXT,
      batch_number TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      reorder_level INTEGER NOT NULL DEFAULT 100,
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      expiry_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warehouses.b2b_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      warehouse_id UUID NOT NULL REFERENCES warehouses.warehouses(id),
      pharmacy_id TEXT NOT NULL,
      pharmacy_name TEXT NOT NULL,
      total NUMERIC(15,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warehouses.b2b_order_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES warehouses.b2b_orders(id) ON DELETE CASCADE,
      inventory_id UUID,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL
    )
  `).catch(() => {});
  // Add new warehouse inventory columns (idempotent)
  await pool.query(`ALTER TABLE warehouses.inventory ADD COLUMN IF NOT EXISTS buying_price NUMERIC(12,2) DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE warehouses.inventory ADD COLUMN IF NOT EXISTS discount NUMERIC(5,2) DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE warehouses.inventory ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}'`).catch(() => {});
  await pool.query(`ALTER TABLE warehouses.b2b_order_items ADD COLUMN IF NOT EXISTS is_gift BOOLEAN DEFAULT false`).catch(() => {});
  await pool.query(`ALTER TABLE warehouses.b2b_order_items ADD COLUMN IF NOT EXISTS discount NUMERIC(5,2) DEFAULT 0`).catch(() => {});

  // Warehouse roles middleware
  const isWarehouse = (req, res, next) => {
    const warehouseRoles = ['warehouse_owner', 'warehouse_manager', 'warehouse_staff', 'admin', 'super_admin'];
    if (!req.user || !warehouseRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { title: 'Forbidden', status: 403 } });
    }
    next();
  };

  // Helper: get or create warehouse for a user
  async function getOrCreateWarehouse(ownerId) {
    let r = await pool.query('SELECT * FROM warehouses.warehouses WHERE owner_id=$1', [ownerId]);
    if (r.rows.length === 0) {
      r = await pool.query(
        `INSERT INTO warehouses.warehouses (owner_id) VALUES ($1) RETURNING *`,
        [ownerId]
      );
    }
    return r.rows[0];
  }

  // Ensure inventory schema and pharmacy_stock table exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.pharmacy_stock (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pharmacy_id UUID NOT NULL,
      drug_id UUID NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      reserved_qty INTEGER NOT NULL DEFAULT 0,
      selling_price NUMERIC(12,2) DEFAULT 0,
      buying_price NUMERIC(12,2) DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'IQD',
      reorder_level INTEGER DEFAULT 10,
      expiry_date DATE,
      origin_country TEXT,
      category TEXT,
      batch_number TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  // Create products schema and drugs table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.drugs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      generic_name TEXT NOT NULL,
      brand_name TEXT,
      dosage_form TEXT,
      strength TEXT,
      requires_prescription BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  // Seed common drugs if table is empty
  const { rows: drugCount } = await pool.query('SELECT COUNT(*) FROM public.drugs').catch(() => ({ rows: [{ count: '1' }] }));
  if (drugCount[0]?.count === '0') {
    await pool.query(`
      INSERT INTO public.drugs (generic_name, brand_name, dosage_form, strength, requires_prescription) VALUES
      ('باراسيتامول', 'بنادول', 'أقراص', '500 مغ', false),
      ('باراسيتامول', 'تايلينول', 'أقراص', '500 مغ', false),
      ('أيبوبروفين', 'بروفين', 'أقراص', '400 مغ', false),
      ('أيبوبروفين', 'ادفيل', 'أقراص', '200 مغ', false),
      ('أموكسيسيلين', 'أموكسيل', 'كبسولات', '500 مغ', true),
      ('أموكسيسيلين', 'فليموكسين', 'أقراص', '1 غ', true),
      ('أزيثروميسين', 'زيثروماكس', 'أقراص', '500 مغ', true),
      ('ميتفورمين', 'غلوكوفاج', 'أقراص', '500 مغ', true),
      ('ميتفورمين', 'غلوكوفاج', 'أقراص', '1000 مغ', true),
      ('أتورفاستاتين', 'ليبيتور', 'أقراص', '20 مغ', true),
      ('أتورفاستاتين', 'ليبيتور', 'أقراص', '40 مغ', true),
      ('أومبرازول', 'لوسك', 'كبسولات', '20 مغ', false),
      ('بانتوبرازول', 'بانتولوك', 'أقراص', '40 مغ', true),
      ('لوراتادين', 'كلاريتين', 'أقراص', '10 مغ', false),
      ('سيتيريزين', 'زيرتك', 'أقراص', '10 مغ', false),
      ('ديكسامثازون', 'ديكسامثازون', 'أقراص', '4 مغ', true),
      ('بريدنيزولون', 'بريدنيزولون', 'أقراص', '5 مغ', true),
      ('ميترونيدازول', 'فلاجيل', 'أقراص', '500 مغ', true),
      ('سيبروفلوكساسين', 'سيبروباي', 'أقراص', '500 مغ', true),
      ('إنالابريل', 'ريناتك', 'أقراص', '10 مغ', true),
      ('أملوديبين', 'نورفاسك', 'أقراص', '5 مغ', true),
      ('ليفوثيروكسين', 'إلتروكسين', 'أقراص', '50 مكغ', true),
      ('فيتامين D3', 'فيتامين D3', 'كبسولات', '1000 وحدة', false),
      ('فيتامين C', 'سيفيت', 'أقراص فوارة', '1000 مغ', false),
      ('أسبرين', 'أسبرين', 'أقراص', '100 مغ', false),
      ('كلوبيدوغريل', 'بلافيكس', 'أقراص', '75 مغ', true),
      ('راميبريل', 'تريتيس', 'كبسولات', '5 مغ', true),
      ('ميلوكسيكام', 'موبيك', 'أقراص', '15 مغ', true),
      ('ديكلوفيناك', 'فولتارين', 'أقراص', '50 مغ', true),
      ('غابابنتين', 'نيورونتين', 'كبسولات', '300 مغ', true),
      ('سيرترالين', 'زولوفت', 'أقراص', '50 مغ', true),
      ('كلاريثروميسين', 'كلاريسيد', 'أقراص', '500 مغ', true),
      ('فيتامين B12', 'نيوروبيون', 'أقراص', '200 مكغ', false),
      ('حديد', 'فيروغراديوميت', 'أقراص', '105 مغ', false),
      ('كالسيوم + D3', 'كالسيوم سانودوز', 'أقراص فوارة', '500 مغ', false),
      ('ميزوبروستول', 'سايتوتيك', 'أقراص', '200 مكغ', true),
      ('بيسوبرولول', 'كونكور', 'أقراص', '5 مغ', true),
      ('فاموتيدين', 'بيبسيد', 'أقراص', '40 مغ', false),
      ('ترامادول', 'ترامال', 'كبسولات', '50 مغ', true)
    `).catch(() => {});
  }

  const app = express();
  app.use(helmet());
  const ALLOWED_ORIGINS = new Set([
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002',
    'http://localhost:3003', 'http://localhost:3004',
  ]);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true);
      if (/^https:\/\/[a-z0-9-]+(\.up)?\.railway\.app$/.test(origin)) return cb(null, true);
      cb(new Error('CORS: origin not allowed'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(traceIdMiddleware);
  app.use(requestLogger);

  const router = express.Router();

  // ── Warehouse: get my warehouse info ─────────────────────────────────────
  app.get('/api/v1/warehouses/me', authenticate, isWarehouse, async (req, res, next) => {
    try {
      const wh = await getOrCreateWarehouse(req.user.sub);
      res.json({ success: true, data: wh });
    } catch (err) { next(err); }
  });

  app.patch('/api/v1/warehouses/me', authenticate, isWarehouse, async (req, res, next) => {
    try {
      const { name, name_ar, address, city, phone } = req.body;
      const wh = await getOrCreateWarehouse(req.user.sub);
      const r = await pool.query(
        `UPDATE warehouses.warehouses SET
          name=COALESCE($1,name), name_ar=COALESCE($2,name_ar),
          address=COALESCE($3,address), city=COALESCE($4,city),
          phone=COALESCE($5,phone), updated_at=NOW()
         WHERE id=$6 RETURNING *`,
        [name, name_ar, address, city, phone, wh.id]
      );
      res.json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  // ── Warehouse: inventory ──────────────────────────────────────────────────
  app.get('/api/v1/warehouses/:warehouseId/inventory', authenticate, isWarehouse, async (req, res, next) => {
    try {
      const r = await pool.query(`
        SELECT *,
          CASE
            WHEN quantity = 0 THEN 'out'
            WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring'
            WHEN quantity < reorder_level THEN 'low'
            ELSE 'good'
          END AS status
        FROM warehouses.inventory
        WHERE warehouse_id=$1
        ORDER BY created_at DESC
      `, [req.params.warehouseId]);
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  app.post('/api/v1/warehouses/:warehouseId/inventory', authenticate, isWarehouse, async (req, res, next) => {
    try {
      const { name, name_ar, batch_number, quantity, reorder_level, unit_price, buying_price, discount, expiry_date, extra_data } = req.body;
      if (!name) return res.status(422).json({ success: false, error: { title: 'name required' } });
      const r = await pool.query(
        `INSERT INTO warehouses.inventory
          (warehouse_id, name, name_ar, batch_number, quantity, reorder_level, unit_price, buying_price, discount, expiry_date, extra_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *,
          CASE WHEN quantity=0 THEN 'out'
               WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE+INTERVAL '30 days' THEN 'expiring'
               WHEN quantity<reorder_level THEN 'low' ELSE 'good' END AS status`,
        [req.params.warehouseId, name, name_ar||name, batch_number||null,
         quantity||0, reorder_level||100, unit_price||0, buying_price||0, discount||0,
         expiry_date||null, extra_data ? JSON.stringify(extra_data) : '{}']
      );
      res.status(201).json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  app.patch('/api/v1/warehouses/:warehouseId/inventory/:stockId', authenticate, isWarehouse, async (req, res, next) => {
    try {
      const { name, name_ar, batch_number, quantity, reorder_level, unit_price, buying_price, discount, expiry_date, extra_data } = req.body;
      const r = await pool.query(`
        UPDATE warehouses.inventory SET
          name=COALESCE($1,name), name_ar=COALESCE($2,name_ar),
          batch_number=COALESCE($3,batch_number), quantity=COALESCE($4,quantity),
          reorder_level=COALESCE($5,reorder_level), unit_price=COALESCE($6,unit_price),
          buying_price=COALESCE($7,buying_price), discount=COALESCE($8,discount),
          expiry_date=COALESCE($9,expiry_date),
          extra_data=COALESCE($10::jsonb, extra_data), updated_at=NOW()
        WHERE id=$11 AND warehouse_id=$12
        RETURNING *,
          CASE WHEN quantity=0 THEN 'out'
               WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE+INTERVAL '30 days' THEN 'expiring'
               WHEN quantity<reorder_level THEN 'low' ELSE 'good' END AS status
      `, [name, name_ar, batch_number, quantity, reorder_level, unit_price, buying_price, discount,
          expiry_date, extra_data ? JSON.stringify(extra_data) : null,
          req.params.stockId, req.params.warehouseId]);
      if (!r.rows.length) return res.status(404).json({ success: false });
      res.json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  app.delete('/api/v1/warehouses/:warehouseId/inventory/:stockId', authenticate, isWarehouse, async (req, res, next) => {
    try {
      await pool.query('DELETE FROM warehouses.inventory WHERE id=$1 AND warehouse_id=$2',
        [req.params.stockId, req.params.warehouseId]);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  // ── Warehouse: B2B orders ─────────────────────────────────────────────────
  app.get('/api/v1/warehouses/:warehouseId/b2b-orders', authenticate, isWarehouse, async (req, res, next) => {
    try {
      const orders = await pool.query(`
        SELECT o.*,
          COALESCE(json_agg(json_build_object(
            'id', i.id, 'name', i.name, 'quantity', i.quantity, 'unit_price', i.unit_price
          )) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
        FROM warehouses.b2b_orders o
        LEFT JOIN warehouses.b2b_order_items i ON i.order_id = o.id
        WHERE o.warehouse_id=$1
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `, [req.params.warehouseId]);
      res.json({ success: true, data: orders.rows });
    } catch (err) { next(err); }
  });

  app.patch('/api/v1/warehouses/b2b-orders/:orderId/status', authenticate, isWarehouse, async (req, res, next) => {
    try {
      const { status } = req.body;
      const allowed = ['confirmed', 'dispatched', 'delivered', 'cancelled'];
      if (!allowed.includes(status)) return res.status(422).json({ success: false, error: { title: 'Invalid status' } });
      const r = await pool.query(
        `UPDATE warehouses.b2b_orders SET status=$1, updated_at=NOW() WHERE id=$2
         RETURNING *, (SELECT name FROM warehouses.warehouses WHERE id=warehouse_id) AS warehouse_name`,
        [status, req.params.orderId]
      );
      if (!r.rows.length) return res.status(404).json({ success: false });
      const ord = r.rows[0];

      // Notify pharmacy on key status changes (use owner_id so notification reaches pharmacy user)
      if ((status === 'confirmed' || status === 'dispatched' || status === 'delivered') && ord.pharmacy_id) {
        try {
          const msgs = {
            confirmed:  `📦 تم تأكيد طلبك\nالمستودع: ${ord.warehouse_name}\nجارٍ التحضير والشحن.\n[order_id:${ord.id}]`,
            dispatched: `🚚 طلبك في الطريق\nالمستودع: ${ord.warehouse_name}\nتم الإرسال، يرجى الاستعداد للاستلام.\n[order_id:${ord.id}]`,
            delivered:  `✅ تم تسليم طلبك\nالمستودع: ${ord.warehouse_name}\nالإجمالي: ${Number(ord.total).toLocaleString()} د.ع\n\nيمكنك الآن مراجعة الأصناف وقبولها في المخزون من قسم "طلبيات معلقة".\n[order_id:${ord.id}][warehouse_name:${ord.warehouse_name}]`,
          };
          const phRow = await pool.query(`SELECT owner_id FROM pharmacies.pharmacies WHERE id=$1`, [ord.pharmacy_id]);
          const recipientId = phRow.rows[0]?.owner_id || ord.pharmacy_id;
          await pool.query(
            `INSERT INTO public.portal_notifications (portal_type, recipient_id, sender_name, message)
             VALUES ($1,$2,$3,$4)`,
            ['pharmacy', recipientId, ord.warehouse_name, msgs[status]]
          );
        } catch (_) {}
      }

      res.json({ success: true, data: ord });
    } catch (err) { next(err); }
  });

  // ── Public: warehouse catalog (pharmacies browse) ─────────────────────────
  // Pharmacy sees: discount % + net_price — NOT buying_price or original unit_price
  app.get('/api/v1/warehouses/catalog', authenticate, async (req, res, next) => {
    try {
      const r = await pool.query(`
        SELECT i.id, i.warehouse_id, i.name, i.name_ar, i.batch_number, i.quantity,
          i.reorder_level, i.expiry_date, i.extra_data,
          COALESCE(i.discount, 0) AS discount,
          ROUND(i.unit_price * (1 - COALESCE(i.discount,0)/100), 2) AS net_price,
          CASE WHEN i.quantity=0 THEN 'out'
               WHEN i.expiry_date IS NOT NULL AND i.expiry_date < CURRENT_DATE+INTERVAL '30 days' THEN 'expiring'
               WHEN i.quantity<i.reorder_level THEN 'low' ELSE 'good' END AS status,
          w.name AS warehouse_name, w.city AS warehouse_city
        FROM warehouses.inventory i
        JOIN warehouses.warehouses w ON w.id=i.warehouse_id AND w.status='active'
        WHERE i.quantity > 0
        ORDER BY i.name
      `);
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  // Search for pharmacy — same field filtering as catalog
  app.get('/api/v1/warehouses/drugs/search', async (req, res, next) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q || q.length < 2) return res.json({ success: true, data: [] });
      const r = await pool.query(`
        SELECT i.id, i.name, i.name_ar, i.batch_number, i.quantity, i.expiry_date, i.extra_data,
          ROUND(i.unit_price * (1 - COALESCE(i.discount,0)/100), 2) AS net_price,
          w.id AS warehouse_id, w.name AS warehouse_name, w.city AS warehouse_city, w.phone AS warehouse_phone
        FROM warehouses.inventory i
        JOIN warehouses.warehouses w ON w.id = i.warehouse_id AND w.status = 'active'
        WHERE i.quantity > 0
          AND (i.name ILIKE $1 OR i.name_ar ILIKE $1)
        ORDER BY i.name
        LIMIT 20
      `, [`%${q}%`]);
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  // Warehouse: bulk import inventory items from CSV/Excel upload
  app.post('/api/v1/warehouses/:warehouseId/inventory/bulk', authenticate, isWarehouse, async (req, res, next) => {
    try {
      const { items } = req.body; // array of inventory objects
      if (!Array.isArray(items) || !items.length) {
        return res.status(422).json({ success: false, error: { title: 'items array required' } });
      }
      const inserted = [];
      for (const it of items) {
        if (!it.name) continue;
        const r = await pool.query(
          `INSERT INTO warehouses.inventory
            (warehouse_id, name, name_ar, batch_number, quantity, reorder_level, unit_price, buying_price, discount, expiry_date, extra_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, name`,
          [req.params.warehouseId, it.name, it.name_ar||it.name, it.batch_number||null,
           it.quantity||0, it.reorder_level||100, it.unit_price||0, it.buying_price||0, it.discount||0,
           it.expiry_date||null, it.extra_data ? JSON.stringify(it.extra_data) : '{}']
        );
        inserted.push(r.rows[0]);
      }
      res.status(201).json({ success: true, data: inserted, count: inserted.length });
    } catch (err) { next(err); }
  });

  // ── Pharmacy: place B2B order — total uses net_price (after warehouse discount) ──
  app.post('/api/v1/warehouses/b2b-orders', authenticate, async (req, res, next) => {
    try {
      const { warehouse_id, pharmacy_id, pharmacy_name, items, notes } = req.body;
      if (!warehouse_id || !items?.length) {
        return res.status(422).json({ success: false, error: { title: 'warehouse_id and items required' } });
      }
      // net_price = unit_price * (1 - discount/100), pre-computed by client or computed here
      const total = items.reduce((sum, it) => {
        const net = it.net_price ?? (it.unit_price * (1 - (it.discount || 0) / 100));
        return sum + it.quantity * net;
      }, 0);
      const order = await pool.query(
        `INSERT INTO warehouses.b2b_orders (warehouse_id, pharmacy_id, pharmacy_name, total, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [warehouse_id, pharmacy_id || req.user.sub, pharmacy_name || 'صيدلية', total, notes || null]
      );
      const orderId = order.rows[0].id;
      for (const it of items) {
        const net = it.net_price ?? (it.unit_price * (1 - (it.discount || 0) / 100));
        await pool.query(
          `INSERT INTO warehouses.b2b_order_items (order_id, inventory_id, name, quantity, unit_price, discount, is_gift)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [orderId, it.inventory_id || null, it.name, it.quantity, net, it.discount || 0, false]
        );
      }

      // Notify the warehouse owner about the new order
      try {
        const whRow = await pool.query(
          'SELECT owner_id, name FROM warehouses.warehouses WHERE id=$1', [warehouse_id]
        );
        if (whRow.rows.length) {
          const summary = items.slice(0, 3).map(it => `• ${it.name} (${it.quantity})`).join('\n');
          const extra   = items.length > 3 ? `\n... و ${items.length - 3} أصناف أخرى` : '';
          await pool.query(
            `INSERT INTO public.portal_notifications (portal_type, recipient_id, sender_name, message)
             VALUES ($1,$2,$3,$4)`,
            ['warehouse', whRow.rows[0].owner_id, pharmacy_name || 'صيدلية',
             `🛒 طلب B2B جديد\nالصيدلية: ${pharmacy_name || 'صيدلية'}\nعدد الأصناف: ${items.length}\nالإجمالي: ${total.toLocaleString()} د.ع\n\n${summary}${extra}\n[order_id:${orderId}]`]
          );
        }
      } catch (_) {}

      res.status(201).json({ success: true, data: order.rows[0] });
    } catch (err) { next(err); }
  });

  // ── Pharmacy: list active warehouses ─────────────────────────────────────
  app.get('/api/v1/warehouses/list', authenticate, async (req, res, next) => {
    try {
      const r = await pool.query(`
        SELECT w.id, w.owner_id, w.name, w.name_ar, w.city, w.phone, w.address,
          COUNT(DISTINCT i.id)::int AS drug_count
        FROM warehouses.warehouses w
        LEFT JOIN warehouses.inventory i ON i.warehouse_id = w.id AND i.quantity > 0
        WHERE w.status = 'active'
        GROUP BY w.id ORDER BY w.name
      `);
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  // ── Pharmacy: view my own B2B orders — includes gift flag ────────────────
  app.get('/api/v1/warehouses/my-b2b-orders', authenticate, async (req, res, next) => {
    try {
      const orders = await pool.query(`
        SELECT o.*, w.id AS warehouse_db_id, w.name AS warehouse_name,
          COALESCE(json_agg(json_build_object(
            'id', i.id, 'name', i.name, 'quantity', i.quantity,
            'unit_price', i.unit_price, 'discount', i.discount, 'is_gift', i.is_gift
          )) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
        FROM warehouses.b2b_orders o
        JOIN warehouses.warehouses w ON w.id = o.warehouse_id
        LEFT JOIN warehouses.b2b_order_items i ON i.order_id = o.id
        WHERE o.pharmacy_id = $1
        GROUP BY o.id, w.id, w.name ORDER BY o.created_at DESC
      `, [req.user.sub]);
      res.json({ success: true, data: orders.rows });
    } catch (err) { next(err); }
  });

  // ── Warehouse: add gift items to an existing order (before/during dispatch) ──
  app.post('/api/v1/warehouses/b2b-orders/:orderId/gift-items', authenticate, isWarehouse, async (req, res, next) => {
    try {
      const { items } = req.body; // [{ name, quantity }]
      if (!Array.isArray(items) || !items.length) {
        return res.status(422).json({ success: false, error: { title: 'items required' } });
      }
      const ord = await pool.query('SELECT * FROM warehouses.b2b_orders WHERE id=$1', [req.params.orderId]);
      if (!ord.rows.length) return res.status(404).json({ success: false });
      const inserted = [];
      for (const it of items) {
        if (!it.name || !it.quantity) continue;
        const r = await pool.query(
          `INSERT INTO warehouses.b2b_order_items (order_id, name, quantity, unit_price, discount, is_gift)
           VALUES ($1,$2,$3,0,0,true) RETURNING *`,
          [req.params.orderId, it.name, it.quantity]
        );
        inserted.push(r.rows[0]);
      }
      res.status(201).json({ success: true, data: inserted });
    } catch (err) { next(err); }
  });

  // ── Pharmacy: submit return/damage report for an order item ──────────────
  app.post('/api/v1/warehouses/b2b-orders/:orderId/return-report', authenticate, async (req, res, next) => {
    try {
      const { item_name, report_type, actual_qty, notes, image_base64 } = req.body;
      // report_type: 'broken' | 'not_received' | 'mismatch'
      const ord = await pool.query(
        `SELECT o.*, w.owner_id, w.name AS warehouse_name
         FROM warehouses.b2b_orders o
         JOIN warehouses.warehouses w ON w.id = o.warehouse_id
         WHERE o.id=$1`, [req.params.orderId]
      );
      if (!ord.rows.length) return res.status(404).json({ success: false });
      const o = ord.rows[0];
      const typeLabel = { broken: '📷 مكسور', not_received: '📦 لم يُستلم', mismatch: '🔢 كمية مختلفة' }[report_type] || '⚠️ بلاغ';
      const msg = [
        `${typeLabel}: ${item_name}`,
        `الطلبية: ${req.params.orderId}`,
        report_type === 'mismatch' ? `الكمية المستلمة: ${actual_qty}` : '',
        notes ? `ملاحظة: ${notes}` : '',
        image_base64 ? '[صورة مرفقة]' : '',
      ].filter(Boolean).join('\n');
      if (o.owner_id) {
        await pool.query(
          `INSERT INTO public.portal_notifications (portal_type, recipient_id, sender_name, message)
           VALUES ('warehouse',$1,$2,$3)`,
          [o.owner_id, o.pharmacy_name || 'صيدلية', msg]
        ).catch(() => {});
      }
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ── Admin: list all warehouses ────────────────────────────────────────────
  app.get('/api/v1/warehouses', authenticate, isAdmin, async (req, res, next) => {
    try {
      const r = await pool.query(`
        SELECT w.*,
          COUNT(DISTINCT i.id) AS inventory_count,
          COUNT(DISTINCT o.id) AS order_count
        FROM warehouses.warehouses w
        LEFT JOIN warehouses.inventory i ON i.warehouse_id=w.id
        LEFT JOIN warehouses.b2b_orders o ON o.warehouse_id=w.id
        GROUP BY w.id ORDER BY w.created_at DESC
      `);
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  // ─── PLATFORM SETTINGS ────────────────────────────────────────────────
  router.get('/settings', async (_req, res, next) => {
    try {
      const result = await pool.query('SELECT key, value FROM public.platform_settings');
      const settings = {};
      result.rows.forEach(r => { settings[r.key] = r.value === 'true'; });
      res.json({ success: true, data: settings });
    } catch (err) { next(err); }
  });

  router.patch('/settings', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { ...body } = req.body;
      const allowed = ['require_certificate', 'log_admin_actions'];
      for (const [key, value] of Object.entries(body)) {
        if (!allowed.includes(key)) continue;
        await pool.query(
          'INSERT INTO public.platform_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
          [key, String(value)]
        );
      }
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ─── REGISTER FULL ────────────────────────────────────────────────────
  router.post('/register-full', async (req, res, next) => {
    const client = await pool.connect();
    try {
      const b = req.body;
      const settingRow = await client.query("SELECT value FROM public.platform_settings WHERE key='require_certificate'");
      const requireCert = settingRow.rows[0]?.value === 'true';
      if (requireCert && !b.certificateData) {
        return res.status(422).json({ success: false, error: { title: 'يجب رفع شهادة التسجيل', status: 422 } });
      }
      await client.query('BEGIN');

      // Only reject duplicates on certificate number and certificate holder name
      if (b.licenseNumber?.trim()) {
        const dupLicense = await client.query(
          "SELECT id FROM pharmacies.pharmacies WHERE license_number=$1 AND status != 'deleted'",
          [b.licenseNumber.trim()]
        );
        if (dupLicense.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, error: { title: 'رقم الشهادة مسجّل مسبقاً في المنصة', status: 409 } });
        }
      }
      // Note: license_holder_name is NOT unique — same person can own multiple pharmacies
      const AUTH_URL = process.env.AUTH_SERVICE_URL || 'https://mediflowauth-service-production.up.railway.app';
      const authRes = await fetch(`${AUTH_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: b.firstName, lastName: b.lastName || b.firstName,
          email: b.email, phone: b.phone, password: b.password, role: 'pharmacy_owner',
        }),
      });
      const authData = await authRes.json();
      let userId;
      if (!authRes.ok) {
        if (authRes.status === 409) {
          const existing = await client.query('SELECT id FROM auth.users WHERE email=$1', [b.email]);
          if (!existing.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, error: { title: 'البريد الإلكتروني مسجل مسبقاً — تأكد من كلمة المرور الصحيحة', status: 409 } });
          }
          userId = existing.rows[0].id;
        } else {
          await client.query('ROLLBACK');
          return res.status(authRes.status).json({ success: false, error: authData?.error || { title: 'فشل إنشاء الحساب' } });
        }
      } else {
        userId = authData.data?.userId;
      }
      // Ensure license_holder_name column exists
      await client.query(`ALTER TABLE pharmacies.pharmacies ADD COLUMN IF NOT EXISTS license_holder_name TEXT`).catch(() => {});

      const phRes = await client.query(`
        INSERT INTO pharmacies.pharmacies
          (owner_id, name, name_ar, license_number, license_holder_name, license_expiry, phone, address, city, country, certificate_data)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING id, name, status
      `, [userId, b.name || b.nameAr, b.nameAr || b.name, b.licenseNumber?.trim(),
          b.licenseHolderName?.trim() || null, b.licenseExpiry,
          b.pharmacyPhone?.trim() || b.phone, b.address?.trim(), b.city?.trim(), b.country || 'IQ', b.certificateData || null]);
      if (b.certificateData) {
        await client.query('INSERT INTO public.registration_certificates (user_id, certificate_data, entity_type) VALUES ($1,$2,$3)',
          [userId, b.certificateData, 'pharmacy']);
      }
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: phRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally { client.release(); }
  });

  // ─── ADMIN ENDPOINTS ──────────────────────────────────────────────────
  router.get('/active', async (_req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT id, owner_id, name, name_ar, phone, city, address, status, is_online
        FROM pharmacies.pharmacies
        WHERE status = 'active'
        ORDER BY is_online DESC, name_ar ASC
      `);
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  router.get('/admin/all', authenticate, isAdmin, async (_req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT p.id, p.owner_id, p.name, p.name_ar, p.license_number,
               p.license_expiry, p.phone, p.address, p.city, p.country, p.status,
               p.rating, p.latitude, p.longitude, p.created_at, p.updated_at,
               u.email as owner_email, u.phone as owner_phone
        FROM pharmacies.pharmacies p
        LEFT JOIN auth.users u ON u.id = p.owner_id
        WHERE p.status != 'deleted'
        ORDER BY p.created_at DESC
      `);
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  router.patch('/admin/:id/status', authenticate, isAdmin, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { status } = req.body;
      const allowed = ['active', 'suspended', 'rejected', 'pending_verification', 'deleted'];
      if (!allowed.includes(status))
        return res.status(400).json({ success: false, error: { title: 'Invalid status' } });
      await client.query('BEGIN');
      await client.query('UPDATE pharmacies.pharmacies SET status=$1, updated_at=NOW() WHERE id=$2', [status, id]);
      const userStatus = status === 'active' ? 'active' : status === 'suspended' ? 'suspended'
        : status === 'rejected' ? 'rejected' : 'pending_verification';
      await client.query(`UPDATE auth.users SET status=$1, updated_at=NOW()
        WHERE id = (SELECT owner_id FROM pharmacies.pharmacies WHERE id=$2)`, [userStatus, id]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally { client.release(); }
  });

  router.delete('/admin/:id', authenticate, isAdmin, async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE pharmacies.pharmacies SET status='deleted', deleted_at=NOW() WHERE id=$1", [req.params.id]);
      await client.query(`UPDATE auth.users SET status='deleted', deleted_at=NOW() WHERE id=(SELECT owner_id FROM pharmacies.pharmacies WHERE id=$1)`, [req.params.id]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally { client.release(); }
  });

  router.post('/admin/:id/delete', authenticate, isAdmin, async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE pharmacies.pharmacies SET status='deleted', deleted_at=NOW() WHERE id=$1", [req.params.id]);
      await client.query(`UPDATE auth.users SET status='deleted', deleted_at=NOW() WHERE id=(SELECT owner_id FROM pharmacies.pharmacies WHERE id=$1)`, [req.params.id]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally { client.release(); }
  });

  // ─── PHARMACY MY PROFILE ──────────────────────────────────────────────
  router.get('/my', authenticate, async (req, res, next) => {
    try {
      const r = await pool.query(
        'SELECT id, name, name_ar, status FROM pharmacies.pharmacies WHERE owner_id=$1',
        [req.user?.sub || req.user?.userId]
      );
      if (!r.rows.length) return res.status(404).json({ success: false, error: { title: 'الصيدلية غير موجودة' } });
      res.json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  // Pharmacy sets itself online/offline (login=active, logout=inactive).
  // This is a presence toggle only — it must never touch the `status` approval column,
  // or a pharmacy that logs out gets rejected as "not active" on its next login.
  router.patch('/:id/status', authenticate, async (req, res, next) => {
    try {
      const { status } = req.body;
      const allowed = ['active', 'inactive'];
      if (!allowed.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
      await pool.query(
        `UPDATE pharmacies.pharmacies SET is_online=$1, updated_at=NOW() WHERE id=$2 AND (owner_id=$3 OR id IN (SELECT pharmacy_id FROM public.pharmacy_staff WHERE user_id=$3))`,
        [status === 'active', req.params.id, req.user.sub]
      );
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  router.get('/my/settings', authenticate, async (req, res, next) => {
    try {
      await pool.query(`ALTER TABLE pharmacies.pharmacies ADD COLUMN IF NOT EXISTS opening_hours TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE pharmacies.pharmacies ADD COLUMN IF NOT EXISTS province TEXT`).catch(() => {});
      const r = await pool.query(
        'SELECT delivery_rate_per_km, delivery_min_fee, delivery_max_km, latitude, longitude, address, opening_hours, province FROM pharmacies.pharmacies WHERE owner_id=$1',
        [req.user.sub]
      );
      res.json({ success: true, data: r.rows[0] || {} });
    } catch (err) { next(err); }
  });

  router.patch('/my/settings', authenticate, async (req, res, next) => {
    try {
      await pool.query(`ALTER TABLE pharmacies.pharmacies ADD COLUMN IF NOT EXISTS opening_hours TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE pharmacies.pharmacies ADD COLUMN IF NOT EXISTS province TEXT`).catch(() => {});
      const b = req.body;
      await pool.query(`
        UPDATE pharmacies.pharmacies SET
          delivery_rate_per_km = COALESCE($1::int, delivery_rate_per_km),
          delivery_min_fee     = COALESCE($2::int, delivery_min_fee),
          delivery_max_km      = COALESCE($3::int, delivery_max_km),
          latitude             = COALESCE($4::float, latitude),
          longitude            = COALESCE($5::float, longitude),
          address              = COALESCE($6, address),
          opening_hours        = COALESCE($7, opening_hours),
          updated_at           = NOW()
        WHERE owner_id = $8
      `, [
        b.delivery_rate_per_km ?? null,
        b.delivery_min_fee     ?? null,
        b.delivery_max_km      ?? null,
        b.latitude             ?? null,
        b.longitude            ?? null,
        b.address              ?? null,
        b.opening_hours        ?? null,
        req.user.sub,
      ]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ─── DRUG CATALOG SEARCH ──────────────────────────────────────────────
  router.get('/drugs/search', async (req, res, next) => {
    try {
      // Ensure schema/table exist (swallow errors — bootstrap handles this idempotently)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.drugs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          generic_name TEXT NOT NULL,
          brand_name TEXT,
          barcode TEXT,
          dosage_form TEXT,
          strength TEXT,
          requires_prescription BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `).catch(() => {});
      await pool.query(`ALTER TABLE public.drugs ADD COLUMN IF NOT EXISTS barcode TEXT`).catch(() => {});
      const { rows: cnt } = await pool.query('SELECT COUNT(*) FROM public.drugs').catch(() => ({ rows: [{ count: '1' }] }));
      if (cnt[0]?.count === '0') {
        await pool.query(`
          INSERT INTO public.drugs (generic_name, brand_name, dosage_form, strength, requires_prescription) VALUES
          ('باراسيتامول', 'بنادول', 'أقراص', '500 مغ', false),
          ('باراسيتامول', 'تايلينول', 'أقراص', '500 مغ', false),
          ('أيبوبروفين', 'بروفين', 'أقراص', '400 مغ', false),
          ('أيبوبروفين', 'ادفيل', 'أقراص', '200 مغ', false),
          ('أموكسيسيلين', 'أموكسيل', 'كبسولات', '500 مغ', true),
          ('أموكسيسيلين', 'فليموكسين', 'أقراص', '1 غ', true),
          ('أزيثروميسين', 'زيثروماكس', 'أقراص', '500 مغ', true),
          ('ميتفورمين', 'غلوكوفاج', 'أقراص', '500 مغ', true),
          ('ميتفورمين', 'غلوكوفاج', 'أقراص', '1000 مغ', true),
          ('أتورفاستاتين', 'ليبيتور', 'أقراص', '20 مغ', true),
          ('أتورفاستاتين', 'ليبيتور', 'أقراص', '40 مغ', true),
          ('أومبرازول', 'لوسك', 'كبسولات', '20 مغ', false),
          ('بانتوبرازول', 'بانتولوك', 'أقراص', '40 مغ', true),
          ('لوراتادين', 'كلاريتين', 'أقراص', '10 مغ', false),
          ('سيتيريزين', 'زيرتك', 'أقراص', '10 مغ', false),
          ('ديكسامثازون', 'ديكسامثازون', 'أقراص', '4 مغ', true),
          ('بريدنيزولون', 'بريدنيزولون', 'أقراص', '5 مغ', true),
          ('ميترونيدازول', 'فلاجيل', 'أقراص', '500 مغ', true),
          ('سيبروفلوكساسين', 'سيبروباي', 'أقراص', '500 مغ', true),
          ('إنالابريل', 'ريناتك', 'أقراص', '10 مغ', true),
          ('أملوديبين', 'نورفاسك', 'أقراص', '5 مغ', true),
          ('ليفوثيروكسين', 'إلتروكسين', 'أقراص', '50 مكغ', true),
          ('فيتامين D3', 'فيتامين D3', 'كبسولات', '1000 وحدة', false),
          ('فيتامين C', 'سيفيت', 'أقراص فوارة', '1000 مغ', false),
          ('أسبرين', 'أسبرين', 'أقراص', '100 مغ', false),
          ('كلوبيدوغريل', 'بلافيكس', 'أقراص', '75 مغ', true),
          ('راميبريل', 'تريتيس', 'كبسولات', '5 مغ', true),
          ('ميلوكسيكام', 'موبيك', 'أقراص', '15 مغ', true),
          ('ديكلوفيناك', 'فولتارين', 'أقراص', '50 مغ', true),
          ('غابابنتين', 'نيورونتين', 'كبسولات', '300 مغ', true),
          ('سيرترالين', 'زولوفت', 'أقراص', '50 مغ', true),
          ('كلاريثروميسين', 'كلاريسيد', 'أقراص', '500 مغ', true),
          ('فيتامين B12', 'نيوروبيون', 'أقراص', '200 مكغ', false),
          ('حديد', 'فيروغراديوميت', 'أقراص', '105 مغ', false),
          ('كالسيوم + D3', 'كالسيوم سانودوز', 'أقراص فوارة', '500 مغ', false),
          ('بيسوبرولول', 'كونكور', 'أقراص', '5 مغ', true),
          ('فاموتيدين', 'بيبسيد', 'أقراص', '40 مغ', false),
          ('ترامادول', 'ترامال', 'كبسولات', '50 مغ', true),
          ('أسيكلوفير', 'زوفيراكس', 'أقراص', '400 مغ', true),
          ('فلوكونازول', 'ديفلوكان', 'كبسولات', '150 مغ', true)
        `);
      }
      const { q = '', limit = 20 } = req.query;
      const result = await pool.query(
        `SELECT id, generic_name, generic_name_en, brand_name, dosage_form, strength, requires_prescription
         FROM public.drugs
         WHERE generic_name ILIKE $1
            OR generic_name_en ILIKE $1
            OR brand_name ILIKE $1
         ORDER BY
           CASE WHEN generic_name ILIKE $1 THEN 0
                WHEN brand_name ILIKE $1 THEN 1
                ELSE 2 END,
           generic_name
         LIMIT $2`,
        [`%${q}%`, Number(limit)]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  // ─── UNIFIED SMART SEARCH (drugs + pharmacies) ────────────────────────
  router.get('/search', async (req, res, next) => {
    try {
      const { q = '', lat, lng, radiusKm = 20 } = req.query;
      const pattern = `%${q}%`;

      // Search drugs (Arabic name, English name, brand name)
      const drugsResult = await pool.query(
        `SELECT id, generic_name, generic_name_en, brand_name, dosage_form, strength, requires_prescription,
                'drug' AS result_type
         FROM public.drugs
         WHERE generic_name ILIKE $1 OR generic_name_en ILIKE $1 OR brand_name ILIKE $1
         ORDER BY
           CASE WHEN generic_name ILIKE $1 THEN 0 WHEN brand_name ILIKE $1 THEN 1 ELSE 2 END
         LIMIT 10`,
        [pattern]
      );

      // Search pharmacies by name
      let pharmacyResult = { rows: [] };
      if (lat && lng) {
        pharmacyResult = await pool.query(
          `SELECT p.id, p.name, p.name_ar, p.phone, p.rating,
                  p.delivery_rate_per_km, p.delivery_min_fee, p.delivery_max_km,
                  (6371 * acos(LEAST(1, cos(radians($2::float)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians($3::float)) + sin(radians($2::float)) * sin(radians(p.latitude))))) AS distance_km,
                  'pharmacy' AS result_type
           FROM pharmacies.pharmacies p
           WHERE p.status = 'active'
             AND (p.name ILIKE $1 OR p.name_ar ILIKE $1)
             AND (6371 * acos(LEAST(1, cos(radians($2::float)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians($3::float)) + sin(radians($2::float)) * sin(radians(p.latitude))))) < $4::float
           ORDER BY distance_km ASC LIMIT 5`,
          [pattern, lat, lng, radiusKm]
        );
      }

      res.json({
        success: true,
        data: {
          drugs: drugsResult.rows,
          pharmacies: pharmacyResult.rows,
        }
      });
    } catch (err) { next(err); }
  });

  // ─── PUBLIC ───────────────────────────────────────────────────────────
  router.get('/nearby', async (req, res, next) => {
    try {
      const { lat, lng, radiusKm = 5, drugId } = req.query;
      const result = await pool.query(`
        SELECT DISTINCT ON (p.id)
               p.id, p.name, p.name_ar, p.phone, p.rating, p.owner_id,
               p.delivery_rate_per_km, p.delivery_min_fee, p.delivery_max_km,
               p.status, p.opening_hours,
               CASE WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL
                    THEN (6371 * acos(LEAST(1, cos(radians($1::float)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians($2::float)) + sin(radians($1::float)) * sin(radians(p.latitude)))))
                    ELSE NULL END AS distance_km,
               s.selling_price, s.quantity, s.currency
        FROM pharmacies.pharmacies p
        LEFT JOIN public.pharmacy_stock s ON s.pharmacy_id = p.id AND ($3::uuid IS NULL OR s.drug_id = $3::uuid)
        WHERE p.status = 'active'
          AND ($3::uuid IS NULL OR s.quantity > 0)
        ORDER BY p.id, distance_km ASC NULLS LAST
        LIMIT 20
      `, [lat, lng, drugId || null]);
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  // Public lookup by owner (used by pharmacy login — avoids JWT dependency)
  router.get('/by-owner/:userId', async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT * FROM pharmacies.pharmacies WHERE owner_id = $1 AND status != 'deleted' LIMIT 1`,
        [req.params.userId]
      );
      if (!result.rows.length) return res.status(404).json({ success: false });
      res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
  });

  // ─── ADMIN REQUESTS ───────────────────────────────────────────────────
  router.post('/admin-requests', authenticate, async (req, res, next) => {
    try {
      const b = req.body;
      const r = await pool.query(`
        INSERT INTO public.admin_requests
          (portal_type, requester_id, requester_name, requester_entity, action_type, employee_name, employee_email, employee_role, reason)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
      `, [b.portalType, b.requesterId, b.requesterName, b.requesterEntity,
          b.actionType, b.employeeName, b.employeeEmail, b.employeeRole, b.reason]);
      res.status(201).json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  router.get('/admin-requests', authenticate, async (req, res, next) => {
    try {
      const { requester_id, portal_type, status } = req.query;
      const conditions = [];
      const params = [];
      if (requester_id) { conditions.push(`requester_id = $${params.length + 1}`); params.push(requester_id); }
      if (portal_type)  { conditions.push(`portal_type = $${params.length + 1}`); params.push(portal_type); }
      if (status)       { conditions.push(`status = $${params.length + 1}`); params.push(status); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const r = await pool.query(`SELECT * FROM public.admin_requests ${where} ORDER BY created_at DESC`, params);
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  router.patch('/admin-requests/:id/status', authenticate, isAdmin, async (req, res, next) => {
    try {
      await pool.query('UPDATE public.admin_requests SET status=$1, decided_at=NOW() WHERE id=$2',
        [req.body.status, req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  router.patch('/admin-requests/:id', authenticate, async (req, res, next) => {
    try {
      const { requester_entity, requester_name, latitude, longitude } = req.body;
      const sets = []; const params = [];
      if (requester_entity !== undefined) { sets.push(`requester_entity=$${params.length+1}`); params.push(requester_entity); }
      if (requester_name   !== undefined) { sets.push(`requester_name=$${params.length+1}`);   params.push(requester_name); }
      if (latitude  !== undefined) { sets.push(`latitude=$${params.length+1}`);  params.push(latitude); }
      if (longitude !== undefined) { sets.push(`longitude=$${params.length+1}`); params.push(longitude); }
      if (!sets.length) return res.status(400).json({ success: false, error: 'nothing to update' });
      params.push(req.params.id);
      const r = await pool.query(`UPDATE public.admin_requests SET ${sets.join(',')} WHERE id=$${params.length} RETURNING *`, params);
      res.json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  router.delete('/admin-requests/:id', authenticate, isAdmin, async (req, res, next) => {
    try {
      await pool.query('DELETE FROM public.admin_requests WHERE id=$1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  router.delete('/admin-requests', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { status } = req.query;
      if (status) {
        await pool.query('DELETE FROM public.admin_requests WHERE status=$1', [status]);
      } else {
        await pool.query("DELETE FROM public.admin_requests WHERE status != 'pending'");
      }
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ─── PORTAL NOTIFICATIONS ─────────────────────────────────────────────
  router.post('/portal-notifications', authenticate, async (req, res, next) => {
    try {
      const b = req.body;
      // Support bulk send: portalTypes array + recipientId, or single portalType
      const types = Array.isArray(b.portalTypes) ? b.portalTypes : [b.portalType];
      const rows = [];
      for (const pt of types) {
        const r = await pool.query(`
          INSERT INTO public.portal_notifications (portal_type, recipient_id, sender_name, message)
          VALUES ($1,$2,$3,$4) RETURNING *
        `, [pt, b.recipientId, b.senderName, b.message]);
        rows.push(r.rows[0]);
      }
      res.status(201).json({ success: true, data: rows });
    } catch (err) { next(err); }
  });

  // Admin: view all sent notifications
  router.get('/portal-notifications/admin-log', authenticate, isAdmin, async (_req, res, next) => {
    try {
      const r = await pool.query(
        `SELECT * FROM public.portal_notifications ORDER BY created_at DESC LIMIT 100`
      );
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  router.get('/portal-notifications', authenticate, async (req, res, next) => {
    try {
      const { portalType, recipientId } = req.query;
      // Verify user can only read their own notifications
      if (recipientId && recipientId !== req.user?.sub) {
        return res.status(403).json({ success: false, error: { title: 'Access denied', status: 403 } });
      }
      const r = await pool.query(
        `SELECT * FROM public.portal_notifications
         WHERE portal_type=$1 AND (recipient_id=$2 OR recipient_id='broadcast')
         ORDER BY created_at DESC LIMIT 50`,
        [portalType, recipientId]
      );
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  // Mark all notifications as read for a recipient
  router.patch('/portal-notifications/read-all', authenticate, async (req, res, next) => {
    try {
      const { portalType, recipientId } = req.query;
      if (!portalType || !recipientId) return res.status(400).json({ success: false, error: 'portalType and recipientId required' });
      if (recipientId && recipientId !== req.user?.sub) {
        return res.status(403).json({ success: false, error: { title: 'Access denied', status: 403 } });
      }
      await pool.query('UPDATE public.portal_notifications SET is_read=TRUE WHERE portal_type=$1 AND recipient_id=$2', [portalType, recipientId]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // Delete all notifications for a recipient (admin only)
  router.delete('/portal-notifications/by-recipient', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { portalType, recipientId } = req.query;
      if (!portalType || !recipientId) return res.status(400).json({ success: false, error: 'portalType and recipientId required' });
      await pool.query('DELETE FROM public.portal_notifications WHERE portal_type=$1 AND recipient_id=$2', [portalType, recipientId]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  router.patch('/portal-notifications/:id/read', authenticate, async (req, res, next) => {
    try {
      await pool.query('UPDATE public.portal_notifications SET is_read=TRUE WHERE id=$1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // Admin: delete a notification by id
  router.delete('/portal-notifications/:id', authenticate, isAdmin, async (req, res, next) => {
    try {
      await pool.query('DELETE FROM public.portal_notifications WHERE id=$1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // Admin: delete all notifications by sender_name or message prefix
  router.delete('/portal-notifications', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { sender_name, message_prefix } = req.query;
      if (sender_name) {
        await pool.query('DELETE FROM public.portal_notifications WHERE sender_name=$1', [sender_name]);
      } else if (message_prefix) {
        await pool.query('DELETE FROM public.portal_notifications WHERE message LIKE $1', [`${message_prefix}%`]);
      } else {
        return res.status(400).json({ success: false, error: 'sender_name or message_prefix required' });
      }
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ─── STAFF (sub-users / pharmacist employees) ────────────────────────

  // Ensure table exists on startup
  pool.query(`
    CREATE TABLE IF NOT EXISTS pharmacy_staff (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pharmacy_id UUID NOT NULL,
      user_id UUID NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'pharmacist',
      permissions JSONB NOT NULL DEFAULT '[]',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(pharmacy_id, user_id)
    )
  `).catch(() => {});

  // Lookup which pharmacy a staff user belongs to (used by login)
  router.get('/staff/by-user/:userId', async (req, res, next) => {
    try {
      const r = await pool.query(
        `SELECT s.*, p.name AS pharmacy_name, p.name_ar AS pharmacy_name_ar, p.status AS pharmacy_status
         FROM pharmacy_staff s
         JOIN pharmacies.pharmacies p ON p.id = s.pharmacy_id
         WHERE s.user_id = $1 AND s.status = 'active' AND p.status = 'active'
         LIMIT 1`,
        [req.params.userId]
      );
      if (r.rows.length === 0) return res.status(404).json({ success: false });
      res.json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  // List staff for a pharmacy
  router.get('/:id/staff', authenticate, async (req, res, next) => {
    try {
      const r = await pool.query(
        'SELECT * FROM pharmacy_staff WHERE pharmacy_id=$1 ORDER BY created_at DESC',
        [req.params.id]
      );
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  // Add staff member
  router.post('/:id/staff', authenticate, async (req, res, next) => {
    try {
      const { userId, name, email, role, permissions } = req.body;
      const r = await pool.query(
        `INSERT INTO pharmacy_staff (pharmacy_id, user_id, name, email, role, permissions)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET name=$3, email=$4, role=$5, permissions=$6, status='active', updated_at=NOW()
         RETURNING *`,
        [req.params.id, userId, name, email, role, JSON.stringify(permissions || [])]
      );
      res.status(201).json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  // Update staff member (role, permissions, status)
  router.patch('/:id/staff/:staffId', authenticate, async (req, res, next) => {
    try {
      const { role, permissions, status } = req.body;
      const sets = []; const vals = [req.params.staffId, req.params.id];
      if (role       !== undefined) { sets.push(`role=$${vals.length+1}`);        vals.push(role); }
      if (permissions !== undefined) { sets.push(`permissions=$${vals.length+1}`); vals.push(JSON.stringify(permissions)); }
      if (status     !== undefined) { sets.push(`status=$${vals.length+1}`);      vals.push(status); }
      if (!sets.length) return res.status(400).json({ success: false });
      sets.push(`updated_at=NOW()`);
      await pool.query(
        `UPDATE pharmacy_staff SET ${sets.join(',')} WHERE id=$1 AND pharmacy_id=$2`,
        vals
      );
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // Remove staff member
  router.delete('/:id/staff/:staffId', authenticate, async (req, res, next) => {
    try {
      await pool.query('DELETE FROM pharmacy_staff WHERE id=$1 AND pharmacy_id=$2', [req.params.staffId, req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ─── HEALTH ───────────────────────────────────────────────────────────
  router.get('/health/live',  (_req, res) => res.json({ status: 'healthy' }));
  router.get('/health/ready', (_req, res) => res.json({ status: 'ready'   }));

  router.get('/:id', async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM pharmacies.pharmacies WHERE id = $1 AND status != $2', [req.params.id, 'deleted']);
      if (result.rows.length === 0) return res.status(404).json({ success: false });
      res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
  });

  // ─── PROTECTED ────────────────────────────────────────────────────────
  router.post('/register', authenticate, async (req, res, next) => {
    try {
      const body = req.body;
      const result = await pool.query(`
        INSERT INTO pharmacies.pharmacies
          (owner_id, name, name_ar, license_number, license_expiry, phone, email, address, city, country)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id, name, status
      `, [req.user.sub, body.name, body.nameAr, body.licenseNumber, body.licenseExpiry,
          body.phone, body.email, body.address, body.city, body.country || 'IQ']);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
  });

  // Public inventory for patients (no auth, hides buying_price)
  router.get('/:id/public-inventory', async (req, res, next) => {
    try {
      const { search } = req.query;
      const result = await pool.query(`
        SELECT s.id, s.pharmacy_id, s.drug_id, s.quantity, s.selling_price, s.currency,
               s.expiry_date, s.origin_country, s.category, s.reorder_level,
               d.generic_name, d.brand_name, d.barcode, d.requires_prescription
        FROM public.pharmacy_stock s
        LEFT JOIN public.drugs d ON d.id = s.drug_id
        WHERE s.pharmacy_id = $1 AND s.quantity > 0
          AND ($2::text IS NULL OR d.generic_name ILIKE $2 OR d.brand_name ILIKE $2)
        ORDER BY COALESCE(d.generic_name, '')
      `, [req.params.id, search ? `%${search}%` : null]);
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  router.get('/:id/inventory', authenticate, async (req, res, next) => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.pharmacy_stock (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          pharmacy_id UUID NOT NULL,
          drug_id UUID NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          reserved_qty INTEGER NOT NULL DEFAULT 0,
          selling_price NUMERIC(12,2) DEFAULT 0,
          currency VARCHAR(10) DEFAULT 'IQD',
          reorder_level INTEGER DEFAULT 10,
          expiry_date DATE,
          origin_country TEXT,
          category TEXT,
          batch_number TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `).catch(() => {});

      const { search, page = 1, limit = 20 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);
      const result = await pool.query(`
        SELECT s.*, d.generic_name, d.brand_name, d.barcode, d.requires_prescription
        FROM public.pharmacy_stock s
        LEFT JOIN public.drugs d ON d.id = s.drug_id
        WHERE s.pharmacy_id = $1
          AND ($2::text IS NULL OR d.generic_name ILIKE $2 OR d.brand_name ILIKE $2)
        ORDER BY COALESCE(d.generic_name, '')
        LIMIT $3 OFFSET $4
      `, [req.params.id, search ? `%${search}%` : null, limit, offset]);
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  router.post('/:id/inventory', authenticate, async (req, res, next) => {
    try {
      // Ensure schemas/tables exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.pharmacy_stock (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          pharmacy_id UUID NOT NULL,
          drug_id UUID NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          reserved_qty INTEGER NOT NULL DEFAULT 0,
          selling_price NUMERIC(12,2) DEFAULT 0,
          currency VARCHAR(10) DEFAULT 'IQD',
          reorder_level INTEGER DEFAULT 10,
          expiry_date DATE,
          origin_country TEXT,
          category TEXT,
          batch_number TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `).catch(() => {});

      const body = req.body;
      let drugId = body.drugId;

      // If no drugId, auto-create or find drug by name/barcode
      if (!drugId) {
        const genericName = body.genericName || body.drugName || 'دواء غير معرّف';
        const brandName = body.brandName || '';
        const barcode = body.barcode || null;

        await pool.query(`
          CREATE TABLE IF NOT EXISTS public.drugs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            generic_name TEXT NOT NULL,
            brand_name TEXT,
            barcode TEXT,
            dosage_form TEXT,
            strength TEXT,
            requires_prescription BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `).catch(() => {});

        // Try to find existing drug by barcode first, then name
        let existing = null;
        if (barcode) {
          const r = await pool.query('SELECT id FROM public.drugs WHERE barcode=$1 LIMIT 1', [barcode]);
          existing = r.rows[0];
        }
        if (!existing) {
          const r = await pool.query('SELECT id FROM public.drugs WHERE LOWER(generic_name)=LOWER($1) LIMIT 1', [genericName]);
          existing = r.rows[0];
        }
        if (existing) {
          drugId = existing.id;
        } else {
          const r = await pool.query(
            'INSERT INTO public.drugs (generic_name, brand_name, barcode) VALUES ($1,$2,$3) RETURNING id',
            [genericName, brandName, barcode]
          );
          drugId = r.rows[0].id;
        }
      }

      // Sanitize numeric inputs to avoid "invalid input syntax for type numeric" errors
      const qty = parseInt(body.quantity, 10) || 0;
      const price = (body.sellingPrice !== undefined && body.sellingPrice !== '' && !isNaN(Number(body.sellingPrice)))
        ? Number(body.sellingPrice) : null;
      const reorderLvl = parseInt(body.reorderLevel, 10) || 10;
      const expiryDate = body.expiryDate || null;
      const originCountry = body.originCountry || null;
      const category = body.category || null;
      const buyingPrice = (body.buyingPrice !== undefined && body.buyingPrice !== '' && !isNaN(Number(body.buyingPrice)))
        ? Number(body.buyingPrice) : null;

      // Add columns if missing (migrations)
      await pool.query(`ALTER TABLE public.pharmacy_stock ADD COLUMN IF NOT EXISTS origin_country TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE public.pharmacy_stock ADD COLUMN IF NOT EXISTS category TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE public.pharmacy_stock ADD COLUMN IF NOT EXISTS buying_price NUMERIC(12,2)`).catch(() => {});

      // Check if drug already in this pharmacy's stock
      const existing = await pool.query(
        'SELECT id, quantity FROM public.pharmacy_stock WHERE pharmacy_id=$1 AND drug_id=$2 LIMIT 1',
        [req.params.id, drugId]
      );
      let result;
      if (existing.rows.length) {
        result = await pool.query(
          'UPDATE public.pharmacy_stock SET quantity=quantity+$1, selling_price=$2, buying_price=$3, expiry_date=$4, origin_country=$5, category=$6, updated_at=NOW() WHERE id=$7 RETURNING *',
          [qty, price, buyingPrice, expiryDate, originCountry, category, existing.rows[0].id]
        );
      } else {
        result = await pool.query(
          'INSERT INTO public.pharmacy_stock (pharmacy_id, drug_id, quantity, selling_price, buying_price, currency, reorder_level, expiry_date, origin_country, category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
          [req.params.id, drugId, qty, price, buyingPrice, body.currency || 'IQD', reorderLvl, expiryDate, originCountry, category]
        );
      }
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
  });

  router.patch('/:id/inventory/:stockId', authenticate, async (req, res, next) => {
    try {
      const { quantity, sellingPrice, reorderLevel } = req.body;
      const sets = [];
      const vals = [];
      if (quantity !== undefined) { sets.push(`quantity=$${vals.length+1}`); vals.push(parseInt(quantity, 10) || 0); }
      if (sellingPrice !== undefined) {
        const p = (sellingPrice !== '' && !isNaN(Number(sellingPrice))) ? Number(sellingPrice) : null;
        sets.push(`selling_price=$${vals.length+1}`); vals.push(p);
      }
      if (reorderLevel !== undefined) { sets.push(`reorder_level=$${vals.length+1}`); vals.push(reorderLevel); }
      if (!sets.length) return res.status(422).json({ success: false, error: { title: 'Nothing to update' } });
      sets.push('updated_at=NOW()');
      vals.push(req.params.stockId, req.params.id);
      const result = await pool.query(
        `UPDATE public.pharmacy_stock SET ${sets.join(',')} WHERE id=$${vals.length-1} AND pharmacy_id=$${vals.length} RETURNING *`,
        vals
      );
      if (!result.rows.length) return res.status(404).json({ success: false });
      res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
  });

  // Prescription requests table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.prescription_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id TEXT,
      patient_name TEXT,
      patient_phone TEXT,
      notes TEXT,
      image_base64 TEXT,
      radius_km INTEGER DEFAULT 10,
      lat NUMERIC(10,6),
      lng NUMERIC(10,6),
      status TEXT DEFAULT 'open',
      claimed_by UUID,
      claimed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  // Create prescription request (patient)
  router.post('/prescriptions', async (req, res, next) => {
    try {
      const { patientId, patientName, patientPhone, notes, imageBase64, radiusKm, lat, lng } = req.body;
      const r = await pool.query(
        `INSERT INTO public.prescription_requests (patient_id, patient_name, patient_phone, notes, image_base64, radius_km, lat, lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
        [patientId || null, patientName || 'مريض', patientPhone || '', notes || '', imageBase64 || '', parseInt(radiusKm)||10, lat||null, lng||null]
      );
      res.status(201).json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  // Get prescription by ID (pharmacy views it)
  router.get('/prescriptions/:id', authenticate, async (req, res, next) => {
    try {
      const r = await pool.query('SELECT * FROM public.prescription_requests WHERE id=$1', [req.params.id]);
      if (!r.rows.length) return res.status(404).json({ success: false });
      const row = r.rows[0];
      res.json({ success: true, data: { ...row, image_base64: row.image_base64 ? '[image]' : '' } });
    } catch (err) { next(err); }
  });

  // Get prescription image (separate endpoint to avoid large payloads)
  router.get('/prescriptions/:id/image', authenticate, async (req, res, next) => {
    try {
      const r = await pool.query('SELECT image_base64 FROM public.prescription_requests WHERE id=$1', [req.params.id]);
      if (!r.rows.length) return res.status(404).json({ success: false });
      res.json({ success: true, data: { image_base64: r.rows[0].image_base64 } });
    } catch (err) { next(err); }
  });

  // Pharmacy claims prescription (removes it from others)
  router.patch('/prescriptions/:id/claim', authenticate, quota.enforceQuota({
    quotaKey: 'prescriptions',
    getEntity: (req) => {
      const pharmacyId = req.body.pharmacyId || req.user?.sub;
      return pharmacyId ? { entityType: 'pharmacy', entityId: pharmacyId, ownerUserId: req.user?.sub || null } : null;
    },
  }), async (req, res, next) => {
    try {
      const pharmacyId = req.body.pharmacyId || req.user?.sub;
      const r = await pool.query(
        `UPDATE public.prescription_requests SET status='claimed', claimed_by=$1, claimed_at=NOW()
         WHERE id=$2 AND status='open' RETURNING *`,
        [pharmacyId, req.params.id]
      );
      if (!r.rows.length) return res.status(409).json({ success: false, error: { title: 'Already claimed or not found' } });
      res.json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  // Decrement stock quantity when pharmacy delivers to patient
  router.post('/:id/inventory/decrement', authenticate, async (req, res, next) => {
    try {
      const { drugId, qty } = req.body;
      if (!drugId || !qty || qty < 1) return res.status(422).json({ success: false, error: { title: 'drugId and qty required' } });
      const result = await pool.query(
        `UPDATE public.pharmacy_stock
         SET quantity = GREATEST(0, quantity - $1), updated_at = NOW()
         WHERE pharmacy_id = $2 AND drug_id = $3
         RETURNING id, quantity`,
        [parseInt(qty, 10), req.params.id, drugId]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, error: { title: 'Stock entry not found' } });
      res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
  });

  router.delete('/:id/inventory/:stockId', authenticate, async (req, res, next) => {
    try {
      const result = await pool.query(
        'DELETE FROM public.pharmacy_stock WHERE id=$1 AND pharmacy_id=$2 RETURNING id',
        [req.params.stockId, req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ success: false });
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  router.get('/:id/orders', authenticate, async (req, res, next) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);
      const result = await pool.query(`
        SELECT o.*, u.email as patient_email
        FROM orders.orders o
        JOIN auth.users u ON u.id = o.patient_id
        WHERE o.pharmacy_id = $1
          AND ($2::text IS NULL OR o.status = $2)
        ORDER BY o.created_at DESC
        LIMIT $3 OFFSET $4
      `, [req.params.id, status || null, limit, offset]);
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  router.get('/:id/analytics', authenticate, async (req, res, next) => {
    try {
      const [todayResult, monthResult] = await Promise.all([
        pool.query(`SELECT COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue
          FROM orders.orders WHERE pharmacy_id = $1 AND DATE(created_at) = CURRENT_DATE AND status = 'delivered'`,
          [req.params.id]),
        pool.query(`SELECT COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue
          FROM orders.orders WHERE pharmacy_id = $1
            AND created_at >= DATE_TRUNC('month', NOW()) AND status = 'delivered'`,
          [req.params.id]),
      ]);
      res.json({ success: true, data: { today: todayResult.rows[0], thisMonth: monthResult.rows[0] } });
    } catch (err) { next(err); }
  });

  app.use('/api/v1/pharmacies', router);

  // ─── APPOINTMENTS API ────────────────────────────────────────────────────────
  await pool.query(`CREATE SCHEMA IF NOT EXISTS appointments`).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments.doctor_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id TEXT NOT NULL,
      day_of_week SMALLINT NOT NULL, -- 0=Sun 1=Mon ... 6=Sat
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      max_patients INTEGER NOT NULL DEFAULT 10,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(doctor_id, day_of_week)
    )
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments.bookings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      patient_phone TEXT,
      patient_email TEXT,
      appointment_date DATE NOT NULL,
      appointment_time TIME,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  const apptRouter = express.Router();

  // GET doctor schedule
  apptRouter.get('/:doctorId/schedule', async (req, res, next) => {
    try {
      const r = await pool.query(
        'SELECT * FROM appointments.doctor_schedules WHERE doctor_id=$1 ORDER BY day_of_week',
        [req.params.doctorId]
      );
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  // PUT (upsert) doctor schedule for a day
  apptRouter.put('/:doctorId/schedule', async (req, res, next) => {
    try {
      const { day_of_week, start_time, end_time, max_patients, is_active } = req.body;
      const r = await pool.query(`
        INSERT INTO appointments.doctor_schedules (doctor_id, day_of_week, start_time, end_time, max_patients, is_active)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (doctor_id, day_of_week) DO UPDATE
          SET start_time=$3, end_time=$4, max_patients=$5, is_active=$6
        RETURNING *
      `, [req.params.doctorId, day_of_week, start_time, end_time, max_patients ?? 10, is_active ?? true]);
      res.json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  // GET available slots for a date
  apptRouter.get('/:doctorId/availability', async (req, res, next) => {
    try {
      const { date } = req.query;
      if (!date) return res.status(400).json({ success: false, error: { title: 'date required' } });
      const d = new Date(date);
      const dow = d.getDay(); // 0=Sun
      const [sched, booked] = await Promise.all([
        pool.query('SELECT * FROM appointments.doctor_schedules WHERE doctor_id=$1 AND day_of_week=$2 AND is_active=true', [req.params.doctorId, dow]),
        pool.query("SELECT COUNT(*) FROM appointments.bookings WHERE doctor_id=$1 AND appointment_date=$2 AND status!='cancelled'", [req.params.doctorId, date]),
      ]);
      if (!sched.rows.length) return res.json({ success: true, data: { available: false, reason: 'no_schedule' } });
      const s = sched.rows[0];
      const bookedCount = parseInt(booked.rows[0].count);
      res.json({ success: true, data: { available: bookedCount < s.max_patients, bookedCount, maxPatients: s.max_patients, startTime: s.start_time, endTime: s.end_time } });
    } catch (err) { next(err); }
  });

  // GET bookings for a doctor
  apptRouter.get('/:doctorId/bookings', async (req, res, next) => {
    try {
      const { date, status } = req.query;
      let q = 'SELECT * FROM appointments.bookings WHERE doctor_id=$1';
      const params = [req.params.doctorId];
      if (date) { q += ` AND appointment_date=$${params.length+1}`; params.push(date); }
      if (status) { q += ` AND status=$${params.length+1}`; params.push(status); }
      q += ' ORDER BY appointment_date, created_at';
      const r = await pool.query(q, params);
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  // POST create booking (public — patient books)
  apptRouter.post('/:doctorId/bookings', quota.enforceQuota({
    quotaKey: 'future_appointment_limit',
    getEntity: (req) => ({ entityType: 'doctor', entityId: req.params.doctorId, ownerUserId: req.params.doctorId }),
  }), async (req, res, next) => {
    try {
      const { patient_name, patient_phone, patient_email, appointment_date, notes } = req.body;
      // Check availability
      const d = new Date(appointment_date);
      const dow = d.getDay();
      const [sched, booked] = await Promise.all([
        pool.query('SELECT * FROM appointments.doctor_schedules WHERE doctor_id=$1 AND day_of_week=$2 AND is_active=true', [req.params.doctorId, dow]),
        pool.query("SELECT COUNT(*) FROM appointments.bookings WHERE doctor_id=$1 AND appointment_date=$2 AND status!='cancelled'", [req.params.doctorId, appointment_date]),
      ]);
      if (!sched.rows.length) return res.status(400).json({ success: false, error: { title: 'الطبيب غير متاح في هذا اليوم' } });
      if (parseInt(booked.rows[0].count) >= sched.rows[0].max_patients) {
        return res.status(400).json({ success: false, error: { title: 'الطاقة الاستيعابية ممتلئة لهذا اليوم' } });
      }
      const r = await pool.query(`
        INSERT INTO appointments.bookings (doctor_id, patient_name, patient_phone, patient_email, appointment_date, appointment_time, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
      `, [req.params.doctorId, patient_name, patient_phone, patient_email, appointment_date, sched.rows[0].start_time, notes]);
      res.status(201).json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  // PATCH booking (status, appointment_date, notes)
  apptRouter.patch('/:doctorId/bookings/:bookingId', async (req, res, next) => {
    try {
      const { status, appointment_date, notes } = req.body;
      const setClauses = [];
      const params = [];
      if (status           !== undefined) { params.push(status);           setClauses.push(`status=$${params.length}`); }
      if (appointment_date !== undefined) { params.push(appointment_date); setClauses.push(`appointment_date=$${params.length}`); }
      if (notes            !== undefined) { params.push(notes);            setClauses.push(`notes=$${params.length}`); }
      if (!setClauses.length) return res.status(400).json({ success: false, error: { title: 'nothing to update' } });
      params.push(req.params.bookingId, req.params.doctorId);
      const r = await pool.query(
        `UPDATE appointments.bookings SET ${setClauses.join(', ')} WHERE id=$${params.length - 1} AND doctor_id=$${params.length} RETURNING *`,
        params
      );
      res.json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  // DELETE booking
  apptRouter.delete('/:doctorId/bookings/:bookingId', async (req, res, next) => {
    try {
      await pool.query('DELETE FROM appointments.bookings WHERE id=$1 AND doctor_id=$2', [req.params.bookingId, req.params.doctorId]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  app.use('/api/v1/appointments/doctors', apptRouter);

  // ── Pharmacy state endpoints (sync order statuses across devices) ─────
  app.get('/api/v1/pharmacies/:id/state/:key', authenticate, async (req, res, next) => {
    try {
      const r = await pool.query(
        'SELECT value FROM public.pharmacy_state WHERE pharmacy_id=$1 AND key=$2',
        [req.params.id, req.params.key]
      );
      res.json({ success: true, data: r.rows[0]?.value ? JSON.parse(r.rows[0].value) : [] });
    } catch (err) { next(err); }
  });

  app.put('/api/v1/pharmacies/:id/state/:key', authenticate, async (req, res, next) => {
    try {
      const value = JSON.stringify(req.body.value ?? []);
      await pool.query(
        `INSERT INTO public.pharmacy_state (pharmacy_id, key, value, updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (pharmacy_id, key) DO UPDATE SET value=$3, updated_at=NOW()`,
        [req.params.id, req.params.key, value]
      );
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ── Generic user-state endpoints (doctors, warehouse, etc.) ─────────────
  app.get('/api/v1/user-state/:userId/:key', authenticate, async (req, res, next) => {
    try {
      const r = await pool.query(
        'SELECT value FROM public.pharmacy_state WHERE pharmacy_id=$1 AND key=$2',
        [req.params.userId, req.params.key]
      );
      res.json({ success: true, data: r.rows[0]?.value ? JSON.parse(r.rows[0].value) : [] });
    } catch (err) { next(err); }
  });

  app.put('/api/v1/user-state/:userId/:key', authenticate, async (req, res, next) => {
    try {
      const value = JSON.stringify(req.body.value ?? []);
      await pool.query(
        `INSERT INTO public.pharmacy_state (pharmacy_id, key, value, updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (pharmacy_id, key) DO UPDATE SET value=$3, updated_at=NOW()`,
        [req.params.userId, req.params.key, value]
      );
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ── Platform config endpoints ──────────────────────────────────────────
  // Public: get a config value
  app.get('/api/v1/platform/config/:key', async (req, res, next) => {
    try {
      const r = await pool.query('SELECT value FROM public.platform_config WHERE key=$1', [req.params.key]);
      if (!r.rows.length) return res.status(404).json({ success: false });
      res.json({ success: true, data: { key: req.params.key, value: r.rows[0].value } });
    } catch (err) { next(err); }
  });

  // Admin: set a config value (requires admin JWT)
  app.patch('/api/v1/platform/config/:key', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { value } = req.body;
      if (value === undefined || value === null) return res.status(422).json({ success: false });
      await pool.query(
        `INSERT INTO public.platform_config (key, value, updated_at) VALUES ($1,$2,NOW())
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
        [req.params.key, String(value)]
      );
      res.json({ success: true, data: { key: req.params.key, value: String(value) } });
    } catch (err) { next(err); }
  });

  // Pharmacy rating decrement (called on auto-reject)
  app.patch('/api/v1/pharmacies/:id/rating-decrement', async (req, res, next) => {
    try {
      const { amount = 0.1 } = req.body;
      const r = await pool.query(
        `UPDATE public.pharmacies
         SET rating = GREATEST(0, rating - $1), updated_at = NOW()
         WHERE id = $2 RETURNING id, rating`,
        [Number(amount), req.params.id]
      );
      if (!r.rows.length) return res.status(404).json({ success: false });
      res.json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  // Secret admin endpoint: activate pharmacy + auth user by email
  app.post('/api/v1/admin/activate-by-email', async (req, res, next) => {
    try {
      const secret = req.headers['x-admin-secret'];
      if (secret !== (process.env.ADMIN_SECRET || 'mediflow-admin-2026'))
        return res.status(403).json({ error: 'Forbidden' });
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'email required' });
      // Activate in auth.users
      const uRes = await pool.query(
        `UPDATE auth.users SET status='active', updated_at=NOW() WHERE LOWER(email)=LOWER($1) RETURNING id, email, status`,
        [email]
      );
      if (uRes.rows.length === 0) return res.status(404).json({ error: 'User not found in auth.users' });
      const userId = uRes.rows[0].id;
      const userRole = uRes.rows[0].role;
      // Also activate the pharmacy record if any
      const pRes = await pool.query(
        `UPDATE pharmacies.pharmacies SET status='active', updated_at=NOW() WHERE owner_id=$1 RETURNING id, status`,
        [userId]
      );
      // Auto-create warehouse row for warehouse owners
      let whRow = null;
      const warehouseRoles2 = ['warehouse_owner', 'warehouse_manager'];
      if (warehouseRoles2.includes(userRole)) {
        const existing = await pool.query('SELECT id FROM warehouses.warehouses WHERE owner_id=$1', [userId]);
        if (existing.rows.length === 0) {
          const wInsert = await pool.query(
            `INSERT INTO warehouses.warehouses (owner_id) VALUES ($1) RETURNING id, name, status`,
            [userId]
          );
          whRow = wInsert.rows[0];
        } else {
          whRow = existing.rows[0];
        }
      }
      res.json({ success: true, user: uRes.rows[0], pharmacy: pRes.rows[0] || null, warehouse: whRow });
    } catch (err) { next(err); }
  });

  // Admin: update warehouse name by owner email
  app.post('/api/v1/admin/update-warehouse-name', async (req, res, next) => {
    try {
      const secret = req.headers['x-admin-secret'];
      if (secret !== (process.env.ADMIN_SECRET || 'mediflow-admin-2026'))
        return res.status(403).json({ error: 'Forbidden' });
      const { email, name, name_ar } = req.body;
      if (!email || !name) return res.status(400).json({ error: 'email and name required' });
      const uRes = await pool.query(`SELECT id FROM auth.users WHERE LOWER(email)=LOWER($1)`, [email]);
      if (!uRes.rows.length) return res.status(404).json({ error: 'User not found' });
      const userId = uRes.rows[0].id;
      const wRes = await pool.query(
        `UPDATE warehouses.warehouses SET name=$1, name_ar=COALESCE($2,name_ar), updated_at=NOW()
         WHERE owner_id=$3 RETURNING id, name, name_ar`,
        [name, name_ar || name, userId]
      );
      if (!wRes.rows.length) return res.status(404).json({ error: 'Warehouse row not found — activate first' });
      res.json({ success: true, data: wRes.rows[0] });
    } catch (err) { next(err); }
  });

  // ─── SUBSCRIPTIONS / ORGANIZATIONS — Phase 1: schema only, no routes yet ──────
  // core.organizations is a registry of every subscribable entity (pharmacy, warehouse,
  // doctor today; any future org type just adds a new entity_type — no new table needed).
  // subscriptions.* implements versioned/immutable plans, quotas, feature flags, per-org
  // overrides, permanent history ledgers, and metered usage. See CLAUDE.md for the full design.
  await pool.query(`CREATE SCHEMA IF NOT EXISTS core`).catch(() => {});
  await pool.query(`CREATE SCHEMA IF NOT EXISTS subscriptions`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS core.organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type TEXT NOT NULL,
      entity_id UUID NOT NULL,
      owner_user_id UUID REFERENCES auth.users(id),
      parent_organization_id UUID REFERENCES core.organizations(id),
      display_name TEXT,
      display_name_ar TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      UNIQUE (entity_type, entity_id)
    )
  `).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS organizations_owner_idx ON core.organizations(owner_user_id)`).catch(() => {});
  // Admin org search does display_name ILIKE '%term%' — a leading-wildcard
  // pattern a btree index can't use. pg_trgm (already enabled, see 001_init_schemas.sql)
  // makes that a real index scan instead of a full-table scan as orgs grow.
  await pool.query(`CREATE INDEX IF NOT EXISTS organizations_display_name_trgm_idx ON core.organizations USING GIN (display_name gin_trgm_ops)`).catch(() => {});

  // Plans are versioned and immutable once published: editing a plan creates a new row
  // (version + 1) rather than mutating one that already has subscribers, so existing
  // subscribers are never silently affected by a later plan edit (grandfathering).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      family_code TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      is_current_version BOOLEAN NOT NULL DEFAULT true,
      superseded_by_plan_id UUID REFERENCES subscriptions.plans(id),
      name TEXT NOT NULL,
      name_ar TEXT,
      description TEXT,
      description_ar TEXT,
      marketing_features JSONB NOT NULL DEFAULT '[]',
      display_order INTEGER NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      is_public BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `).catch(() => {});
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS plans_one_current_version_per_family
      ON subscriptions.plans (family_code) WHERE is_current_version AND deleted_at IS NULL
  `).catch(() => {});
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS plans_one_default
      ON subscriptions.plans (is_default) WHERE is_default AND deleted_at IS NULL
  `).catch(() => {});

  // Separate pricing table — new currencies/billing cycles never require a redesign.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.plan_prices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id UUID NOT NULL REFERENCES subscriptions.plans(id) ON DELETE CASCADE,
      currency TEXT NOT NULL,
      billing_cycle TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_id, currency, billing_cycle)
    )
  `).catch(() => {});

  // Quota registry — any quota type, any organization type; a new quota is one INSERT here,
  // never a migration. reset_period/reset_period_days makes the reset cadence configurable
  // per quota (daily/weekly/monthly/yearly/custom/none for non-metered values).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.quota_definitions (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      label_ar TEXT,
      applies_to_entity_type TEXT,
      value_type TEXT NOT NULL DEFAULT 'count',
      is_metered BOOLEAN NOT NULL DEFAULT true,
      reset_period TEXT NOT NULL DEFAULT 'monthly',
      reset_period_days INTEGER,
      default_warning_pct NUMERIC(5,2) NOT NULL DEFAULT 80,
      default_critical_pct NUMERIC(5,2) NOT NULL DEFAULT 95,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.plan_quotas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id UUID NOT NULL REFERENCES subscriptions.plans(id) ON DELETE CASCADE,
      quota_key TEXT NOT NULL REFERENCES subscriptions.quota_definitions(key),
      limit_value NUMERIC,
      warning_pct NUMERIC(5,2),
      critical_pct NUMERIC(5,2),
      UNIQUE (plan_id, quota_key)
    )
  `).catch(() => {});

  // Feature flags — booleans, deliberately separate from numeric quotas.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.feature_definitions (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      label_ar TEXT,
      applies_to_entity_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.plan_features (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id UUID NOT NULL REFERENCES subscriptions.plans(id) ON DELETE CASCADE,
      feature_key TEXT NOT NULL REFERENCES subscriptions.feature_definitions(key),
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      UNIQUE (plan_id, feature_key)
    )
  `).catch(() => {});

  // Active subscription — current state only; subscription_history (below) is the
  // permanent, append-only ledger of every transition.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES subscriptions.plans(id),
      status TEXT NOT NULL DEFAULT 'active',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      current_period_end TIMESTAMPTZ,
      canceled_at TIMESTAMPTZ,
      billing_provider TEXT,
      billing_reference TEXT,
      billing_cycle TEXT,
      next_billing_at TIMESTAMPTZ,
      renewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active_per_org
      ON subscriptions.subscriptions (organization_id) WHERE status IN ('trialing','active','past_due')
  `).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS subscriptions_org_idx ON subscriptions.subscriptions(organization_id)`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.subscription_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
      subscription_id UUID REFERENCES subscriptions.subscriptions(id),
      previous_plan_id UUID REFERENCES subscriptions.plans(id),
      new_plan_id UUID NOT NULL REFERENCES subscriptions.plans(id),
      changed_by UUID REFERENCES auth.users(id),
      change_reason TEXT,
      effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expiration_date TIMESTAMPTZ,
      payment_provider TEXT,
      payment_reference TEXT,
      amount NUMERIC(12,2),
      currency TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  // Admin org-detail/audit-log always filters this by organization_id — without
  // an index it's a full-table scan once history accumulates.
  await pool.query(`CREATE INDEX IF NOT EXISTS subscription_history_org_idx ON subscriptions.subscription_history(organization_id, effective_date DESC)`).catch(() => {});

  // Per-organization overrides take precedence over plan_quotas/plan_features when
  // resolving an org's effective limit. Reset-to-default = delete the override row.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.organization_quota_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
      quota_key TEXT NOT NULL REFERENCES subscriptions.quota_definitions(key),
      override_value NUMERIC,
      is_temporary BOOLEAN NOT NULL DEFAULT false,
      expires_at TIMESTAMPTZ,
      reason TEXT,
      created_by UUID REFERENCES auth.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, quota_key)
    )
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.organization_feature_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
      feature_key TEXT NOT NULL REFERENCES subscriptions.feature_definitions(key),
      is_enabled BOOLEAN NOT NULL,
      is_temporary BOOLEAN NOT NULL DEFAULT false,
      expires_at TIMESTAMPTZ,
      reason TEXT,
      created_by UUID REFERENCES auth.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, feature_key)
    )
  `).catch(() => {});

  // Permanent quota-override change ledger (before/after value, who, why) — separate from
  // plan-level history because plan quota changes are handled by plan versioning instead.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.quota_change_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
      quota_key TEXT NOT NULL REFERENCES subscriptions.quota_definitions(key),
      change_type TEXT NOT NULL,
      previous_value NUMERIC,
      new_value NUMERIC,
      changed_by UUID REFERENCES auth.users(id),
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS quota_change_history_org_idx ON subscriptions.quota_change_history(organization_id, created_at DESC)`).catch(() => {});

  // Metered usage — configurable reset period per quota (quota_definitions.reset_period).
  // Increment via INSERT ... ON CONFLICT DO UPDATE SET used_value = used_value + N so
  // concurrent requests can never race past the limit (Phase 2 will add this query).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.usage_counters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
      quota_key TEXT NOT NULL REFERENCES subscriptions.quota_definitions(key),
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      used_value NUMERIC NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, quota_key, period_start)
    )
  `).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS usage_counters_org_key_idx ON subscriptions.usage_counters(organization_id, quota_key)`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions.upgrade_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
      request_type TEXT NOT NULL,
      requested_plan_id UUID REFERENCES subscriptions.plans(id),
      requested_quota_key TEXT REFERENCES subscriptions.quota_definitions(key),
      requested_value NUMERIC,
      requested_duration_days INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_notes TEXT,
      decided_by UUID REFERENCES auth.users(id),
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS upgrade_requests_org_idx ON subscriptions.upgrade_requests(organization_id, status)`).catch(() => {});

  // ─── Seed data: the five tiers, Bronze → Silver → Gold → Platinum → Super ─────
  const planSeeds = [
    { code: 'bronze',   name: 'Bronze',   name_ar: 'برونزي',  order: 1, isDefault: true,  isPublic: true  },
    { code: 'silver',   name: 'Silver',   name_ar: 'فضي',      order: 2, isDefault: false, isPublic: true  },
    { code: 'gold',     name: 'Gold',     name_ar: 'ذهبي',     order: 3, isDefault: false, isPublic: true  },
    { code: 'platinum', name: 'Platinum', name_ar: 'بلاتيني',  order: 4, isDefault: false, isPublic: true  },
    { code: 'super',    name: 'Super',    name_ar: 'سوبر',     order: 5, isDefault: false, isPublic: false },
  ];
  const planIds = {};
  for (const p of planSeeds) {
    const existing = await pool.query(
      `SELECT id FROM subscriptions.plans WHERE family_code=$1 AND is_current_version`, [p.code]
    ).catch(() => ({ rows: [] }));
    if (existing.rows.length) { planIds[p.code] = existing.rows[0].id; continue; }
    const inserted = await pool.query(
      `INSERT INTO subscriptions.plans (family_code, version, is_current_version, name, name_ar, display_order, is_default, is_public, status)
       VALUES ($1, 1, true, $2, $3, $4, $5, $6, 'active') RETURNING id`,
      [p.code, p.name, p.name_ar, p.order, p.isDefault, p.isPublic]
    ).catch(() => ({ rows: [] }));
    if (inserted.rows.length) planIds[p.code] = inserted.rows[0].id;
  }

  const quotaSeeds = [
    { key: 'max_pharmacies_contacted',     label: 'Max pharmacies contacted',       label_ar: 'أقصى عدد صيدليات يمكن التواصل معها', entityType: 'warehouse', valueType: 'count',    metered: true,  reset: 'monthly' },
    { key: 'max_doctors_contacted',        label: 'Max doctors contacted',          label_ar: 'أقصى عدد أطباء يمكن التواصل معهم',   entityType: 'warehouse', valueType: 'count',    metered: true,  reset: 'monthly' },
    { key: 'online_orders',                label: 'Online orders',                  label_ar: 'الطلبات الإلكترونية',                entityType: 'pharmacy',  valueType: 'count',    metered: true,  reset: 'monthly' },
    { key: 'direct_sales',                 label: 'Direct sales',                   label_ar: 'المبيعات المباشرة',                  entityType: 'pharmacy',  valueType: 'count',    metered: true,  reset: 'monthly' },
    { key: 'prescriptions',                label: 'Prescriptions',                  label_ar: 'الوصفات الطبية',                     entityType: 'pharmacy',  valueType: 'count',    metered: true,  reset: 'monthly' },
    { key: 'reservation_duration_minutes', label: 'Reservation duration (minutes)', label_ar: 'مدة الحجز (بالدقائق)',                entityType: 'doctor',    valueType: 'duration', metered: false, reset: 'none'    },
    { key: 'future_appointment_limit',     label: 'Future appointment limit',       label_ar: 'أقصى عدد مواعيد مستقبلية',           entityType: 'doctor',    valueType: 'count',    metered: true,  reset: 'daily'   },
  ];
  for (const q of quotaSeeds) {
    await pool.query(
      `INSERT INTO subscriptions.quota_definitions (key, label, label_ar, applies_to_entity_type, value_type, is_metered, reset_period)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (key) DO NOTHING`,
      [q.key, q.label, q.label_ar, q.entityType, q.valueType, q.metered, q.reset]
    ).catch(() => {});
  }

  if (Object.keys(planIds).length === planSeeds.length) {
    const limitsByTier = {
      bronze:   { max_pharmacies_contacted: 5,    max_doctors_contacted: 5,    online_orders: 20,   direct_sales: 20,   prescriptions: 10,  reservation_duration_minutes: 15, future_appointment_limit: 5   },
      silver:   { max_pharmacies_contacted: 20,   max_doctors_contacted: 20,   online_orders: 100,  direct_sales: 100,  prescriptions: 50,  reservation_duration_minutes: 20, future_appointment_limit: 15  },
      gold:     { max_pharmacies_contacted: 50,   max_doctors_contacted: 50,   online_orders: 500,  direct_sales: 500,  prescriptions: 200, reservation_duration_minutes: 30, future_appointment_limit: 40  },
      platinum: { max_pharmacies_contacted: 150,  max_doctors_contacted: 150,  online_orders: 2000, direct_sales: 2000, prescriptions: 800, reservation_duration_minutes: 45, future_appointment_limit: 100 },
      super:    { max_pharmacies_contacted: null, max_doctors_contacted: null, online_orders: null, direct_sales: null, prescriptions: null, reservation_duration_minutes: 60, future_appointment_limit: null },
    };
    for (const [tier, quotas] of Object.entries(limitsByTier)) {
      for (const [key, value] of Object.entries(quotas)) {
        await pool.query(
          `INSERT INTO subscriptions.plan_quotas (plan_id, quota_key, limit_value) VALUES ($1,$2,$3) ON CONFLICT (plan_id, quota_key) DO NOTHING`,
          [planIds[tier], key, value]
        ).catch(() => {});
      }
    }
  }

  // ─── Backfill core.organizations from existing entities (additive, idempotent) ─
  await pool.query(`
    INSERT INTO core.organizations (entity_type, entity_id, owner_user_id, display_name, display_name_ar, status)
    SELECT 'pharmacy', p.id, p.owner_id, p.name, p.name_ar, p.status
    FROM pharmacies.pharmacies p
    ON CONFLICT (entity_type, entity_id) DO NOTHING
  `).catch(() => {});
  await pool.query(`
    INSERT INTO core.organizations (entity_type, entity_id, owner_user_id, display_name, display_name_ar, status)
    SELECT 'warehouse', w.id, w.owner_id, w.name, w.name_ar, w.status
    FROM warehouses.warehouses w
    ON CONFLICT (entity_type, entity_id) DO NOTHING
  `).catch(() => {});
  await pool.query(`
    INSERT INTO core.organizations (entity_type, entity_id, owner_user_id, display_name, status)
    SELECT 'doctor', u.id, u.id, COALESCE(u.email, u.phone), u.status
    FROM auth.users u
    WHERE u.role = 'doctor'
    ON CONFLICT (entity_type, entity_id) DO NOTHING
  `).catch(() => {});

  // Default-subscribe any organization without an active subscription to the default plan.
  await pool.query(`
    INSERT INTO subscriptions.subscriptions (organization_id, plan_id, status, started_at)
    SELECT o.id, (SELECT id FROM subscriptions.plans WHERE is_default AND deleted_at IS NULL LIMIT 1), 'active', NOW()
    FROM core.organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM subscriptions.subscriptions s
      WHERE s.organization_id = o.id AND s.status IN ('trialing','active','past_due')
    )
    AND EXISTS (SELECT 1 FROM subscriptions.plans WHERE is_default AND deleted_at IS NULL)
  `).catch(() => {});

  // ─── SUBSCRIPTIONS — org subscription/quota/usage + upgrade requests ─────────
  // Generic across entity_type — any future module (hospital, lab, insurance,
  // driver, clinic, ...) is served by these same routes with no code change.
  app.get('/api/v1/organizations/:entityType/:entityId/subscription', authenticate, quota.requireOrgAccess(), async (req, res, next) => {
    try {
      const snapshot = await quota.getOrganizationSnapshot(req.organization.entity_type, req.organization.entity_id);
      res.json({ success: true, data: snapshot });
    } catch (err) { next(err); }
  });

  // Public plan catalog — lets the frontend render upgrade options without any
  // entity-specific logic on either side.
  app.get('/api/v1/subscriptions/plans', authenticate, async (req, res, next) => {
    try {
      const plans = await quota.listPublicPlans();
      res.json({ success: true, data: plans });
    } catch (err) { next(err); }
  });

  app.get('/api/v1/organizations/:entityType/:entityId/upgrade-requests', authenticate, quota.requireOrgAccess(), async (req, res, next) => {
    try {
      const requests = await quota.listUpgradeRequests(req.organization.id);
      res.json({ success: true, data: requests });
    } catch (err) { next(err); }
  });

  app.post('/api/v1/organizations/:entityType/:entityId/upgrade-requests', authenticate, quota.requireOrgAccess(), async (req, res, next) => {
    try {
      const { requestType, requestedPlanId, requestedQuotaKey, requestedValue, requestedDurationDays } = req.body;
      if (!requestType) {
        return res.status(422).json({ success: false, error: { title: 'requestType is required', status: 422 } });
      }
      if (requestType === 'plan_change') {
        if (!requestedPlanId) {
          return res.status(422).json({ success: false, error: { title: 'requestedPlanId is required for plan_change', status: 422 } });
        }
        const planCheck = await pool.query(
          `SELECT id FROM subscriptions.plans WHERE id=$1 AND is_current_version AND is_public AND status='active' AND deleted_at IS NULL`,
          [requestedPlanId]
        );
        if (!planCheck.rows.length) {
          return res.status(422).json({ success: false, error: { title: 'requestedPlanId is not a valid public plan', status: 422 } });
        }
      }
      const created = await quota.createUpgradeRequest(req.organization.id, {
        requestType, requestedPlanId, requestedQuotaKey, requestedValue, requestedDurationDays,
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) { handleQuotaError(err, res, next); }
  });

  // ─── SUBSCRIPTIONS — Phase 4: admin management ───────────────────────────
  // Every route below is generic — none of them branch on entity_type. Same
  // isAdmin gate already used elsewhere in this file (admin/super_admin/
  // auditor/support), same quota.js primitives as Phases 2-3.
  app.get('/api/v1/admin/subscriptions/dashboard', authenticate, isAdmin, async (req, res, next) => {
    try { res.json({ success: true, data: await quota.getDashboardStats() }); }
    catch (err) { next(err); }
  });

  app.get('/api/v1/admin/subscriptions/plans', authenticate, isAdmin, async (req, res, next) => {
    try { res.json({ success: true, data: await quota.listAllPlans() }); }
    catch (err) { next(err); }
  });

  app.get('/api/v1/admin/subscriptions/plans/:id', authenticate, isAdmin, async (req, res, next) => {
    try {
      const plan = await quota.getPlanById(req.params.id);
      if (!plan) return res.status(404).json({ success: false, error: { title: 'Plan not found', status: 404 } });
      res.json({ success: true, data: plan });
    } catch (err) { next(err); }
  });

  app.patch('/api/v1/admin/subscriptions/plans/:id', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { name, name_ar, description, description_ar, marketing_features, display_order, is_public } = req.body;
      const updated = await quota.createPlanVersion(req.params.id, {
        name, name_ar, description, description_ar, marketing_features, display_order, is_public,
      });
      res.json({ success: true, data: updated });
    } catch (err) { handleQuotaError(err, res, next); }
  });

  app.patch('/api/v1/admin/subscriptions/plans/:id/status', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { status } = req.body;
      if (!['active', 'inactive'].includes(status)) {
        return res.status(422).json({ success: false, error: { title: "status must be 'active' or 'inactive'", status: 422 } });
      }
      const updated = await quota.setPlanStatus(req.params.id, status);
      if (!updated) return res.status(404).json({ success: false, error: { title: 'Plan not found or not the current version', status: 404 } });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  });

  app.get('/api/v1/admin/organizations', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { search, entityType, planFamilyCode, page, limit } = req.query;
      res.json({ success: true, ...(await quota.listOrganizations({ search, entityType, planFamilyCode, page, limit })) });
    } catch (err) { next(err); }
  });

  app.get('/api/v1/admin/organizations/:id', authenticate, isAdmin, async (req, res, next) => {
    try {
      const snapshot = await quota.getOrganizationById(req.params.id);
      if (!snapshot) return res.status(404).json({ success: false, error: { title: 'Organization not found', status: 404 } });
      res.json({ success: true, data: snapshot });
    } catch (err) { next(err); }
  });

  app.get('/api/v1/admin/upgrade-requests', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { status, entityType, page, limit } = req.query;
      res.json({ success: true, ...(await quota.listUpgradeRequestsAdmin({ status, entityType, page, limit })) });
    } catch (err) { next(err); }
  });

  app.get('/api/v1/admin/upgrade-requests/:id', authenticate, isAdmin, async (req, res, next) => {
    try {
      const request = await quota.getUpgradeRequestById(req.params.id);
      if (!request) return res.status(404).json({ success: false, error: { title: 'Upgrade request not found', status: 404 } });
      res.json({ success: true, data: request });
    } catch (err) { next(err); }
  });

  for (const decision of ['approved', 'rejected', 'cancelled']) {
    const path = decision === 'approved' ? 'approve' : decision === 'rejected' ? 'reject' : 'cancel';
    app.patch(`/api/v1/admin/upgrade-requests/:id/${path}`, authenticate, isAdmin, async (req, res, next) => {
      try {
        const updated = await quota.decideUpgradeRequest(req.params.id, {
          decision, adminUserId: req.user.sub, adminNotes: req.body.adminNotes,
        });
        res.json({ success: true, data: updated });
      } catch (err) { handleQuotaError(err, res, next); }
    });
  }

  app.post('/api/v1/admin/organizations/:id/subscription/change-plan', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { planId, reason } = req.body;
      if (!planId) return res.status(422).json({ success: false, error: { title: 'planId is required', status: 422 } });
      const planCheck = await pool.query(`SELECT id FROM subscriptions.plans WHERE id=$1 AND deleted_at IS NULL`, [planId]);
      if (!planCheck.rows.length) return res.status(422).json({ success: false, error: { title: 'planId does not exist', status: 422 } });
      const snapshot = await quota.changeOrgPlan(req.params.id, planId, { changedBy: req.user.sub, reason });
      res.json({ success: true, data: snapshot });
    } catch (err) { next(err); }
  });

  app.post('/api/v1/admin/organizations/:id/subscription/cancel', authenticate, isAdmin, async (req, res, next) => {
    try {
      const snapshot = await quota.cancelOrgSubscription(req.params.id, { changedBy: req.user.sub, reason: req.body.reason });
      res.json({ success: true, data: snapshot });
    } catch (err) { handleQuotaError(err, res, next); }
  });

  app.post('/api/v1/admin/organizations/:id/subscription/restore', authenticate, isAdmin, async (req, res, next) => {
    try {
      const snapshot = await quota.restoreOrgSubscription(req.params.id, { changedBy: req.user.sub, reason: req.body.reason });
      res.json({ success: true, data: snapshot });
    } catch (err) { handleQuotaError(err, res, next); }
  });

  app.get('/api/v1/admin/organizations/:id/quota-overrides', authenticate, isAdmin, async (req, res, next) => {
    try { res.json({ success: true, data: await quota.listQuotaOverrides(req.params.id) }); }
    catch (err) { next(err); }
  });

  app.post('/api/v1/admin/organizations/:id/quota-overrides', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { quotaKey, overrideValue, isTemporary, expiresAt, reason } = req.body;
      if (!quotaKey) return res.status(422).json({ success: false, error: { title: 'quotaKey is required', status: 422 } });
      const def = await quota.getQuotaDefinition(quotaKey);
      if (!def) return res.status(422).json({ success: false, error: { title: 'quotaKey is not a known quota', status: 422 } });
      const created = await quota.upsertQuotaOverride(req.params.id, quotaKey, {
        overrideValue, isTemporary, expiresAt, reason, createdBy: req.user.sub,
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) { handleQuotaError(err, res, next); }
  });

  app.patch('/api/v1/admin/organizations/:id/quota-overrides/:quotaKey', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { overrideValue, isTemporary, expiresAt, reason } = req.body;
      const updated = await quota.upsertQuotaOverride(req.params.id, req.params.quotaKey, {
        overrideValue, isTemporary, expiresAt, reason, createdBy: req.user.sub,
      });
      res.json({ success: true, data: updated });
    } catch (err) { handleQuotaError(err, res, next); }
  });

  app.delete('/api/v1/admin/organizations/:id/quota-overrides/:quotaKey', authenticate, isAdmin, async (req, res, next) => {
    try {
      const result = await quota.removeQuotaOverride(req.params.id, req.params.quotaKey, { removedBy: req.user.sub, reason: req.body?.reason });
      if (!result) return res.status(404).json({ success: false, error: { title: 'No override exists for this quota', status: 404 } });
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  });

  app.get('/api/v1/admin/audit-log', authenticate, isAdmin, async (req, res, next) => {
    try {
      const { organizationId, page, limit } = req.query;
      res.json({ success: true, data: await quota.getAuditLog({ organizationId, page, limit }) });
    } catch (err) { next(err); }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  const port = parseInt(process.env.PORT || '8005', 10);
  app.listen(port, () => console.log(`Pharmacy service running on :${port}`));
}

bootstrap().catch(console.error);
