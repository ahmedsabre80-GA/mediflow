require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8010;

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false } : false,
  max: 10,
});

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

// Health
app.get('/api/v1/orders/health/live', (req, res) => {
  res.json({ status: 'healthy', service: 'order-service' });
});

// Create medication request
app.post('/api/v1/medication-requests', authenticate, async (req, res) => {
  try {
    const { items, prescriptionId, latitude, longitude, isEmergency = false, deliveryType = 'delivery', notes } = req.body;
    const patientId = req.user.sub;

    if (!items || items.length === 0) {
      return res.status(422).json({ success: false, error: { title: 'Items required', status: 422 } });
    }
    if (!latitude || !longitude) {
      return res.status(422).json({ success: false, error: { title: 'Location required', status: 422 } });
    }

    // Check active requests limit
    const activeCount = await pool.query(
      `SELECT COUNT(*) FROM orders.medication_requests WHERE patient_id = $1 AND status = 'searching'`,
      [patientId]
    );
    if (parseInt(activeCount.rows[0].count) >= 5) {
      return res.status(422).json({ success: false, error: { title: 'Maximum 5 active requests allowed', status: 422 } });
    }

    const requestId = uuidv4();
    await pool.query(`
      INSERT INTO orders.medication_requests
        (id, patient_id, prescription_id, is_emergency, latitude, longitude, status)
      VALUES ($1,$2,$3,$4,$5,$6,'searching')
    `, [requestId, patientId, prescriptionId || null, isEmergency, latitude, longitude]);

    // Insert request items
    for (const item of items) {
      await pool.query(`
        INSERT INTO orders.request_items (request_id, drug_id, quantity)
        VALUES ($1,$2,$3)
      `, [requestId, item.drugId, item.quantity]);
    }

    res.status(201).json({
      success: true,
      data: {
        requestId,
        status: 'searching',
        searchRadiusKm: 5,
        estimatedResponseTime: isEmergency ? '1-2 minutes' : '2-5 minutes',
      },
    });
  } catch (err) {
    console.error('Create request error:', err);
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// Get medication request
app.get('/api/v1/medication-requests/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders.medication_requests WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { title: 'Request not found', status: 404 } });
    }
    const items = await pool.query(
      'SELECT * FROM orders.request_items WHERE request_id = $1',
      [req.params.id]
    );
    res.json({ success: true, data: { ...result.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// Get patient orders
app.get('/api/v1/orders', authenticate, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const result = await pool.query(`
      SELECT o.*
      FROM orders.orders o
      WHERE o.patient_id = $1
        AND ($2::text IS NULL OR o.status = $2)
      ORDER BY o.created_at DESC
      LIMIT $3 OFFSET $4
    `, [req.user.sub, status || null, limit, offset]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// Get order by id
app.get('/api/v1/orders/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders.orders WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { title: 'Order not found', status: 404 } });
    }
    const items = await pool.query('SELECT * FROM orders.order_items WHERE order_id = $1', [req.params.id]);
    res.json({ success: true, data: { ...result.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// Cancel order
app.patch('/api/v1/orders/:id/cancel', authenticate, async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await pool.query(`
      UPDATE orders.orders SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $2, updated_at = NOW()
      WHERE id = $1 AND patient_id = $3 AND status IN ('pending_payment','confirmed','preparing')
      RETURNING *
    `, [req.params.id, reason || 'Cancelled by patient', req.user.sub]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { title: 'Order not found or cannot be cancelled', status: 404 } });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: { title: 'Server error', status: 500 } });
  }
});

// Start server
pool.connect()
  .then(() => {
    console.log('Database connected');
    app.listen(PORT, () => console.log(`Order service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });

process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });
