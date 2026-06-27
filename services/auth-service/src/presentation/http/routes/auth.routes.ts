import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { AuthController } from '../controllers/AuthController';

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  message: { success: false, error: { title: 'Too Many Requests', status: 429, detail: 'Too many login attempts' } },
});

const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,
  message: { success: false, error: { title: 'Too Many Requests', status: 429, detail: 'Too many registration attempts' } },
});

export function createAuthRoutes(controller: AuthController): Router {
  const router = Router();

  // Public routes
  router.post('/register', registerRateLimit, controller.register);
  router.post('/login', loginRateLimit, controller.login);
  router.post('/otp/verify', controller.verifyOtp);
  router.post('/token/refresh', controller.refreshToken);
  router.post('/logout', controller.logout);
  router.post('/password/reset/request', loginRateLimit, controller.requestPasswordReset);
  router.post('/password/reset/confirm', controller.confirmPasswordReset);
  router.get('/health/live', controller.health);
  router.get('/health/ready', controller.health);

  return router;
}
