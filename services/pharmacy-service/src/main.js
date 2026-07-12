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

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
async function bootstrap() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
  await pool.connect().then((c) => { console.log('PostgreSQL connected'); c.release(); });

  // Lightweight schema migrations
  await pool.query(`
    ALTER TABLE pharmacies.pharmacies
      ADD COLUMN IF NOT EXISTS delivery_rate_per_km INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_min_fee INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_max_km INTEGER DEFAULT 20
  `).catch(() => {});
  await pool.query(`ALTER TABLE pharmacies.pharmacies ADD COLUMN IF NOT EXISTS license_holder_name TEXT`).catch(() => {});

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
  // Seed default auto-reject timeout if not set
  await pool.query(`
    INSERT INTO public.platform_config (key, value) VALUES ('auto_reject_minutes', '10')
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
      const { name, name_ar, batch_number, quantity, reorder_level, unit_price, expiry_date } = req.body;
      if (!name) return res.status(422).json({ success: false, error: { title: 'name required' } });
      const r = await pool.query(
        `INSERT INTO warehouses.inventory
          (warehouse_id, name, name_ar, batch_number, quantity, reorder_level, unit_price, expiry_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *,
          CASE WHEN quantity=0 THEN 'out'
               WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE+INTERVAL '30 days' THEN 'expiring'
               WHEN quantity<reorder_level THEN 'low' ELSE 'good' END AS status`,
        [req.params.warehouseId, name, name_ar||name, batch_number||null,
         quantity||0, reorder_level||100, unit_price||0, expiry_date||null]
      );
      res.status(201).json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  app.patch('/api/v1/warehouses/:warehouseId/inventory/:stockId', authenticate, isWarehouse, async (req, res, next) => {
    try {
      const { name, name_ar, batch_number, quantity, reorder_level, unit_price, expiry_date } = req.body;
      const r = await pool.query(`
        UPDATE warehouses.inventory SET
          name=COALESCE($1,name), name_ar=COALESCE($2,name_ar),
          batch_number=COALESCE($3,batch_number), quantity=COALESCE($4,quantity),
          reorder_level=COALESCE($5,reorder_level), unit_price=COALESCE($6,unit_price),
          expiry_date=COALESCE($7,expiry_date), updated_at=NOW()
        WHERE id=$8 AND warehouse_id=$9
        RETURNING *,
          CASE WHEN quantity=0 THEN 'out'
               WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE+INTERVAL '30 days' THEN 'expiring'
               WHEN quantity<reorder_level THEN 'low' ELSE 'good' END AS status
      `, [name, name_ar, batch_number, quantity, reorder_level, unit_price, expiry_date,
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
        `UPDATE warehouses.b2b_orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [status, req.params.orderId]
      );
      if (!r.rows.length) return res.status(404).json({ success: false });
      res.json({ success: true, data: r.rows[0] });
    } catch (err) { next(err); }
  });

  // ── Public: warehouse catalog (pharmacies browse) ─────────────────────────
  app.get('/api/v1/warehouses/catalog', authenticate, async (req, res, next) => {
    try {
      const r = await pool.query(`
        SELECT i.*, w.name AS warehouse_name, w.city AS warehouse_city,
          CASE WHEN i.quantity=0 THEN 'out'
               WHEN i.expiry_date IS NOT NULL AND i.expiry_date < CURRENT_DATE+INTERVAL '30 days' THEN 'expiring'
               WHEN i.quantity<i.reorder_level THEN 'low' ELSE 'good' END AS status
        FROM warehouses.inventory i
        JOIN warehouses.warehouses w ON w.id=i.warehouse_id AND w.status='active'
        WHERE i.quantity > 0
        ORDER BY i.name
      `);
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  // ── Public: search warehouse inventory by drug name ──────────────────────
  app.get('/api/v1/warehouses/drugs/search', async (req, res, next) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q || q.length < 2) return res.json({ success: true, data: [] });
      const r = await pool.query(`
        SELECT i.id, i.name, i.name_ar, i.batch_number, i.quantity, i.unit_price, i.expiry_date,
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

  // ── Pharmacy: place B2B order ─────────────────────────────────────────────
  app.post('/api/v1/warehouses/b2b-orders', authenticate, async (req, res, next) => {
    try {
      const { warehouse_id, pharmacy_id, pharmacy_name, items, notes } = req.body;
      if (!warehouse_id || !items?.length) {
        return res.status(422).json({ success: false, error: { title: 'warehouse_id and items required' } });
      }
      const total = items.reduce((sum, it) => sum + (it.quantity * it.unit_price), 0);
      const order = await pool.query(
        `INSERT INTO warehouses.b2b_orders (warehouse_id, pharmacy_id, pharmacy_name, total, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [warehouse_id, pharmacy_id || req.user.sub, pharmacy_name || 'صيدلية', total, notes || null]
      );
      const orderId = order.rows[0].id;
      for (const it of items) {
        await pool.query(
          `INSERT INTO warehouses.b2b_order_items (order_id, inventory_id, name, quantity, unit_price)
           VALUES ($1,$2,$3,$4,$5)`,
          [orderId, it.inventory_id || null, it.name, it.quantity, it.unit_price]
        );
      }
      res.status(201).json({ success: true, data: order.rows[0] });
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
  router.get('/active', authenticate, async (_req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT id, name, name_ar, phone, city, address, status,
               (status = 'active') AS is_online
        FROM pharmacies.pharmacies
        WHERE status IN ('active', 'inactive')
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

  // Pharmacy sets itself online/offline (login=active, logout=inactive)
  router.patch('/:id/status', authenticate, async (req, res, next) => {
    try {
      const { status } = req.body;
      const allowed = ['active', 'inactive'];
      if (!allowed.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
      await pool.query(
        `UPDATE pharmacies.pharmacies SET status=$1, updated_at=NOW() WHERE id=$2 AND (owner_id=$3 OR id IN (SELECT pharmacy_id FROM public.pharmacy_staff WHERE user_id=$3))`,
        [status, req.params.id, req.user.sub]
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
           WHERE p.status IN ('active', 'inactive')
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
        WHERE p.status IN ('active','inactive')
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
      const { requester_entity, requester_name } = req.body;
      const sets = []; const params = [];
      if (requester_entity !== undefined) { sets.push(`requester_entity=$${params.length+1}`); params.push(requester_entity); }
      if (requester_name   !== undefined) { sets.push(`requester_name=$${params.length+1}`);   params.push(requester_name); }
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
  router.patch('/prescriptions/:id/claim', authenticate, async (req, res, next) => {
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
  apptRouter.post('/:doctorId/bookings', async (req, res, next) => {
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

  // PATCH booking status
  apptRouter.patch('/:doctorId/bookings/:bookingId', async (req, res, next) => {
    try {
      const { status } = req.body;
      const r = await pool.query(
        "UPDATE appointments.bookings SET status=$1 WHERE id=$2 AND doctor_id=$3 RETURNING *",
        [status, req.params.bookingId, req.params.doctorId]
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
      // Also activate the pharmacy record if any
      const pRes = await pool.query(
        `UPDATE pharmacies.pharmacies SET status='active', updated_at=NOW() WHERE owner_id=$1 RETURNING id, status`,
        [userId]
      );
      res.json({ success: true, user: uRes.rows[0], pharmacy: pRes.rows[0] || null });
    } catch (err) { next(err); }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  const port = parseInt(process.env.PORT || '8005', 10);
  app.listen(port, () => console.log(`Pharmacy service running on :${port}`));
}

bootstrap().catch(console.error);
