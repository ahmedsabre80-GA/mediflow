import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { JwtPayload } from '@mediflow/shared-types';
import { AuthenticationError, AuthorizationError, AppError, ValidationError } from '@mediflow/shared-errors';

// ─── AUGMENT EXPRESS REQUEST ─────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      traceId: string;
    }
  }
}

// ─── TRACE ID MIDDLEWARE ──────────────────────────────────────────────────────
export function traceIdMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.traceId = (req.headers['x-trace-id'] as string) || uuidv4();
  next();
}

// ─── JWT AUTH MIDDLEWARE ──────────────────────────────────────────────────────
const publicKey = process.env.JWT_PUBLIC_KEY
  ? Buffer.from(process.env.JWT_PUBLIC_KEY, 'base64').toString()
  : process.env.JWT_PUBLIC_KEY_PATH
    ? readFileSync(process.env.JWT_PUBLIC_KEY_PATH, 'utf8')
    : '';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AuthenticationError('AUTH_001', 'Bearer token required'));
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: process.env.JWT_ISSUER || 'https://auth.mediflow.io',
    }) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AuthenticationError('AUTH_002', 'Token expired'));
    }
    return next(new AuthenticationError('AUTH_001', 'Invalid token'));
  }
}

// ─── OPTIONAL AUTH (does not fail if no token) ───────────────────────────────
export function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  authenticate(req, res, (err) => {
    if (err) return next(); // swallow auth errors for optional auth
    next();
  });
}

// ─── RBAC MIDDLEWARE ─────────────────────────────────────────────────────────
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AuthenticationError());
    if (!roles.includes(req.user.role)) {
      return next(new AuthorizationError(`Role '${req.user.role}' cannot access this resource`));
    }
    next();
  };
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AuthenticationError());
    if (!req.user.permissions.includes(permission) && req.user.role !== 'super_admin') {
      return next(new AuthorizationError(`Permission '${permission}' required`));
    }
    next();
  };
}

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const traceId = req.traceId || uuidv4();

  if (err instanceof AppError) {
    const response: Record<string, unknown> = {
      success: false,
      error: {
        type: `https://mediflow.io/errors/${err.code.toLowerCase().replace(/_/g, '-')}`,
        title: err.name,
        status: err.httpStatus,
        detail: err.message,
        instance: req.path,
        traceId,
      },
    };
    if (err instanceof ValidationError) {
      (response.error as Record<string, unknown>).errors = err.fieldErrors;
    }
    return res.status(err.httpStatus).json(response);
  }

  // Unexpected errors
  console.error({ err, traceId, path: req.path }, 'Unhandled error');
  return res.status(500).json({
    success: false,
    error: {
      type: 'https://mediflow.io/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred',
      instance: req.path,
      traceId,
    },
  });
}

// ─── REQUEST LOGGER ──────────────────────────────────────────────────────────
export function requestLogger(req: Request, res: Response, next: NextFunction) {
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
      userId: req.user?.sub,
    }));
  });
  next();
}

// ─── NOT FOUND HANDLER ───────────────────────────────────────────────────────
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      type: 'https://mediflow.io/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: `Route ${req.method} ${req.path} not found`,
      instance: req.path,
      traceId: req.traceId,
    },
  });
}
