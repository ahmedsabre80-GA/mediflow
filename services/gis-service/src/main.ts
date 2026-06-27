import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { createServer } from 'http';
import { Server } from 'socket.io';
import {
  traceIdMiddleware,
  requestLogger,
  errorHandler,
  notFoundHandler,
  authenticate,
} from '@mediflow/shared-middleware';

async function bootstrap() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
  await pool.connect().then((c) => { console.log('PostgreSQL + PostGIS connected'); c.release(); });

  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();

  const app = express();
  const httpServer = createServer(app);

  // WebSocket server for real-time driver tracking
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket'],
  });

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(traceIdMiddleware);
  app.use(requestLogger);

  // ─── GET NEARBY PHARMACIES ─────────────────────────────────────────
  app.get('/api/v1/gis/pharmacies/nearby', async (req, res, next) => {
    try {
      const { lat, lng, radiusKm = '5', drugId, limit = '20' } = req.query;

      // Cache key for common queries
      const cacheKey = `gis:pharmacies:${lat}:${lng}:${radiusKm}:${drugId}`;
      const cached = await redis.get(cacheKey);
      if (cached) return res.json({ success: true, data: JSON.parse(cached), cached: true });

      const result = await pool.query(`
        SELECT
          p.id,
          p.name,
          p.name_ar,
          p.phone,
          p.rating,
          p.total_reviews,
          p.delivery_fee,
          p.operating_hours,
          p.front_image_url,
          ST_Distance(p.location, ST_MakePoint($2,$1)::geography) / 1000 AS distance_km,
          ST_AsGeoJSON(p.location)::json AS coordinates
        FROM pharmacies.pharmacies p
        WHERE p.status = 'active'
          AND ST_DWithin(p.location, ST_MakePoint($2,$1)::geography, $3::float * 1000)
          AND ($4::uuid IS NULL OR EXISTS (
            SELECT 1 FROM inventory.pharmacy_stock s
            WHERE s.pharmacy_id = p.id AND s.drug_id = $4::uuid AND s.is_available = true
          ))
        ORDER BY distance_km ASC
        LIMIT $5
      `, [lat, lng, radiusKm, drugId || null, limit]);

      await redis.setEx(cacheKey, 60, JSON.stringify(result.rows)); // cache 60s
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  // ─── ROUTE OPTIMIZATION ────────────────────────────────────────────
  app.get('/api/v1/gis/route', async (req, res, next) => {
    try {
      const { fromLat, fromLng, toLat, toLng } = req.query;
      // In production: call OSRM or Mapbox Directions API
      const distanceKm = calculateHaversine(
        Number(fromLat), Number(fromLng),
        Number(toLat), Number(toLng),
      );
      const etaMin = Math.ceil((distanceKm / 30) * 60); // 30 km/h average
      res.json({
        success: true,
        data: {
          distanceKm: distanceKm.toFixed(2),
          durationMin: etaMin,
          polyline: null, // OSRM returns encoded polyline
        },
      });
    } catch (err) { next(err); }
  });

  // ─── DRIVER LOCATION UPDATE ────────────────────────────────────────
  app.patch('/api/v1/gis/drivers/:driverId/location', authenticate, async (req, res, next) => {
    try {
      const { driverId } = req.params;
      const { latitude, longitude, heading, speedKmh } = req.body;

      const locationData = { latitude, longitude, heading, speedKmh, timestamp: Date.now() };

      // Store in Redis with 30s TTL
      await redis.setEx(`driver:${driverId}:position`, 30, JSON.stringify(locationData));

      // Emit to any active delivery room
      io.to(`driver:${driverId}`).emit('location:updated', locationData);

      res.status(204).send();
    } catch (err) { next(err); }
  });

  // ─── GET ACTIVE DRIVER LOCATION ───────────────────────────────────
  app.get('/api/v1/gis/drivers/:driverId/location', authenticate, async (req, res, next) => {
    try {
      const data = await redis.get(`driver:${req.params.driverId}:position`);
      if (!data) return res.status(404).json({ success: false, error: { title: 'Driver location not found' } });
      res.json({ success: true, data: JSON.parse(data) });
    } catch (err) { next(err); }
  });

  // ─── DEMAND HEATMAP (admin) ────────────────────────────────────────
  app.get('/api/v1/gis/heatmap/demand', authenticate, async (req, res, next) => {
    try {
      const { from, to } = req.query;
      const result = await pool.query(`
        SELECT
          ROUND(delivery_latitude::numeric, 2) AS lat,
          ROUND(delivery_longitude::numeric, 2) AS lng,
          COUNT(*) AS weight
        FROM orders.orders
        WHERE created_at BETWEEN $1 AND $2
          AND delivery_latitude IS NOT NULL
        GROUP BY 1, 2
        ORDER BY weight DESC
        LIMIT 500
      `, [from || '2024-01-01', to || new Date().toISOString()]);
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  app.get('/api/v1/gis/health/live', (_req, res) => res.json({ status: 'healthy' }));

  // ─── WEBSOCKET — DELIVERY TRACKING ────────────────────────────────
  io.on('connection', (socket) => {
    socket.on('track:delivery', async (deliveryId: string) => {
      socket.join(`delivery:${deliveryId}`);
    });
    socket.on('driver:online', (driverId: string) => {
      socket.join(`driver:${driverId}`);
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  const port = parseInt(process.env.PORT || '8017', 10);
  httpServer.listen(port, () => console.log(`GIS service running on :${port}`));

  process.on('SIGTERM', async () => {
    await pool.end();
    await redis.disconnect();
    process.exit(0);
  });
}

function calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

bootstrap().catch(console.error);
