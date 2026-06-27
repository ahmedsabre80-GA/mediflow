// ─── SHARED TYPES — Used across all microservices ────────────────────────────

export type UUID = string;
export type Currency = 'IQD' | 'USD' | 'EUR' | 'SAR' | 'AED';
export type Language = 'ar' | 'en' | 'ku' | 'tr';

// ─── USER & AUTH ─────────────────────────────────────────────────────────────

export type UserRole =
  | 'patient'
  | 'doctor'
  | 'pharmacy_owner'
  | 'pharmacy_manager'
  | 'pharmacy_pharmacist'
  | 'pharmacy_cashier'
  | 'warehouse_owner'
  | 'warehouse_manager'
  | 'driver'
  | 'admin'
  | 'super_admin'
  | 'auditor'
  | 'support';

export type AccountStatus =
  | 'pending_verification'
  | 'active'
  | 'suspended'
  | 'rejected'
  | 'deleted';

export interface JwtPayload {
  sub: UUID;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  role: UserRole;
  permissions: string[];
  pharmacyId?: UUID;
  warehouseId?: UUID;
  tenantId?: UUID;
  deviceId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ─── PAGINATION ───────────────────────────────────────────────────────────────

export interface PaginationParams {
  cursor?: string;
  limit?: number;
  page?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    cursor?: string;
    hasMore: boolean;
  };
}

// ─── API RESPONSE ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance: string;
    errors?: { field: string; message: string }[];
    traceId: string;
  };
}

// ─── GEOLOCATION ──────────────────────────────────────────────────────────────

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Address extends Coordinates {
  fullAddress: string;
  city?: string;
  country?: string;
  label?: string;
}

// ─── MONEY ────────────────────────────────────────────────────────────────────

export interface Money {
  amount: number;
  currency: Currency;
}

// ─── PHARMACY ─────────────────────────────────────────────────────────────────

export type PharmacyStatus =
  | 'pending_verification'
  | 'active'
  | 'suspended'
  | 'rejected';

export interface PharmacyPublicProfile {
  id: UUID;
  name: string;
  nameAr?: string;
  address: string;
  coordinates: Coordinates;
  phone: string;
  rating: number;
  totalReviews: number;
  isOpen: boolean;
  deliveryFee: Money;
  operatingHours: OperatingHours;
  frontImageUrl?: string;
  distanceKm?: number;
}

export interface OperatingHours {
  saturday?: DayHours;
  sunday?: DayHours;
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
}

export interface DayHours {
  open: string;  // HH:mm
  close: string; // HH:mm
  isClosed?: boolean;
}

// ─── ORDERS ──────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type MedicationRequestStatus =
  | 'searching'
  | 'offers_received'
  | 'offer_selected'
  | 'cancelled'
  | 'expired';

export interface OrderItem {
  drugId: UUID;
  drugName: string;
  quantity: number;
  unitPrice: Money;
  totalPrice: Money;
}

// ─── PRESCRIPTIONS ───────────────────────────────────────────────────────────

export type PrescriptionStatus =
  | 'active'
  | 'partially_dispensed'
  | 'fully_dispensed'
  | 'expired'
  | 'revoked';

export interface PrescriptionItem {
  drugId: UUID;
  drugName: string;
  dosage: string;
  frequency: string;
  duration?: string;
  quantity?: number;
  instructions?: string;
  isDispensed: boolean;
}

// ─── DRUG INTERACTIONS ───────────────────────────────────────────────────────

export type InteractionSeverity = 'minor' | 'moderate' | 'major' | 'contraindicated';

export interface DrugInteraction {
  drugAId: UUID;
  drugAName: string;
  drugBId: UUID;
  drugBName: string;
  severity: InteractionSeverity;
  description: string;
  recommendation: string;
}

export interface InteractionCheckResult {
  interactions: DrugInteraction[];
  overallSeverity: InteractionSeverity | 'none';
  hasCritical: boolean;
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

export type NotificationType =
  | 'order_confirmed'
  | 'order_preparing'
  | 'order_ready'
  | 'order_in_transit'
  | 'order_delivered'
  | 'order_cancelled'
  | 'driver_assigned'
  | 'driver_nearby'
  | 'prescription_issued'
  | 'prescription_expiring'
  | 'appointment_reminder'
  | 'medication_request_offer'
  | 'pharmacy_approved'
  | 'pharmacy_suspended'
  | 'low_stock_alert'
  | 'expiry_alert'
  | 'campaign_message'
  | 'loyalty_points_earned';

export interface NotificationPayload {
  type: NotificationType;
  recipientId: UUID;
  title: string;
  titleAr?: string;
  body: string;
  bodyAr?: string;
  data?: Record<string, unknown>;
  channels: ('push' | 'sms' | 'email' | 'in_app')[];
}

// ─── KAFKA EVENTS ────────────────────────────────────────────────────────────

export interface KafkaEvent<T = unknown> {
  eventId: UUID;
  eventType: string;
  version: string;
  timestamp: string; // ISO 8601
  source: string;    // service name
  payload: T;
  metadata?: Record<string, unknown>;
}

// Domain Events
export interface UserRegisteredEvent {
  userId: UUID;
  email?: string;
  phone?: string;
  role: UserRole;
}

export interface PharmacyApprovedEvent {
  pharmacyId: UUID;
  ownerId: UUID;
  pharmacyName: string;
}

export interface OrderCreatedEvent {
  orderId: UUID;
  patientId: UUID;
  pharmacyId: UUID;
  totalAmount: Money;
  items: OrderItem[];
}

export interface OrderConfirmedEvent {
  orderId: UUID;
  patientId: UUID;
  pharmacyId: UUID;
  estimatedDeliveryMin: number;
}

export interface PaymentProcessedEvent {
  orderId: UUID;
  transactionId: UUID;
  amount: Money;
  status: 'success' | 'failed';
}

export interface DeliveryCompletedEvent {
  deliveryId: UUID;
  orderId: UUID;
  driverId: UUID;
  patientId: UUID;
  pharmacyId: UUID;
  completedAt: string;
}

export interface PrescriptionIssuedEvent {
  prescriptionId: UUID;
  doctorId: UUID;
  patientId: UUID;
  medications: string[];
  expiresAt: string;
}

export interface InventoryLowStockEvent {
  pharmacyId: UUID;
  drugId: UUID;
  drugName: string;
  currentQuantity: number;
  reorderLevel: number;
}
