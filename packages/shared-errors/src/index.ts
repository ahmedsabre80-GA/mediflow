// ─── SHARED ERROR CLASSES ────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly httpStatus: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fieldErrors: { field: string; message: string }[],
  ) {
    super('VAL_001', message, 422, { fieldErrors });
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(code = 'AUTH_001', message = 'Authentication required') {
    super(code, message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super('AUTH_003', message, 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', `${resource}${id ? ` (${id})` : ''} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(code, message, 409);
    this.name = 'ConflictError';
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, code: string) {
    super(code, message, 422);
    this.name = 'BusinessRuleError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super('AUTH_004', message, 429);
    this.name = 'RateLimitError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super('EXT_SERVICE_ERROR', `${service}: ${message}`, 502);
    this.name = 'ExternalServiceError';
  }
}

export class PaymentError extends AppError {
  constructor(message: string, code = 'PAY_001') {
    super(code, message, 402);
    this.name = 'PaymentError';
  }
}

// ─── ERROR CODES ─────────────────────────────────────────────────────────────
export const ErrorCodes = {
  // Auth
  AUTH_TOKEN_MISSING: 'AUTH_001',
  AUTH_TOKEN_EXPIRED: 'AUTH_002',
  AUTH_FORBIDDEN: 'AUTH_003',
  AUTH_RATE_LIMITED: 'AUTH_004',
  AUTH_MFA_REQUIRED: 'AUTH_005',
  // User
  USER_NOT_FOUND: 'USER_001',
  USER_EMAIL_EXISTS: 'USER_002',
  USER_PHONE_EXISTS: 'USER_003',
  // Order
  ORDER_NOT_FOUND: 'ORDER_001',
  ORDER_NO_PHARMACY: 'ORDER_002',
  ORDER_RX_REQUIRED: 'ORDER_003',
  ORDER_RESERVATION_FAILED: 'ORDER_004',
  // Payment
  PAYMENT_FAILED: 'PAY_001',
  PAYMENT_INSUFFICIENT_BALANCE: 'PAY_002',
  // Prescription
  RX_NOT_FOUND: 'RX_001',
  RX_EXPIRED: 'RX_002',
  RX_ALREADY_DISPENSED: 'RX_003',
  // Pharmacy
  PHARMACY_NOT_VERIFIED: 'PHARM_001',
  PHARMACY_CAMPAIGN_LIMIT: 'PHARM_002',
  // Validation
  VALIDATION_FAILED: 'VAL_001',
} as const;
