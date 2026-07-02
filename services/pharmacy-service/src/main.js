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
    // If JWT_PUBLIC_KEY is not configured, decode without verification (dev fallback)
    const payload = publicKey
      ? jwt.verify(token, publicKey, {
          algorithms: ['RS256'],
          issuer: process.env.JWT_ISSUER || 'https://auth.mediflow.io',
        })
      : jwt.decode(token);
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

  // Ensure inventory schema and pharmacy_stock table exist
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
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // non-browser / server-to-server
      const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
      if (allowed.includes(origin) || /\.vercel\.app$/.test(origin) || /localhost/.test(origin)) {
        return cb(null, true);
      }
      cb(new Error('CORS: origin not allowed'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(traceIdMiddleware);
  app.use(requestLogger);

  const router = express.Router();

  // ─── PLATFORM SETTINGS ────────────────────────────────────────────────
  router.get('/settings', async (_req, res, next) => {
    try {
      const result = await pool.query('SELECT key, value FROM public.platform_settings');
      const settings = {};
      result.rows.forEach(r => { settings[r.key] = r.value === 'true'; });
      res.json({ success: true, data: settings });
    } catch (err) { next(err); }
  });

  router.patch('/settings', async (req, res, next) => {
    try {
      const { secret, ...body } = req.body;
      if (secret !== 'mediflow-admin-2026') {
        return res.status(403).json({ success: false, error: { title: 'Forbidden' } });
      }
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
  router.get('/admin/all', async (_req, res, next) => {
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

  router.patch('/admin/:id/status', async (req, res, next) => {
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

  router.delete('/admin/:id', async (req, res, next) => {
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

  router.post('/admin/:id/delete', async (req, res, next) => {
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

  router.get('/my/settings', authenticate, async (req, res, next) => {
    try {
      const r = await pool.query('SELECT delivery_rate_per_km, delivery_min_fee, delivery_max_km FROM pharmacies.pharmacies WHERE owner_id=$1', [req.user.sub]);
      res.json({ success: true, data: r.rows[0] || {} });
    } catch (err) { next(err); }
  });

  router.patch('/my/settings', authenticate, async (req, res, next) => {
    try {
      const b = req.body;
      await pool.query(`
        UPDATE pharmacies.pharmacies SET
          delivery_rate_per_km = COALESCE($1::int, delivery_rate_per_km),
          delivery_min_fee = COALESCE($2::int, delivery_min_fee),
          delivery_max_km = COALESCE($3::int, delivery_max_km),
          updated_at = NOW()
        WHERE owner_id = $4
      `, [b.delivery_rate_per_km ?? null, b.delivery_min_fee ?? null, b.delivery_max_km ?? null, req.user.sub]);
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
                  ST_Distance(p.location, ST_MakePoint($3,$2)::geography) / 1000 AS distance_km,
                  'pharmacy' AS result_type
           FROM pharmacies.pharmacies p
           WHERE p.status = 'active'
             AND ST_DWithin(p.location, ST_MakePoint($3,$2)::geography, $4::float * 1000)
             AND (p.name ILIKE $1 OR p.name_ar ILIKE $1)
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
        SELECT p.id, p.name, p.name_ar, p.phone, p.rating,
               p.delivery_rate_per_km, p.delivery_min_fee, p.delivery_max_km,
               ST_Distance(p.location, ST_MakePoint($2,$1)::geography) / 1000 AS distance_km
        FROM pharmacies.pharmacies p
        LEFT JOIN public.pharmacy_stock s ON s.pharmacy_id = p.id AND ($3::uuid IS NULL OR s.drug_id = $3::uuid)
        WHERE p.status = 'active'
          AND ST_DWithin(p.location, ST_MakePoint($2,$1)::geography, $4::float * 1000)
        ORDER BY distance_km ASC
        LIMIT 20
      `, [lat, lng, drugId || null, radiusKm]);
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
  router.post('/admin-requests', async (req, res, next) => {
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

  router.get('/admin-requests', async (req, res, next) => {
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

  router.patch('/admin-requests/:id/status', async (req, res, next) => {
    try {
      await pool.query('UPDATE public.admin_requests SET status=$1, decided_at=NOW() WHERE id=$2',
        [req.body.status, req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  router.patch('/admin-requests/:id', async (req, res, next) => {
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

  router.delete('/admin-requests/:id', async (req, res, next) => {
    try {
      await pool.query('DELETE FROM public.admin_requests WHERE id=$1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  router.delete('/admin-requests', async (req, res, next) => {
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
  router.post('/portal-notifications', async (req, res, next) => {
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
  router.get('/portal-notifications/admin-log', async (_req, res, next) => {
    try {
      const r = await pool.query(
        `SELECT * FROM public.portal_notifications ORDER BY created_at DESC LIMIT 100`
      );
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  router.get('/portal-notifications', async (req, res, next) => {
    try {
      const { portalType, recipientId } = req.query;
      // Return both targeted and broadcast messages for this portal type
      const r = await pool.query(
        `SELECT * FROM public.portal_notifications
         WHERE portal_type=$1 AND (recipient_id=$2 OR recipient_id='broadcast')
         ORDER BY created_at DESC LIMIT 50`,
        [portalType, recipientId]
      );
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  router.patch('/portal-notifications/:id/read', async (req, res, next) => {
    try {
      await pool.query('UPDATE public.portal_notifications SET is_read=TRUE WHERE id=$1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // Admin: delete a notification by id (removes from both sides)
  router.delete('/portal-notifications/:id', async (req, res, next) => {
    try {
      await pool.query('DELETE FROM public.portal_notifications WHERE id=$1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // Admin: delete all notifications sent by a specific sender_name
  router.delete('/portal-notifications', async (req, res, next) => {
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

      // Check if drug already in this pharmacy's stock
      const existing = await pool.query(
        'SELECT id, quantity FROM public.pharmacy_stock WHERE pharmacy_id=$1 AND drug_id=$2 LIMIT 1',
        [req.params.id, drugId]
      );
      let result;
      if (existing.rows.length) {
        result = await pool.query(
          'UPDATE public.pharmacy_stock SET quantity=quantity+$1, selling_price=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
          [qty, price, existing.rows[0].id]
        );
      } else {
        result = await pool.query(
          'INSERT INTO public.pharmacy_stock (pharmacy_id, drug_id, quantity, selling_price, currency, reorder_level) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
          [req.params.id, drugId, qty, price, body.currency || 'IQD', reorderLvl]
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
  app.use(notFoundHandler);
  app.use(errorHandler);

  const port = parseInt(process.env.PORT || '8005', 10);
  app.listen(port, () => console.log(`Pharmacy service running on :${port}`));
}

bootstrap().catch(console.error);
