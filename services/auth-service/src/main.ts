import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { Kafka } from 'kafkajs';
import {
  traceIdMiddleware,
  requestLogger,
  errorHandler,
  notFoundHandler,
} from '@mediflow/shared-middleware';
import { PostgresUserRepository } from './infrastructure/database/repositories/PostgresUserRepository';
import { RegisterUserUseCase } from './application/use-cases/RegisterUser';
import { LoginUserUseCase } from './application/use-cases/LoginUser';
import { AuthController } from './presentation/http/controllers/AuthController';
import { createAuthRoutes } from './presentation/http/routes/auth.routes';

async function bootstrap() {
  // ─── DATABASE ───────────────────────────────────────────────────────
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  await pool.connect().then((client) => {
    console.log('PostgreSQL connected');
    client.release();
  });

  // ─── REDIS ──────────────────────────────────────────────────────────
  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();
  console.log('Redis connected');

  // ─── KAFKA ──────────────────────────────────────────────────────────
  const kafka = new Kafka({
    clientId: 'auth-service',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  });
  const producer = kafka.producer();
  await producer.connect();
  console.log('Kafka producer connected');

  // ─── REPOSITORIES ───────────────────────────────────────────────────
  const userRepository = new PostgresUserRepository(pool);

  // ─── SERVICES (adapters) ────────────────────────────────────────────
  // In production these are separate classes; simplified here for skeleton
  const otpService = {
    sendVerification: async (userId: string, method: string, dest: string) => {
      console.log(`OTP: send ${method} to ${dest} for user ${userId}`);
    },
  };
  const eventBus = {
    publish: async (topic: string, event: unknown) => {
      await producer.send({
        topic,
        messages: [{ key: (event as any).payload?.userId, value: JSON.stringify(event) }],
      });
    },
  };
  const profileService = {
    createProfile: async (data: { userId: string; firstName: string; lastName: string }) => {
      // Call user-service via HTTP or save directly
      console.log('Creating profile for', data.userId);
    },
  };
  const tokenService = {
    signAccessToken: async (payload: Record<string, unknown>) => {
      // Real implementation uses RS256 private key
      return 'access-token-placeholder';
    },
    getPermissionsForRole: async (role: string) => {
      return [`${role}:read`, `${role}:write`];
    },
  };
  const refreshTokenRepository = {
    create: async (data: { userId: string; deviceId?: string; ipAddress: string }) => {
      const token = crypto.randomUUID();
      await redis.setEx(`refresh:${token}`, 30 * 24 * 3600, JSON.stringify(data));
      return token;
    },
  };
  const mfaService = {
    createMfaChallenge: async (userId: string) => `mfa-${userId}-${Date.now()}`,
  };
  const auditService = {
    log: async (entry: unknown) => {
      await producer.send({
        topic: 'platform.audit.action',
        messages: [{ value: JSON.stringify(entry) }],
      });
    },
  };

  // ─── USE CASES ──────────────────────────────────────────────────────
  const registerUseCase = new RegisterUserUseCase(
    userRepository,
    otpService as any,
    eventBus,
    profileService as any,
  );
  const loginUseCase = new LoginUserUseCase(
    userRepository,
    tokenService as any,
    refreshTokenRepository as any,
    mfaService,
    auditService,
  );

  // ─── CONTROLLER ─────────────────────────────────────────────────────
  const authController = new AuthController(
    registerUseCase,
    loginUseCase,
    {} as any, {} as any, {} as any, {} as any,
  );

  // ─── EXPRESS APP ────────────────────────────────────────────────────
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: (process.env.ALLOWED_ORIGINS || '').split(','),
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(traceIdMiddleware);
  app.use(requestLogger);

  // Routes
  app.use('/api/v1/auth', createAuthRoutes(authController));

  // Temporary admin: activate a user account by email
  app.post('/api/v1/admin/activate-user', async (req: any, res: any) => {
    const secret = req.headers['x-admin-secret'];
    if (secret !== (process.env.ADMIN_SECRET || 'mediflow-admin-2026')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const r = await pool.query(
      `UPDATE users SET status='active' WHERE email=$1 RETURNING id, email, status`,
      [email]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: r.rows[0] });
  });

  // Error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  const port = parseInt(process.env.PORT || '8001', 10);
  const server = app.listen(port, () => {
    console.log(JSON.stringify({
      level: 'INFO',
      message: 'Auth service started',
      service: 'auth-service',
      port,
      env: process.env.NODE_ENV,
    }));
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close();
    await pool.end();
    await redis.disconnect();
    await producer.disconnect();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start auth-service:', err);
  process.exit(1);
});
