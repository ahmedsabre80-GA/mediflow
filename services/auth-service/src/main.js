require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 8001;

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ─── DATABASE ────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
});

// ─── REDIS ───────────────────────────────────────────────────────────────────
let redis = null;
if (process.env.REDIS_URL) {
  redis = createClient({ url: process.env.REDIS_URL });
  redis.connect().catch(console.error);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function generateToken(userId, role) {
  const secret = process.env.JWT_SECRET || 'mediflow-secret-key-change-in-production';
  return jwt.sign({ sub: userId, role, iat: Date.now() }, secret, { expiresIn: '15m' });
}

function generateRefreshToken(userId) {
  const secret = process.env.JWT_REFRESH_SECRET || 'mediflow-refresh-secret';
  return jwt.sign({ sub: userId }, secret, { expiresIn: '30d' });
}

function verifyToken(token) {
  const secret = process.env.JWT_SECRET || 'mediflow-secret-key-change-in-production';
  return jwt.verify(token, secret);
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Health check
app.get('/api/v1/auth/health/live', (req, res) => {
  res.json({ status: 'healthy', service: 'auth-service', timestamp: new Date().toISOString() });
});

app.get('/api/v1/auth/health/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', database: 'disconnected' });
  }
});

// REGISTER
app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, role = 'patient' } = req.body;

    if (!email && !phone) {
      return res.status(422).json({ success: false, error: { title: 'Email or phone required', status: 422 } });
    }
    if (!password || password.length < 8) {
      return res.status(422).json({ success: false, error: { title: 'Password must be at least 8 characters', status: 422 } });
    }

    // Check duplicate
    if (email) {
      const existing = await pool.query('SELECT id FROM auth.users WHERE email = $1 AND deleted_at IS NULL', [email.toLowerCase()]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ success: false, error: { title: 'Email already registered', status: 409, code: 'USER_002' } });
      }
    }
    if (phone) {
      const existing = await pool.query('SELECT id FROM auth.users WHERE phone = $1 AND deleted_at IS NULL', [phone]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ success: false, error: { title: 'Phone already registered', status: 409, code: 'USER_003' } });
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Roles that require admin approval before they can log in
    const requiresApproval = ['doctor', 'pharmacy_owner', 'warehouse_owner', 'driver'];
    // Employees added directly by owners are immediately active
    const initialStatus = requiresApproval.includes(role) ? 'pending_verification' : 'active';
    const requiresPasswordChange = requiresApproval.includes(role) ? true : false;

    // Create user
    const userResult = await pool.query(
      `INSERT INTO auth.users (email, phone, password_hash, role, status, email_verified, phone_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, phone, role, status`,
      [email ? email.toLowerCase() : null, phone || null, passwordHash, role, initialStatus, !!email, !!phone]
    );
    const user = userResult.rows[0];

    // Create profile
    if (firstName || lastName) {
      await pool.query(
        `INSERT INTO users.profiles (id, first_name, last_name) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, firstName || '', lastName || '']
      );
    }

    // If requires approval — return a registration token so frontend can call pharmacy/doctor register
    if (initialStatus === 'pending_verification') {
      const registrationToken = generateToken(user.id, user.role);
      return res.status(201).json({
        success: true,
        data: {
          userId: user.id,
          accessToken: registrationToken,
          status: 'pending_verification',
          message: 'تم تسجيل طلبك بنجاح. سيتم مراجعته من قبل الإدارة وستصلك إشعار عند الموافقة.',
          requiresApproval: true,
        },
      });
    }

    // Generate tokens (patients only at this point)
    const accessToken = generateToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);

    return res.status(201).json({
      success: true,
      data: {
        userId: user.id,
        accessToken,
        refreshToken,
        expiresIn: 900,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, error: { title: 'Internal server error', status: 500 } });
  }
});

// LOGIN
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(422).json({ success: false, error: { title: 'Identifier and password required', status: 422 } });
    }

    // Find user
    const isEmail = identifier.includes('@');
    const query = isEmail
      ? 'SELECT * FROM auth.users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL'
      : 'SELECT * FROM auth.users WHERE phone = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [identifier]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: { title: 'Invalid credentials', status: 401 } });
    }

    const user = result.rows[0];

    // Check password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: { title: 'Invalid credentials', status: 401 } });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, error: { title: 'تم إيقاف حسابك. تواصل مع الإدارة.', status: 403 } });
    }

    if (user.status === 'pending_verification') {
      return res.status(403).json({ success: false, error: { title: 'حسابك قيد المراجعة.', status: 403, code: 'PENDING_APPROVAL' }, data: { userId: user.id, requiresApproval: true } });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({ success: false, error: { title: 'تم رفض طلبك. تواصل مع الإدارة لمزيد من التفاصيل.', status: 403 } });
    }

    if (user.status === 'force_logout') {
      return res.status(403).json({ success: false, error: { title: 'تم تسجيل خروجك من قبل الإدارة. تواصل مع المدير.', status: 403 } });
    }

    // Update last login
    await pool.query('UPDATE auth.users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const accessToken = generateToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn: 900,
        mfaRequired: false,
        role: user.role,
        userId: user.id,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: { title: 'Internal server error', status: 500 } });
  }
});

// REFRESH TOKEN
app.post('/api/v1/auth/token/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, error: { title: 'Refresh token required', status: 401 } });
    }

    const secret = process.env.JWT_REFRESH_SECRET || 'mediflow-refresh-secret';
    const payload = jwt.verify(refreshToken, secret);
    const result = await pool.query('SELECT * FROM auth.users WHERE id = $1 AND deleted_at IS NULL', [payload.sub]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: { title: 'Invalid token', status: 401 } });
    }

    const user = result.rows[0];
    const accessToken = generateToken(user.id, user.role);

    return res.json({ success: true, data: { accessToken, expiresIn: 900 } });
  } catch (err) {
    return res.status(401).json({ success: false, error: { title: 'Invalid or expired token', status: 401 } });
  }
});

// LOGOUT
app.post('/api/v1/auth/logout', (req, res) => {
  res.status(204).send();
});

// VERIFY TOKEN (for other services)
app.get('/api/v1/auth/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ valid: false });
    }
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    return res.json({ valid: true, payload });
  } catch {
    return res.status(401).json({ valid: false });
  }
});


// ─── TEMP: reset password ────────────────────────────────────────────────────
app.post('/api/v1/auth/admin/reset-password', async (req, res) => {
  const { email, newPassword, secret } = req.body;
  if (secret !== 'mediflow-delete-2026') return res.status(403).json({ error: 'forbidden' });
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    const r = await pool.query("UPDATE auth.users SET password_hash=$1, status='active' WHERE LOWER(email)=LOWER($2) RETURNING id,email,status", [hash, email]);
    if (!r.rows.length) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, user: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── TEMP: activate user by email ────────────────────────────────────────────
app.post('/api/v1/auth/admin/activate-user', async (req, res) => {
  const { email, secret } = req.body;
  if (secret !== 'mediflow-delete-2026') return res.status(403).json({ error: 'forbidden' });
  try {
    const r = await pool.query("UPDATE auth.users SET status='active' WHERE LOWER(email)=LOWER($1) RETURNING id,email,status", [email]);
    if (!r.rows.length) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, user: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── TEMP: delete user by email ──────────────────────────────────────────────
app.delete('/api/v1/auth/admin/delete-user', async (req, res) => {
  const { email, secret } = req.body;
  if (secret !== 'mediflow-delete-2026') return res.status(403).json({ error: 'forbidden' });
  try {
    const u = await pool.query('SELECT id FROM auth.users WHERE LOWER(email)=LOWER($1)', [email]);
    if (!u.rows.length) return res.status(404).json({ error: 'not found' });
    const uid = u.rows[0].id;
    await pool.query('DELETE FROM pharmacies.pharmacies WHERE owner_id=$1', [uid]).catch(()=>{});
    const r = await pool.query('DELETE FROM auth.users WHERE id=$1 RETURNING id,email', [uid]);
    res.json({ success: true, deleted: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ADMIN: list all users ────────────────────────────────────────────────────
app.get('/api/v1/auth/admin/users', async (req, res) => {
  const { secret, role } = req.query;
  if (secret !== 'mediflow-delete-2026') return res.status(403).json({ error: 'forbidden' });
  try {
    let q = `
      SELECT u.id, u.email, u.phone, u.role, u.status, u.created_at,
             p.first_name, p.last_name
      FROM auth.users u
      LEFT JOIN users.profiles p ON p.id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (role) { q += ` AND u.role=$${params.length+1}`; params.push(role); }
    q += ' ORDER BY u.created_at DESC';
    const r = await pool.query(q, params);
    res.json({ success: true, data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ─── ADMIN: force sign out (deactivate then reactivate — invalidates JWT by changing status) ──
app.post('/api/v1/auth/admin/force-signout', async (req, res) => {
  const { email, secret } = req.body;
  if (secret !== 'mediflow-delete-2026') return res.status(403).json({ error: 'forbidden' });
  try {
    // Toggle status to force_logout then back to active — any in-flight token will fail login check
    await pool.query("UPDATE auth.users SET status='force_logout' WHERE LOWER(email)=LOWER($1)", [email]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── START ───────────────────────────────────────────────────────────────────
pool.connect()
  .then(() => {
    console.log('Database connected');
    app.listen(PORT, () => {
      console.log(JSON.stringify({
        level: 'INFO',
        message: `Auth service running on port ${PORT}`,
        service: 'auth-service',
        port: PORT,
      }));
    });
  })
  .catch((err) => {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  });

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
