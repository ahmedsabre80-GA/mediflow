import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Pool } from 'pg';
import {
  traceIdMiddleware,
  requestLogger,
  errorHandler,
  notFoundHandler,
  authenticate,
  requireRole,
} from '@mediflow/shared-middleware';
import { Router } from 'express';

async function bootstrap() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
  await pool.connect().then((c) => { console.log('PostgreSQL connected'); c.release(); });

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || '').split(','), credentials: true }));
  app.use(express.json({ limit: '50mb' }));
  app.use(traceIdMiddleware);
  app.use(requestLogger);

  const router = Router();

  // ─── PLATFORM SETTINGS (public read, admin write) ──────────────────
  router.get('/settings', async (_req, res, next) => {
    try {
      const result = await pool.query('SELECT key, value FROM public.platform_settings');
      const settings: Record<string, any> = {};
      result.rows.forEach(r => { settings[r.key] = r.value === 'true'; });
      res.json({ success: true, data: settings });
    } catch (err) { next(err); }
  });

  router.patch('/settings', authenticate, requireRole('admin', 'super_admin'), async (req, res, next) => {
    try {
      const allowed = ['require_certificate', 'log_admin_actions'];
      for (const [key, value] of Object.entries(req.body)) {
        if (!allowed.includes(key)) continue;
        await pool.query(
          'INSERT INTO public.platform_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
          [key, String(value)]
        );
      }
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ─── REGISTER FULL (atomic: user + pharmacy in one request) ────────
  router.post('/register-full', async (req, res, next) => {
    const client = await pool.connect();
    try {
      const b = req.body;
      // Check require_certificate setting
      const settingRow = await client.query("SELECT value FROM public.platform_settings WHERE key='require_certificate'");
      const requireCert = settingRow.rows[0]?.value === 'true';
      if (requireCert && !b.certificateData) {
        return res.status(422).json({ success: false, error: { title: 'يجب رفع شهادة التسجيل', status: 422 } });
      }

      await client.query('BEGIN');

      // 1. Create user via auth service
      const AUTH_URL = process.env.AUTH_SERVICE_URL || 'https://mediflowauth-service-production.up.railway.app';
      const authRes = await fetch(`${AUTH_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: b.firstName,
          lastName: b.lastName || b.firstName,
          email: b.email,
          phone: b.phone,
          password: b.password,
          role: 'pharmacy_owner',
        }),
      });
      const authData: any = await authRes.json();

      let userId: string;
      if (!authRes.ok) {
        // If email exists, try to get the user id via a lookup
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

      // 2. Create pharmacy
      const phRes = await client.query(`
        INSERT INTO pharmacies.pharmacies
          (owner_id, name, name_ar, license_number, license_expiry, phone, address, city, country, certificate_data)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id, name, status
      `, [
        userId,
        b.name || b.nameAr,
        b.nameAr || b.name,
        b.licenseNumber?.trim(),
        b.licenseExpiry,
        b.pharmacyPhone?.trim() || b.phone,
        b.address?.trim(),
        b.city?.trim(),
        b.country || 'IQ',
        b.certificateData || null,
      ]);

      // 3. Store certificate separately if provided
      if (b.certificateData) {
        await client.query(
          'INSERT INTO public.registration_certificates (user_id, certificate_data, entity_type) VALUES ($1,$2,$3)',
          [userId, b.certificateData, 'pharmacy']
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: phRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  });

  // ─── PUBLIC ────────────────────────────────────────────────────────
  router.get('/nearby', async (req, res, next) => {
    try {
      const { lat, lng, radiusKm = 5, drugId } = req.query;
      const result = await pool.query(`
        SELECT p.id, p.name, p.name_ar, p.phone, p.rating, p.delivery_fee,
               ST_Distance(p.location, ST_MakePoint($2,$1)::geography) / 1000 AS distance_km
        FROM pharmacies.pharmacies p
        LEFT JOIN inventory.pharmacy_stock s ON s.pharmacy_id = p.id AND ($3::uuid IS NULL OR s.drug_id = $3::uuid)
        WHERE p.status = 'active'
          AND ST_DWithin(p.location, ST_MakePoint($2,$1)::geography, $4::float * 1000)
        ORDER BY distance_km ASC
        LIMIT 20
      `, [lat, lng, drugId || null, radiusKm]);
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const result = await pool.query(
        'SELECT * FROM pharmacies.pharmacies WHERE id = $1 AND status != $2',
        [req.params.id, 'deleted'],
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false });
      res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
  });

  // ─── PROTECTED ─────────────────────────────────────────────────────
  router.post('/register', authenticate, async (req, res, next) => {
    try {
      const body = req.body;
      const result = await pool.query(`
        INSERT INTO pharmacies.pharmacies
          (owner_id, name, name_ar, license_number, license_expiry, phone, email, address, city, country)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id, name, status
      `, [
        req.user!.sub, body.name, body.nameAr, body.licenseNumber, body.licenseExpiry,
        body.phone, body.email, body.address, body.city, body.country || 'IQ',
      ]);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
  });

  router.get('/:id/inventory', authenticate, async (req, res, next) => {
    try {
      const { search, lowStock, nearExpiry, page = 1, limit = 20 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);
      const result = await pool.query(`
        SELECT s.*, d.generic_name, d.brand_name, d.requires_prescription
        FROM inventory.pharmacy_stock s
        JOIN products.drugs d ON d.id = s.drug_id
        WHERE s.pharmacy_id = $1
          AND ($2::text IS NULL OR d.generic_name ILIKE $2 OR d.brand_name ILIKE $2)
          AND ($3::boolean IS NULL OR (s.quantity - s.reserved_qty) <= s.reorder_level)
        ORDER BY d.generic_name
        LIMIT $4 OFFSET $5
      `, [req.params.id, search ? `%${search}%` : null, lowStock || null, limit, offset]);
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  router.post('/:id/inventory', authenticate, requireRole('pharmacy_manager', 'pharmacy_pharmacist', 'admin'), async (req, res, next) => {
    try {
      const body = req.body;
      const result = await pool.query(`
        INSERT INTO inventory.pharmacy_stock
          (pharmacy_id, drug_id, quantity, selling_price, currency, reorder_level)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (pharmacy_id, drug_id, branch_id) DO UPDATE
          SET quantity = EXCLUDED.quantity, selling_price = EXCLUDED.selling_price, updated_at = NOW()
        RETURNING *
      `, [req.params.id, body.drugId, body.quantity, body.sellingPrice, body.currency || 'IQD', body.reorderLevel || 10]);
      res.status(201).json({ success: true, data: result.rows[0] });
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
        pool.query(`
          SELECT COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue
          FROM orders.orders WHERE pharmacy_id = $1 AND DATE(created_at) = CURRENT_DATE AND status = 'delivered'
        `, [req.params.id]),
        pool.query(`
          SELECT COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue
          FROM orders.orders WHERE pharmacy_id = $1
            AND created_at >= DATE_TRUNC('month', NOW()) AND status = 'delivered'
        `, [req.params.id]),
      ]);
      res.json({ success: true, data: { today: todayResult.rows[0], thisMonth: monthResult.rows[0] } });
    } catch (err) { next(err); }
  });

  router.get('/health/live', (_req, res) => res.json({ status: 'healthy' }));
  router.get('/health/ready', (_req, res) => res.json({ status: 'ready' }));

  app.use('/api/v1/pharmacies', router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const port = parseInt(process.env.PORT || '8005', 10);
  app.listen(port, () => console.log(`Pharmacy service running on :${port}`));
}

bootstrap().catch(console.error);
