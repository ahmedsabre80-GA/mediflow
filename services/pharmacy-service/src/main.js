require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8005;

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false } : false,
  max: 10,
});

// Auth middleware
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { title: 'Unauthorized', status: 401 } });
  }
  try {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'mediflow-secret-key-change-in-production';
    req.user = jwt.verify(auth.slice(7), secret);
    next();
  } catch {
    return res.status(401).json({ success: false, error: { title: 'Invalid token', status: 401 } });
  }
}

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get('/api/v1/pharmacies/health/live', (req, res) => {
  res.json({ status: 'healthy', service: 'pharmacy-service' });
});

// ─── HAVERSINE DISTANCE (no PostGIS needed) ──────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── NEARBY PHARMACIES ───────────────────────────────────────────────────────
app.get('/api/v1/pharmacies/nearby', async (req, res) => {
  try {
    const { lat = 33.3152, lng = 44.3661, radiusKm = 10, limit = 20 } = req.query;
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const radius = parseFloat(radiusKm);
    const maxLimit = parseInt(limit);

    // Get all active pharmacies with coordinates
    const result = await pool.query(`
      SELECT id, name, name_ar, phone, address, city, latitude, longitude,
             rating, status
      FROM pharmacies.pharmacies
      WHERE status = 'active'
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
    `);

    // Calculate distance in JS (no PostGIS needed)
    const pharmaciesWithDistance = result.rows
      .map(p => ({
        ...p,
        distance_km: parseFloat(haversineKm(userLat, userLng, parseFloat(p.latitude), parseFloat(p.longitude)).toFixed(2))
      }))
      .filter(p => p.distance_km <= radius)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, maxLimit);

    res.json({ success: true, data: pharmaciesWithDistance });
  } catch (err) {
    console.error('Nearby error:', err);
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500, detail: err.message } });
  }
});

// ─── GET PHARMACY BY ID ───────────────────────────────────────────────────────
app.get('/api/v1/pharmacies/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM pharmacies.pharmacies WHERE id = $1 AND status != $2',
      [req.params.id, 'deleted']
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { title: 'Pharmacy not found', status: 404 } });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// ─── REGISTER PHARMACY ───────────────────────────────────────────────────────
// ─── REGISTER WITH EMAIL+PASSWORD (no JWT needed, for pending-approval users) ─
app.post('/api/v1/pharmacies/register-direct', async (req, res) => {
  try {
    const {
      email: userEmail, password,
      name, nameAr, licenseNumber, licenseExpiry, phone, email,
      address, city, country = 'IQ', latitude, longitude
    } = req.body;

    if (!userEmail || !password) {
      return res.status(422).json({ success: false, error: { title: 'البريد وكلمة المرور مطلوبة', status: 422 } });
    }

    // Look up the user by email and verify password
    const bcrypt = require('bcryptjs');
    const userResult = await pool.query(
      'SELECT id, password_hash, status FROM auth.users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
      [userEmail]
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: { title: 'البريد الإلكتروني أو كلمة المرور غير صحيحة', status: 401 } });
    }
    const user = userResult.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: { title: 'البريد الإلكتروني أو كلمة المرور غير صحيحة', status: 401 } });
    }

    const pharmacyName = name || nameAr;
    const expiry = licenseExpiry || '2027-12-31';
    if (!pharmacyName || !licenseNumber || !phone || !address) {
      return res.status(422).json({ success: false, error: { title: 'الاسم ورقم الرخصة والهاتف والعنوان مطلوبة', status: 422 } });
    }

    const result = await pool.query(`
      INSERT INTO pharmacies.pharmacies
        (owner_id, name, name_ar, license_number, license_expiry, phone, email, address, city, country, latitude, longitude, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending_verification')
      ON CONFLICT (license_number) DO NOTHING
      RETURNING id, name, name_ar, status
    `, [user.id, pharmacyName, nameAr || pharmacyName, licenseNumber, expiry, phone, email || null, address, city || '', country, latitude || null, longitude || null]);

    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, error: { title: 'رقم الرخصة مسجل مسبقاً', status: 409 } });
    }
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('register-direct error:', err.message);
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500, detail: err.message } });
  }
});

app.post('/api/v1/pharmacies/register', async (req, res) => {
  try {
    const {
      name, nameAr, licenseNumber, licenseExpiry, phone, email,
      address, city, country = 'IQ', latitude, longitude, userId
    } = req.body;

    // Resolve owner_id: from JWT or from userId in body (pending-approval flow)
    let ownerId = userId || null;
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const secret = process.env.JWT_SECRET || 'mediflow-secret-key-change-in-production';
        const decoded = jwt.verify(auth.slice(7), secret);
        ownerId = decoded.sub;
      } catch {
        // JWT invalid — fall back to userId in body
      }
    }
    if (!ownerId) {
      return res.status(401).json({ success: false, error: { title: 'Unauthorized', status: 401 } });
    }

    const pharmacyName = name || nameAr;
    const expiry = licenseExpiry || '2027-12-31';

    if (!pharmacyName || !licenseNumber || !phone || !address) {
      return res.status(422).json({ success: false, error: { title: 'الاسم ورقم الرخصة والهاتف والعنوان مطلوبة', status: 422 } });
    }

    const result = await pool.query(`
      INSERT INTO pharmacies.pharmacies
        (owner_id, name, name_ar, license_number, license_expiry, phone, email, address, city, country, latitude, longitude, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending_verification')
      RETURNING id, name, name_ar, status
    `, [ownerId, pharmacyName, nameAr || pharmacyName, licenseNumber, expiry, phone, email || null, address, city || '', country, latitude || null, longitude || null]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: { title: 'رقم الرخصة مسجل مسبقاً', status: 409 } });
    }
    console.error('Register error:', err.message, err.detail);
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500, detail: err.message } });
  }
});

// ─── GET PHARMACY INVENTORY ───────────────────────────────────────────────────
app.get('/api/v1/pharmacies/:id/inventory', authenticate, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const result = await pool.query(`
      SELECT s.*, d.generic_name, d.generic_name_ar, d.brand_name, d.requires_prescription
      FROM inventory.pharmacy_stock s
      JOIN products.drugs d ON d.id = s.drug_id
      WHERE s.pharmacy_id = $1
        AND ($2::text IS NULL OR d.generic_name ILIKE $2 OR d.brand_name ILIKE $2)
      ORDER BY d.generic_name
      LIMIT $3 OFFSET $4
    `, [req.params.id, search ? `%${search}%` : null, limit, offset]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// ─── ADD INVENTORY ────────────────────────────────────────────────────────────
app.post('/api/v1/pharmacies/:id/inventory', authenticate, async (req, res) => {
  try {
    const { drugId, quantity, sellingPrice, currency = 'IQD', reorderLevel = 10 } = req.body;
    const result = await pool.query(`
      INSERT INTO inventory.pharmacy_stock (pharmacy_id, drug_id, quantity, selling_price, currency, reorder_level)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (pharmacy_id, drug_id) DO UPDATE
        SET quantity = EXCLUDED.quantity, selling_price = EXCLUDED.selling_price, updated_at = NOW()
      RETURNING *
    `, [req.params.id, drugId, quantity, sellingPrice, currency, reorderLevel]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// ─── GET PHARMACY ORDERS ──────────────────────────────────────────────────────
app.get('/api/v1/pharmacies/:id/orders', authenticate, async (req, res) => {
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
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// ─── GET PHARMACY ANALYTICS ───────────────────────────────────────────────────
app.get('/api/v1/pharmacies/:id/analytics', authenticate, async (req, res) => {
  try {
    const [today, month] = await Promise.all([
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
    res.json({ success: true, data: { today: today.rows[0], thisMonth: month.rows[0] } });
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// ─── SEARCH DRUGS ─────────────────────────────────────────────────────────────
app.get('/api/v1/medications/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    if (!q || q.length < 2) {
      return res.json({ success: true, data: [] });
    }
    const result = await pool.query(`
      SELECT d.*, c.name as category_name, c.name_ar as category_name_ar
      FROM products.drugs d
      LEFT JOIN products.categories c ON c.id = d.category_id
      WHERE d.is_active = true
        AND (d.generic_name ILIKE $1 OR d.brand_name ILIKE $1 OR d.generic_name_ar ILIKE $1)
      ORDER BY d.generic_name
      LIMIT $2
    `, [`%${q}%`, limit]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// ─── GET ALL DRUGS ────────────────────────────────────────────────────────────
app.get('/api/v1/medications', async (req, res) => {
  try {
    const { category, limit = 50 } = req.query;
    const result = await pool.query(`
      SELECT d.*, c.name as category_name
      FROM products.drugs d
      LEFT JOIN products.categories c ON c.id = d.category_id
      WHERE d.is_active = true
        AND ($1::uuid IS NULL OR d.category_id = $1::uuid)
      ORDER BY d.generic_name
      LIMIT $2
    `, [category || null, limit]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// ─── GET CATEGORIES ───────────────────────────────────────────────────────────
app.get('/api/v1/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products.categories WHERE is_active = true ORDER BY sort_order');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// ─── START ───────────────────────────────────────────────────────────────────
pool.connect()
  .then(() => {
    console.log('Database connected');
    app.listen(PORT, () => console.log(`Pharmacy service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });

process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });
